// UI, navigation and event handling. Screens render into #view by hash route:
//   #/             Home – pick a day / resume the workout in progress
//   #/log          Workout logger – edits Store.state.draft (autosaved on every change)
//   #/history      History – list of finished workouts
//   #/workout/ID   One finished workout – view, edit, delete
//   #/progress     Progress – every exercise with its best so far
//   #/exercise/ID  One exercise – stats, chart and every session

const DAYS = ["A", "B", "C"];
const view = document.getElementById("view");

const exerciseById = {};
const dayOfExercise = {};
for (const day of DAYS) {
  for (const ex of PROGRAM[day].exercises) {
    exerciseById[ex.id] = ex;
    dayOfExercise[ex.id] = day;
  }
}

// ---------- Helpers ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// Local date as YYYY-MM-DD (toISOString would use UTC and can be off by a day).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(iso, opts = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) {
  return parseISO(iso).toLocaleDateString(undefined, opts);
}

function daysAgo(iso) {
  const diff = Math.round((parseISO(todayISO()) - parseISO(iso)) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 0) return formatDate(iso, { month: "short", day: "numeric" });
  return `${diff} days ago`;
}

function parseNum(value) {
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const units = () => Store.state.units;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function targetText(ex) {
  if (ex.type === "time") return `${ex.sets} × ${ex.seconds}s`;
  const reps = ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}–${ex.repMax}`;
  return `${ex.sets} × ${reps}${ex.perSide ? " each leg" : ""}`;
}

function setText(ex, s, short = false) {
  if (ex.type === "time") return `${s.seconds}s`;
  const reps = ex.perSide ? `${s.reps}/leg` : `${s.reps}`;
  if (s.weight == null) return short ? reps : `${reps} reps`;
  return short ? `${s.weight}×${reps}` : `${s.weight} ${units()} × ${reps}`;
}

function progress(workout) {
  let done = 0, total = 0;
  for (const e of workout.exercises) {
    total += e.sets.length;
    done += e.sets.filter((s) => s.done).length;
  }
  return { done, total };
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// In-app replacement for confirm()/alert(). Browsers — including iPhone Home Screen
// apps — can silently block native pop-ups, which makes buttons look broken.
// Resolves true for the OK button, false for Cancel or a tap outside the box.
function ask(message, { ok = "OK", cancel = "Cancel", danger = false } = {}) {
  const dlg = document.getElementById("dialog");
  const okBtn = dlg.querySelector('[data-dialog="ok"]');
  const cancelBtn = dlg.querySelector('[data-dialog="cancel"]');
  document.getElementById("dialog-msg").textContent = message;
  okBtn.textContent = ok;
  okBtn.classList.toggle("danger-fill", danger);
  cancelBtn.hidden = cancel === null;
  cancelBtn.textContent = cancel || "";
  if (document.activeElement) document.activeElement.blur();
  dlg.hidden = false;
  return new Promise((resolve) => {
    dlg.onclick = (e) => {
      const choice = e.target.closest("[data-dialog]");
      if (!choice && e.target !== dlg) return;
      dlg.hidden = true;
      dlg.onclick = null;
      resolve(!!choice && choice.dataset.dialog === "ok");
    };
  });
}

const tell = (message) => ask(message, { cancel: null });

function go(hash, replace = false) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

// ---------- Queries ----------

// Finished workouts, newest first.
function finishedWorkouts() {
  return Store.state.workouts.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function nextDay() {
  const last = finishedWorkouts()[0];
  return last ? DAYS[(DAYS.indexOf(last.day) + 1) % DAYS.length] : "A";
}

// Most recent completed sets of an exercise, skipping the workout being edited.
function lastSetsFor(exerciseId, excludeId) {
  for (const w of finishedWorkouts()) {
    if (w.id === excludeId) continue;
    const e = w.exercises.find((x) => x.exerciseId === exerciseId);
    if (e && e.sets.length) return { date: w.date, sets: e.sets };
  }
  return null;
}

function blankSet(ex, prev) {
  if (ex.type === "time") return { seconds: prev ? prev.seconds : ex.seconds, done: false };
  return { weight: prev ? prev.weight : null, reps: prev ? prev.reps : null, done: false };
}

// A new workout, pre-filled with what was lifted last time for each exercise.
function newDraft(day) {
  return {
    id: new Date().toISOString(),
    date: todayISO(),
    day,
    notes: "",
    editing: false,
    exercises: PROGRAM[day].exercises.map((ex) => {
      const last = lastSetsFor(ex.id);
      return {
        exerciseId: ex.id,
        sets: Array.from({ length: ex.sets }, (_, i) => {
          const prev = last && (last.sets[i] || last.sets[last.sets.length - 1]);
          return blankSet(ex, prev);
        }),
      };
    }),
  };
}

// Re-open a finished workout in the logger. Exercises follow the program order;
// any that were skipped get empty sets so they can be filled in now.
function editDraft(workout) {
  return {
    id: workout.id,
    date: workout.date,
    day: workout.day,
    notes: workout.notes || "",
    editing: true,
    exercises: PROGRAM[workout.day].exercises.map((ex) => {
      const saved = workout.exercises.find((e) => e.exerciseId === ex.id);
      return {
        exerciseId: ex.id,
        sets: saved && saved.sets.length
          ? saved.sets.map((s) => ({ ...s, done: true }))
          : Array.from({ length: ex.sets }, () => blankSet(ex)),
      };
    }),
  };
}

// ---------- Home ----------

function renderHome() {
  const draft = Store.state.draft;
  const next = nextDay();
  let html = `
    <header class="page-head home-head">
      <div>
        <p class="eyebrow">${esc(formatDate(todayISO(), { weekday: "long", month: "long", day: "numeric" }))}</p>
        <h1>${Store.state.name ? `Hi, ${esc(Store.state.name)}` : "Workouts"}</h1>
      </div>
      <a class="icon-btn" href="#/settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>
      </a>
    </header>`;

  if (draft) {
    const { done, total } = progress(draft);
    html += `
      <section class="card resume">
        <p class="eyebrow">${draft.editing ? "Editing" : "In progress"}</p>
        <h2>${esc(PROGRAM[draft.day].name)}</h2>
        <p class="muted">${done} of ${total} sets done · ${esc(formatDate(draft.date, { month: "short", day: "numeric" }))}</p>
        <div class="row">
          <button class="btn primary" data-action="resume">Resume</button>
          <button class="btn danger" data-action="discard">Discard</button>
        </div>
      </section>`;
  }

  // Any day can be started; the rotation's next day is only highlighted as a suggestion.
  html += `<h2 class="section-title">${draft ? "Or start a different day" : "Which day are you doing?"}</h2>`;
  for (const day of DAYS) {
    const last = finishedWorkouts().find((w) => w.day === day);
    const suggested = day === next && !draft;
    html += `
      <button class="day-card${suggested ? " suggested" : ""}" data-action="start" data-day="${day}">
        <span class="day-letter">${day}</span>
        <span class="day-info">
          <strong>${esc(PROGRAM[day].name)}${suggested ? `<span class="badge">Up next</span>` : ""}</strong>
          <span class="muted">${last ? `Last done ${daysAgo(last.date)}` : "Not done yet"}</span>
          <small>${PROGRAM[day].exercises.map((e) => esc(e.name)).join(" · ")}</small>
        </span>
        <span class="start-pill">Start</span>
      </button>`;
  }
  view.innerHTML = html;
}

// ---------- Workout logger ----------

function setRowHTML(ex, s, exIdx, setIdx) {
  const done = s.done ? " done" : "";
  const data = `data-ex="${exIdx}" data-set="${setIdx}"`;
  if (ex.type === "time") {
    return `
      <div class="set-grid set-row timed${done}" ${data}>
        <span class="set-num">${setIdx + 1}</span>
        <div class="stepper">
          <button class="step" data-action="step" data-field="seconds" data-dir="-1" aria-label="5 seconds less">−</button>
          <input class="num" inputmode="numeric" data-field="seconds" value="${s.seconds ?? ""}" placeholder="${ex.seconds}" aria-label="Seconds, set ${setIdx + 1}">
          <button class="step" data-action="step" data-field="seconds" data-dir="1" aria-label="5 seconds more">+</button>
        </div>
        <button class="check" data-action="toggle" aria-label="Mark set ${setIdx + 1} done">✓</button>
      </div>`;
  }
  const repsPlaceholder = ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}–${ex.repMax}`;
  return `
    <div class="set-grid set-row${done}" ${data}>
      <span class="set-num">${setIdx + 1}</span>
      <div class="stepper">
        <button class="step" data-action="step" data-field="weight" data-dir="-1" aria-label="Less weight">−</button>
        <input class="num" inputmode="decimal" data-field="weight" value="${s.weight ?? ""}" placeholder="–" aria-label="Weight in ${units()}, set ${setIdx + 1}">
        <button class="step" data-action="step" data-field="weight" data-dir="1" aria-label="More weight">+</button>
      </div>
      <input class="num" inputmode="numeric" data-field="reps" value="${s.reps ?? ""}" placeholder="${repsPlaceholder}" aria-label="Reps, set ${setIdx + 1}">
      <button class="check" data-action="toggle" aria-label="Mark set ${setIdx + 1} done">✓</button>
    </div>`;
}

