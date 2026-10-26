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

  return {
    load,
    save,
    get state() { return state; },
  };
})();
