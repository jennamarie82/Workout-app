# Workout App

A personal workout tracker for a 3-day (A / B / C) gym program. Used one-handed
on an **iPhone** at the gym. For each workout the user records the **date**, and
for every set the **weight** and **reps** done, so progress can be tracked over time.

## Goals
- **User friendly above all.** Big tap targets, minimal typing, readable mid-workout.
- **Fast logging.** Pre-fill each set with the weight/reps from the last time that
  exercise was done, so most sets are a single "✓" tap.
- **See progress.** Per-exercise history (date, weight × reps) and simple trends.
- **Works offline.** Gym Wi-Fi/cell is unreliable; the app must work with no network.

## Tech decisions
- **Plain HTML + CSS + vanilla JavaScript.** No framework, no build step, no npm.
  Open `app/index.html` or serve the `app/` folder statically.
- **Progressive Web App (PWA)** — `manifest.json` + service worker so it can be
  added to the iPhone Home Screen ("Share → Add to Home Screen") and run full-screen
  and offline.
- **Storage: `localStorage`** (JSON) on the device. Single user, no accounts, no backend.
  Because Safari can clear site data, provide **Export / Import (JSON)** for backups.
- **Hosting: GitHub Pages** — repo `jennamarie82/Workout-app` (must be public), live at
  https://jennamarie82.github.io/Workout-app/. `.github/workflows/pages.yml` publishes the
  `app/` folder on every push to `main` (Pages source must be set to "GitHub Actions").
  All paths in the app must stay relative (it's served from `/Workout-app/`, not `/`).
  Workout data never goes to GitHub — it lives only in the phone's localStorage.

## Folder structure
```
CLAUDE.md            – this file
docs/program.md      – the program as transcribed from the source images (source of truth)
app/
  index.html         – single page; screens are shown/hidden by JS
  manifest.json      – PWA manifest (name, icons, standalone display, theme color)
  sw.js              – service worker (cache app shell for offline use)
  css/styles.css     – all styles, mobile-first
  js/app.js          – UI, navigation, event handling
  js/storage.js      – load/save/export/import of workout logs (only file that touches localStorage)
  data/program.js    – PROGRAM constant: days, exercises, sets, rep ranges
  icons/             – app icons (180×180 apple-touch-icon, 192, 512)
tools/make_icons.py  – regenerates the icons (no dependencies): python3 tools/make_icons.py
tools/bump_version.py – bumps the app version after any app/ change
.github/workflows/pages.yml – deploys app/ to GitHub Pages
```

Routing is hash-based in `app.js`: `#/` Home, `#/log` logger, `#/history`, `#/workout/<id>`,
`#/progress`, `#/exercise/<id>`, `#/settings`. Tab bar: Workout · History · Progress.
While `name` is null every route shows the Welcome screen (asks for a name, can be skipped).
Scripts are plain `<script>` tags (no modules), loaded in order: program.js → storage.js → app.js.

## The program
Defined in `app/data/program.js` (mirrors `docs/program.md`).
- **Day A:** Leg Press 4×12–15 · Chest Press Machine 3×10–12 · Lat Pulldown 4×10–12 · Leg Curl 3×12–15 · Plank 3×45s
- **Day B:** Hip Thrust 4×10–12 · Seated Cable Row 4×10–12 · Shoulder Press Machine 3×10–12 · Leg Extension 3×12–15 · Cable Curl 3×12–15
- **Day C:** Chest Supported Row 4×10–12 · Incline DB Press 3×10–12 · Step Ups 3×10 each leg · Face Pull 3×15–20 · Tricep Pushdown 3×12–15

Exercise `id`s are permanent keys in saved data — rename display names freely, never ids.
Plank is a **timed** exercise (log seconds, no weight). Step Ups are **per leg**.

## Data model (localStorage key: `workoutApp.v1`)
```js
{
  version: 1,
  units: "lb",                       // "lb" | "kg"
  name: "Jenna",                     // person using this phone; null = never asked (shows Welcome), "" = skipped
  workouts: [
    {
      id: "2026-10-25T17:30:00.000Z",  // unique id (creation timestamp)
      date: "2026-10-25",              // the date the workout was done (editable)
      day: "A",                        // "A" | "B" | "C"
      completed: true,
      notes: "",
      exercises: [
        { exerciseId: "leg-press",
          sets: [ { weight: 180, reps: 15, done: true }, ... ] },
        { exerciseId: "plank",
          sets: [ { seconds: 45, done: true }, ... ] }
      ]
    }
  ],
  draft: null   // workout being logged/edited right now (same shape + `editing: bool`),
                // autosaved on every change; null when nothing is in progress
}
```
Only ticked (`done`) sets are kept when a workout is finished; exercises with no ticked sets are dropped.
Bump `version` and write a migration in `storage.js` if this shape changes.

## Planned screens
1. **Home** – big buttons for Day A / B / C, with "Next up: Day X" suggested
   (rotate A → B → C after the last completed workout) and last-done date for each.
2. **Workout logger** – date picker (defaults to today), list of exercises; each set row
   shows target reps, weight & reps inputs pre-filled from last time, and a ✓ button.
   "Finish workout" saves it. In-progress workouts autosave so nothing is lost.
3. **History** – list of past workouts by date; tap to view/edit/delete.
4. **Progress** – every exercise grouped by day with its best so far; tap one for stat tiles
   (Best / Last time / Change), a line chart of each session's best set (tap or drag to read a
   point), and every session listed. "Best" = heaviest weight; Plank = longest hold; an exercise
   never logged with weight = most reps. The chart is hand-built SVG in `app.js` (no library).