function renderLog() {
  const d = Store.state.draft;
  const { done, total } = progress(d);
  let html = `
    <header class="bar">
      <a class="bar-btn" href="#/">‹ Home</a>
      <h1>${esc(PROGRAM[d.day].name)}</h1>
      <span class="bar-right" id="progress">${done}/${total}</span>
    </header>
    <section class="card">
      <label class="field-label" for="workout-date">Date</label>
      <input type="date" id="workout-date" data-field="date" value="${esc(d.date)}" max="${todayISO()}">
    </section>`;

  d.exercises.forEach((entry, exIdx) => {
    const ex = exerciseById[entry.exerciseId];
    const last = lastSetsFor(ex.id, d.editing ? d.id : null);
    const lastLine = last
      ? `Last (${esc(formatDate(last.date, { month: "short", day: "numeric" }))}): ${last.sets.map((s) => setText(ex, s, true)).join(", ")}${ex.type === "time" || last.sets.every((s) => s.weight == null) ? "" : ` ${units()}`}`
      : ex.type === "time" ? "First time" : "First time — enter your weight";
    const head = ex.type === "time"
      ? `<div class="set-grid timed set-head"><span>Set</span><span>Seconds</span><span></span></div>`
      : `<div class="set-grid set-head"><span>Set</span><span>${units()}</span><span>${ex.perSide ? "Reps/leg" : "Reps"}</span><span></span></div>`;
    html += `
      <section class="card">
        <div class="ex-head"><h2>${esc(ex.name)}</h2><span class="target">${esc(targetText(ex))}</span></div>
        <p class="last">${lastLine}</p>
        ${head}
        ${entry.sets.map((s, setIdx) => setRowHTML(ex, s, exIdx, setIdx)).join("")}
        <button class="add-set" data-action="add-set" data-ex="${exIdx}">+ Add set</button>
      </section>`;
  });

  html += `
    <section class="card">
      <label class="field-label" for="workout-notes">Notes</label>
      <textarea id="workout-notes" data-field="notes" placeholder="How did it feel?">${esc(d.notes)}</textarea>
    </section>
    <div class="finish-bar">
      <button class="btn primary block" data-action="finish">${d.editing ? "Save changes" : "Finish workout"}</button>
    </div>`;
  view.innerHTML = html;
}

