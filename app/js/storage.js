// Persistence. This is the only file that reads or writes localStorage —
// everything else works on Store.state and calls Store.save().

const Store = (() => {
  const KEY = "workoutApp.v1";
  const VERSION = 1;

  let state = empty();

  function empty() {
    return {
      version: VERSION,
      units: "lb",
      name: null, // the person using this phone; null = not asked yet, "" = skipped
      workouts: [],
      draft: null, // the workout currently being logged or edited (autosaved)
      lastBackup: null, // ISO timestamp of the last "Save backup"
    };
  }

  // Upgrade older saved shapes here when VERSION is bumped.
  function migrate(data) {
    return Object.assign(empty(), data, { version: VERSION });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? migrate(JSON.parse(raw)) : empty();
    } catch (err) {
      console.error("Could not load saved workouts", err);
      state = empty();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error("Could not save workouts", err);
      window.dispatchEvent(new Event("store-save-failed")); // app.js shows the message
      return false;
    }
  }

  // ---------- Backup files ----------
  // A backup is the saved workouts plus name and units, as JSON. The workout in
  // progress isn't included — it isn't finished yet.

  function backupJSON() {
    return JSON.stringify({
      app: "workout-tracker",
      version: VERSION,
      exportedAt: new Date().toISOString(),
      name: state.name,
      units: state.units,
      workouts: state.workouts,
    }, null, 2);
  }

  const isWorkout = (w) =>
    w && typeof w.id === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(w.date) &&
    w.day in PROGRAM &&
    Array.isArray(w.exercises) &&
    w.exercises.every((e) => e && typeof e.exerciseId === "string" && Array.isArray(e.sets));

  // Reads a backup file's text. Throws an Error whose message can be shown as-is.
  function parseBackup(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("This file isn't a workout backup.");
    }
    if (!data || !Array.isArray(data.workouts)) throw new Error("This file isn't a workout backup.");
    const workouts = data.workouts.filter(isWorkout);
    if (data.workouts.length && !workouts.length) throw new Error("This backup's workouts couldn't be read.");
    return { workouts, name: typeof data.name === "string" ? data.name : null, exportedAt: data.exportedAt || null };
  }

  // Adds the backup's workouts that aren't on this phone yet (matched by id), and its
  // name if this phone has none. Workouts already here are left as they are.
  function mergeBackup(backup) {
    const have = new Set(state.workouts.map((w) => w.id));
    const added = backup.workouts.filter((w) => !have.has(w.id));
    state.workouts.push(...added);
    if (!state.name && backup.name) state.name = backup.name;
    save();
    return added.length;
  }

  return {
    load,
    save,
    backupJSON,
    parseBackup,
    mergeBackup,
    get state() { return state; },
  };
})();