5. **Settings** (person icon on Home) – name (built); lb/kg and export/import backup still to do.

**Sharing:** anyone can open the same link. Each phone keeps its own name and workouts in its
own localStorage — nothing is shared between people and nothing goes to a server.

## iPhone / UX conventions
- Mobile-first, design for ~375–430px wide; respect safe areas
  (`viewport-fit=cover`, `env(safe-area-inset-*)`).
- Tap targets ≥ 44×44px. Font size ≥ 16px on inputs (prevents iOS zoom-on-focus).
- Number inputs use `inputmode="decimal"` (weight) / `inputmode="numeric"` (reps)
  to bring up the number keypad; offer +/− steppers for weight.
- Include `apple-mobile-web-app-capable`, `apple-touch-icon`, and a theme color.
- Support light and dark mode via `prefers-color-scheme`.
- Confirm before destructive actions (deleting a workout).

## Conventions
- Keep it dependency-free; if a library is ever needed, vendor it locally (must work offline).
- `storage.js` is the only module that reads/writes `localStorage`.
- **After changing any file in `app/`, run `python3 tools/bump_version.py`.** It bumps `VERSION`
  in `sw.js` and every `?v=` in `index.html` together. GitHub Pages' CDN caches each URL for
  10 minutes, so without new versioned URLs phones can load a mix of old and new files.
- `sw.js` is stale-while-revalidate: phones get updates on the *next* launch after a change.
  Its fetches use `cache: "no-cache"`. A new app file must be added to `ASSETS` (with `?v=` if
  it's a script or stylesheet referenced from index.html).
- The service worker only registers on HTTPS, so local `http://` testing is never cached.

## Testing
- Serve: `cd app && python3 -m http.server 8000`, open http://localhost:8000 with iPhone-size
  emulation. (`.claude/launch.json` attaches the preview to an already-running server on 8000 —
  macOS Desktop privacy stops the preview tool from starting the server itself.)
- Phone: open `http://<mac-ip>:8000` from the iPhone on the same Wi-Fi.
  Offline mode and Home Screen install need HTTPS, so test those after deploying.

## Status
- [x] Folder structure, program data, CLAUDE.md
- [x] Home, Workout logger, History + workout detail (view / edit / delete)
- [x] PWA manifest, service worker, icons
- [x] Progress screen (per-exercise stats, chart, session list)
- [x] Welcome screen asks for a name; Home says "Hi, <name>"; Settings to change it
- [ ] Settings: lb/kg, export/import backup
- [x] Home lets you pick any day (rotation's next day is only highlighted)
- [x] Git + GitHub Pages workflow
- [x] Live on GitHub Pages (push from GitHub Desktop; deploy runs automatically)