function rowContext(el) {
  const row = el.closest(".set-row");
  const entry = Store.state.draft.exercises[+row.dataset.ex];
  return { row, entry, ex: exerciseById[entry.exerciseId], set: entry.sets[+row.dataset.set], setIdx: +row.dataset.set };
}

function updateProgress() {
  const { done, total } = progress(Store.state.draft);
  const el = document.getElementById("progress");
  if (el) el.textContent = `${done}/${total}`;
}

function flagInput(input) {
  input.classList.remove("need");
  void input.offsetWidth; // restart the animation
  input.classList.add("need");
  input.focus();
}

async function finishWorkout() {
  const d = Store.state.draft;
  const { done, total } = progress(d);
  if (!done) {
    await tell("Tap ✓ on each set you completed, then finish.");
    return;
  }
  if (done < total && !(await ask(`${plural(total - done, "set")} not ticked will be left out. Finish anyway?`, { ok: "Finish" }))) return;

  const workout = {
    id: d.id,
    date: d.date,
    day: d.day,
    completed: true,
    notes: d.notes.trim(),
    exercises: d.exercises
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length),
  };
  const workouts = Store.state.workouts;
  const i = workouts.findIndex((w) => w.id === workout.id);
  if (i >= 0) workouts[i] = workout;
  else workouts.push(workout);
  Store.state.draft = null;
  Store.save();
  toast(d.editing ? "Changes saved" : "Workout saved 💪");
  go(`#/workout/${encodeURIComponent(workout.id)}`, true);
}

// ---------- History ----------

function renderHistory() {
  const list = finishedWorkouts();
  let html = `<header class="page-head"><p class="eyebrow">${plural(list.length, "workout")}</p><h1>History</h1></header>`;
  if (!list.length) {
    html += `<div class="empty"><p>🏋️</p><p>No workouts yet.<br>Finish your first one and it will show up here.</p></div>`;
  }
  for (const w of list) {
    const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
    const date = parseISO(w.date);
    html += `
      <a class="card list-item" href="#/workout/${encodeURIComponent(w.id)}">
        <span class="date-badge">
          <span>${esc(date.toLocaleDateString(undefined, { month: "short" }))}</span>
          <strong>${date.getDate()}</strong>
        </span>
        <span class="grow">
          <strong>${esc(PROGRAM[w.day].name)}</strong>
          <span class="muted">${esc(date.toLocaleDateString(undefined, { weekday: "long" }))} · ${plural(w.exercises.length, "exercise")} · ${plural(sets, "set")}</span>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </a>`;
  }
  view.innerHTML = html;
}

function renderWorkout(id) {
  const w = Store.state.workouts.find((x) => x.id === id);
  if (!w) return go("#/history", true);
  let html = `
    <header class="bar">
      <a class="bar-btn" href="#/history">‹ History</a>
      <h1>${esc(PROGRAM[w.day].name)}</h1>
      <span></span>
    </header>
    <header class="page-head">
      <p class="eyebrow">${esc(PROGRAM[w.day].name)}</p>
      <h1>${esc(formatDate(w.date, { weekday: "short", month: "short", day: "numeric" }))}</h1>
      <p class="muted">${esc(formatDate(w.date, { year: "numeric" }))} · ${daysAgo(w.date)}</p>
    </header>`;
  for (const e of w.exercises) {
    const ex = exerciseById[e.exerciseId];
    html += `
      <section class="card">
        <div class="ex-head">
          <h2>${ex ? `<a class="ex-link" href="#/exercise/${esc(ex.id)}">${esc(ex.name)} <span aria-hidden="true">›</span></a>` : esc(e.exerciseId)}</h2>
          ${ex ? `<span class="target">${esc(targetText(ex))}</span>` : ""}
        </div>
        <ul class="detail-sets">
          ${e.sets.map((s, i) => `<li><span>Set ${i + 1}</span><span>${esc(ex ? setText(ex, s) : "")}</span></li>`).join("")}
        </ul>
      </section>`;
  }
  if (w.notes) html += `<section class="card"><p class="field-label">Notes</p><p class="notes">${esc(w.notes)}</p></section>`;
  html += `
    <div class="row" style="margin-top:16px">
      <button class="btn" data-action="edit-workout" data-id="${esc(w.id)}">Edit</button>
      <button class="btn danger" data-action="delete-workout" data-id="${esc(w.id)}">Delete</button>
    </div>`;
  view.innerHTML = html;
}

// ---------- Welcome & Settings ----------
// Everyone who opens the shared link gets their own copy on their own phone,
// so the name (like the workouts) only ever lives on that device.

function renderWelcome() {
  view.innerHTML = `
    <form class="welcome" id="name-form">
      <p class="welcome-icon" aria-hidden="true">🏋️</p>
      <h1>Welcome!</h1>
      <p class="muted">Log your Day A, B and C workouts and watch your progress.</p>
      <label class="field-label" for="name-input">What's your name?</label>
      <input id="name-input" class="text-input" type="text" autocomplete="given-name" autocapitalize="words"
             enterkeyhint="done" maxlength="40" placeholder="Your name">
      <button class="btn primary block" type="submit">Continue</button>
      <button class="btn ghost block" type="button" data-action="skip-name">Skip</button>
    </form>`;
}

function renderSettings() {
  view.innerHTML = `
    <header class="bar">
      <a class="bar-btn" href="#/">‹ Home</a>
      <h1>Settings</h1>
      <span></span>
    </header>
    <section class="card">
      <label class="field-label" for="name-input">Your name</label>
      <input id="name-input" class="text-input" type="text" autocomplete="given-name" autocapitalize="words"
             enterkeyhint="done" maxlength="40" placeholder="Your name" value="${esc(Store.state.name || "")}">
      <p class="muted hint">Shown on the Home screen. It stays on this phone — nothing is shared.</p>
    </section>`;
}

function saveName(value) {
  Store.state.name = value.trim();
  Store.save();
}

view.addEventListener("submit", (e) => {
  if (e.target.id !== "name-form") return;
  e.preventDefault();
  saveName(document.getElementById("name-input").value);
  route();
});

// ---------- Progress ----------

// Every finished session of one exercise, oldest first.
function exerciseHistory(exerciseId) {
  return finishedWorkouts().reverse().flatMap((w) => {
    const e = w.exercises.find((x) => x.exerciseId === exerciseId);
    return e && e.sets.length ? [{ date: w.date, workoutId: w.id, sets: e.sets }] : [];
  });
}

// What "better" means for an exercise: more weight, or — when it's done without
// weight — more reps / a longer hold. Each session is scored by its best set.
function progressMetric(ex, history) {
  if (ex.type === "time") return { label: "Longest hold", unit: "s", value: (s) => s.seconds ?? 0 };
  if (history.some((h) => h.sets.some((s) => s.weight != null))) {
    return { label: "Heaviest set", unit: ` ${units()}`, value: (s) => s.weight ?? 0 };
  }
  return { label: "Most reps", unit: " reps", value: (s) => s.reps ?? 0 };
}

// Highest-scoring set; ties go to the one with more reps.
function bestSet(sets, metric) {
  return sets.reduce((best, s) => {
    const v = metric.value(s), b = metric.value(best);
    return v > b || (v === b && (s.reps ?? 0) > (best.reps ?? 0)) ? s : best;
  });
}

const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString();

// "× 12" for weighted sets, so tiles can show the weight big and the reps small.
function repsSuffix(ex, s, metric) {
  if (ex.type === "time" || metric.label === "Most reps" || s.reps == null) return "";
  return `× ${s.reps}${ex.perSide ? "/leg" : ""}`;
}

function renderProgress() {
  let html = `<header class="page-head"><p class="eyebrow">By exercise</p><h1>Progress</h1></header>`;
  for (const day of DAYS) {
    html += `<h2 class="section-title">${esc(PROGRAM[day].name)}</h2><div class="card list-card">`;
    for (const ex of PROGRAM[day].exercises) {
      const history = exerciseHistory(ex.id);
      let sub = "Not logged yet";
      let best = "";
      if (history.length) {
        const metric = progressMetric(ex, history);
        const top = Math.max(...history.map((h) => metric.value(bestSet(h.sets, metric))));
        sub = `Last done ${daysAgo(history[history.length - 1].date)} · ${plural(history.length, "session")}`;
        best = `<span class="pr"><small>Best</small>${fmtNum(top)}${esc(metric.unit)}</span>`;
      }
      html += `
        <a class="ex-row" href="#/exercise/${esc(ex.id)}">
          <span class="grow"><strong>${esc(ex.name)}</strong><span class="muted">${sub}</span></span>
          ${best}
          <span class="chev" aria-hidden="true">›</span>
        </a>`;
    }
    html += `</div>`;
  }
  view.innerHTML = html;
}

function renderExercise(id) {
  const ex = exerciseById[id];
  if (!ex) return go("#/progress", true);
  const history = exerciseHistory(id);
  let html = `
    <header class="bar">
      <a class="bar-btn" href="#/progress">‹ Progress</a>
      <span></span><span></span>
    </header>
    <header class="page-head">
      <p class="eyebrow">${esc(PROGRAM[dayOfExercise[id]].name)}</p>
      <h1>${esc(ex.name)}</h1>
      <p class="muted">Target ${esc(targetText(ex))}</p>
    </header>`;

  if (!history.length) {
    view.innerHTML = html + `<div class="empty"><p>📈</p><p>No sets logged yet.<br>Finish a workout with ${esc(ex.name)} and your progress will show here.</p></div>`;
    return;
  }

  const metric = progressMetric(ex, history);
  const points = history.map((h) => ({ ...h, best: bestSet(h.sets, metric) }));
  const last = points[points.length - 1];
  const pr = points.reduce((a, b) => (metric.value(b.best) > metric.value(a.best) ? b : a));
  const change = metric.value(last.best) - metric.value(points[0].best);
  const tile = (label, value, sub) => `
    <div class="stat"><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-sub">${sub}</span></div>`;

  html += `<section class="stats">
    ${tile("Best", `${fmtNum(metric.value(pr.best))}${esc(metric.unit)}`, `${repsSuffix(ex, pr.best, metric)} ${esc(formatDate(pr.date, { month: "short", day: "numeric" }))}`)}
    ${tile("Last time", `${fmtNum(metric.value(last.best))}${esc(metric.unit)}`, `${repsSuffix(ex, last.best, metric)} ${daysAgo(last.date)}`)}
    ${points.length > 1
      ? tile("Change", `${change > 0 ? "+" : change < 0 ? "−" : ""}${fmtNum(Math.abs(change))}${esc(metric.unit)}`, `since ${esc(formatDate(points[0].date, { month: "short", day: "numeric" }))}`)
      : tile("Sessions", "1", "so far")}
  </section>`;

  const unitName = ex.type === "time" ? "seconds" : metric.label === "Most reps" ? "reps" : units();
  html += `
    <section class="card">
      <h2 class="chart-title">${metric.label} each workout <span class="muted">(${unitName})</span></h2>
      <p class="readout" id="readout"></p>
      ${chartSVG(points, metric, ex)}
      ${points.length === 1 ? `<p class="muted chart-note">Log ${esc(ex.name)} again to see your trend.</p>` : ""}
    </section>
    <h2 class="section-title">All sessions</h2>
    <div class="card list-card">
      ${points.slice().reverse().map((p) => `
        <a class="ex-row" href="#/workout/${encodeURIComponent(p.workoutId)}">
          <span class="grow">
            <strong>${esc(formatDate(p.date, { weekday: "short", month: "short", day: "numeric" }))}</strong>
            <span class="muted">${p.sets.map((s) => esc(setText(ex, s, true))).join(" · ")}${ex.type === "time" || metric.label === "Most reps" ? "" : ` ${units()}`}</span>
          </span>
          <span class="chev" aria-hidden="true">›</span>
        </a>`).join("")}
    </div>`;
  view.innerHTML = html;
  wireChart(points, metric, ex);
}

// ---------- Chart ----------
// A single-series line chart in plain SVG. One line, so no legend: the card title
// names it. Tap or drag anywhere on it to read a session's best set.

const CHART = { w: 320, h: 170, left: 36, right: 12, top: 12, bottom: 24 };

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}

function chartScales(points, metric) {
  const { w, h, left, right, top, bottom } = CHART;
  const vals = points.map((p) => metric.value(p.best));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 5; hi += 5; } // a flat run sits mid-chart
  const pad = (hi - lo) * 0.15;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const step = niceStep((hi - lo) / 3);
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(Math.round(t * 100) / 100);

  const times = points.map((p) => parseISO(p.date).getTime());
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const x = (t) => (t1 === t0 ? (left + w - right) / 2 : left + ((t - t0) / (t1 - t0)) * (w - left - right));
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
  return { ticks, x, y, coords: points.map((p, i) => ({ x: x(times[i]), y: y(vals[i]) })) };
}

function chartSVG(points, metric, ex) {
  const { w, h, left, right, bottom } = CHART;
  const { ticks, y, coords } = chartScales(points, metric);
  const short = (iso) => esc(formatDate(iso, { month: "short", day: "numeric" }));
  const grid = ticks.map((t) => `
    <line class="grid" x1="${left}" x2="${w - right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${left - 6}" y="${y(t) + 3.5}" text-anchor="end">${fmtNum(t)}</text>`).join("");
  const xLabels = points.length > 1
    ? `<text class="axis" x="${left}" y="${h - 6}">${short(points[0].date)}</text>
       <text class="axis" x="${w - right}" y="${h - 6}" text-anchor="end">${short(points[points.length - 1].date)}</text>`
    : `<text class="axis" x="${coords[0].x}" y="${h - 6}" text-anchor="middle">${short(points[0].date)}</text>`;
  const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("");
  // Markers stay readable up to ~24 sessions; beyond that only the selected one shows.
  const dots = points.length <= 24 ? coords.map((c) => `<circle class="dot" cx="${c.x}" cy="${c.y}" r="4"/>`).join("") : "";
  return `
    <svg class="chart" id="chart" viewBox="0 0 ${w} ${h}" role="img"
         aria-label="${esc(`${metric.label} for ${ex.name} across ${plural(points.length, "workout")}`)}">
      ${grid}
      <line class="xhair" id="xhair" y1="${CHART.top}" y2="${h - bottom}"/>
      ${points.length > 1 ? `<path class="line" d="${path}"/>` : ""}
      ${dots}
      <circle class="dot sel" id="sel" r="6"/>
      ${xLabels}
    </svg>`;
}

function wireChart(points, metric, ex) {
  const svg = document.getElementById("chart");
  const { coords } = chartScales(points, metric);
  const select = (i) => {
    const c = coords[i], p = points[i];
    const xhair = svg.querySelector("#xhair");
    xhair.setAttribute("x1", c.x);
    xhair.setAttribute("x2", c.x);
    const sel = svg.querySelector("#sel");
    sel.setAttribute("cx", c.x);
    sel.setAttribute("cy", c.y);
    document.getElementById("readout").innerHTML =
      `<strong>${esc(setText(ex, p.best))}</strong> <span class="muted">· ${esc(formatDate(p.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</span>`;
  };
  const nearest = (e) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * CHART.w;
    let best = 0;
    coords.forEach((c, i) => { if (Math.abs(c.x - vx) < Math.abs(coords[best].x - vx)) best = i; });
    select(best);
  };
  svg.addEventListener("pointerdown", nearest);
  svg.addEventListener("pointermove", nearest);
  select(points.length - 1);
}

// ---------- Actions ----------

const actions = {
  async start(btn) {
    const day = btn.dataset.day;
    const draft = Store.state.draft;
    if (draft && !(draft.day === day && !draft.editing)) {
      const what = draft.editing ? "unsaved changes to a past workout" : `a ${PROGRAM[draft.day].name} workout in progress`;
      if (!(await ask(`You have ${what}. Discard it and start ${PROGRAM[day].name}?`, { ok: "Discard", danger: true }))) return;
      Store.state.draft = null;
    }
    if (!Store.state.draft) {
      Store.state.draft = newDraft(day);
      Store.save();
    }
    go("#/log");
  },

  resume() { go("#/log"); },

  "skip-name"() {
    saveName("");
    route();
  },

  async discard() {
    const d = Store.state.draft;
    if (!(await ask(d.editing ? "Discard your unsaved changes?" : `Discard this ${PROGRAM[d.day].name} workout?`, { ok: "Discard", danger: true }))) return;
    Store.state.draft = null;
    Store.save();
    renderHome();
  },

  step(btn) {
    const { row, ex, set } = rowContext(btn);
    const field = btn.dataset.field;
    const size = field === "seconds" ? 5 : units() === "kg" ? 2.5 : 5;
    const start = set[field] ?? (field === "seconds" ? ex.seconds : 0);
    set[field] = Math.max(0, Math.round((start + size * +btn.dataset.dir) * 100) / 100);
    row.querySelector(`input[data-field="${field}"]`).value = set[field];
    Store.save();
  },

  toggle(btn) {
    const { row, entry, ex, set, setIdx } = rowContext(btn);
    if (!set.done) {
      const required = ex.type === "time" ? "seconds" : "reps";
      if (set[required] == null) return flagInput(row.querySelector(`input[data-field="${required}"]`));
      // Carry this set's numbers to the next set if it's still empty.
      const next = entry.sets[setIdx + 1];
      const nextRow = row.parentElement.querySelector(`.set-row[data-set="${setIdx + 1}"]`);
      if (next && !next.done && nextRow) {
        for (const f of ["weight", "reps", "seconds"]) {
          if (f in next && next[f] == null && set[f] != null) {
            next[f] = set[f];
            nextRow.querySelector(`input[data-field="${f}"]`).value = set[f];
          }
        }
      }
    }
    set.done = !set.done;
    row.classList.toggle("done", set.done);
    if (document.activeElement && row.contains(document.activeElement)) document.activeElement.blur();
    updateProgress();
    Store.save();
  },

  "add-set"(btn) {
    const entry = Store.state.draft.exercises[+btn.dataset.ex];
    const ex = exerciseById[entry.exerciseId];
    entry.sets.push(blankSet(ex, entry.sets[entry.sets.length - 1]));
    Store.save();
    renderLog();
  },

  finish: finishWorkout,

  async "edit-workout"(btn) {
    const w = Store.state.workouts.find((x) => x.id === btn.dataset.id);
    const draft = Store.state.draft;
    if (draft && !(await ask(`You have ${draft.editing ? "unsaved edits" : "a workout in progress"}. Discard it and edit this one?`, { ok: "Discard", danger: true }))) return;
    Store.state.draft = editDraft(w);
    Store.save();
    go("#/log");
  },

  async "delete-workout"(btn) {
    const w = Store.state.workouts.find((x) => x.id === btn.dataset.id);
    if (!(await ask(`Delete ${PROGRAM[w.day].name} from ${formatDate(w.date)}? This can't be undone.`, { ok: "Delete", danger: true }))) return;
    Store.state.workouts = Store.state.workouts.filter((x) => x.id !== w.id);
    Store.save();
    toast("Workout deleted");
    go("#/history", true);
  },
};

view.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (btn && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
});

view.addEventListener("input", (e) => {
  const el = e.target;
  const field = el.dataset.field;
  const d = Store.state.draft;
  if (el.id === "name-input" && document.body.dataset.route === "settings") return saveName(el.value);
  if (!field || !d) return;
  if (field === "date") d.date = el.value || todayISO();
  else if (field === "notes") d.notes = el.value;
  else rowContext(el).set[field] = parseNum(el.value);
  el.classList.remove("need");
  Store.save();
});

// Select the whole number on focus so typing replaces it.
view.addEventListener("focusin", (e) => {
  if (e.target.classList.contains("num")) setTimeout(() => e.target.select(), 0);
});

// ---------- Router ----------

function route() {
  const [name, param] = location.hash.replace(/^#\/?/, "").split("/");
  let screen = name || "home";
  if (screen === "log" && !Store.state.draft) return go("#/", true);
  if (Store.state.name == null) screen = "welcome"; // first launch on this phone

  document.body.dataset.route = screen;
  const tab = { workout: "history", exercise: "progress", settings: "home" }[screen] || screen;
  document.querySelectorAll(".tabbar a").forEach((a) => {
    a.classList.toggle("active", a.dataset.tab === tab);
  });

  if (screen === "log") renderLog();
  else if (screen === "history") renderHistory();
  else if (screen === "workout") renderWorkout(decodeURIComponent(param || ""));
  else if (screen === "progress") renderProgress();
  else if (screen === "exercise") renderExercise(decodeURIComponent(param || ""));
  else if (screen === "welcome") renderWelcome();
  else if (screen === "settings") renderSettings();
  else renderHome();
  window.scrollTo(0, 0);
}

Store.load();
window.addEventListener("store-save-failed", () => tell("Couldn't save your workout on this device. Storage may be full or disabled."));
window.addEventListener("hashchange", route);
route();

// Offline support needs HTTPS, so the service worker only registers once deployed.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js");
}
