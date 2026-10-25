// The 3-day program, transcribed from the source images in docs/program.md.
// Exercise ids are stable keys used in saved workout logs — never rename an id,
// only its display name, or past history will be orphaned.
//
// type: "reps"  -> log weight + reps per set
//       "time"  -> log seconds per set (no weight)
//       perSide -> reps are counted per leg/arm

const PROGRAM = {
  A: {
    name: "Day A",
    exercises: [
      { id: "leg-press",           name: "Leg Press",           sets: 4, repMin: 12, repMax: 15, type: "reps" },
      { id: "chest-press-machine", name: "Chest Press Machine", sets: 3, repMin: 10, repMax: 12, type: "reps" },
      { id: "lat-pulldown",        name: "Lat Pulldown",        sets: 4, repMin: 10, repMax: 12, type: "reps" },
      { id: "leg-curl",            name: "Leg Curl",            sets: 3, repMin: 12, repMax: 15, type: "reps" },
      { id: "plank",               name: "Plank",               sets: 3, seconds: 45,            type: "time" },
    ],
  },
  B: {
    name: "Day B",
    exercises: [
      { id: "hip-thrust",             name: "Hip Thrust",             sets: 4, repMin: 10, repMax: 12, type: "reps" },
      { id: "seated-cable-row",       name: "Seated Cable Row",       sets: 4, repMin: 10, repMax: 12, type: "reps" },
      { id: "shoulder-press-machine", name: "Shoulder Press Machine", sets: 3, repMin: 10, repMax: 12, type: "reps" },
      { id: "leg-extension",          name: "Leg Extension",          sets: 3, repMin: 12, repMax: 15, type: "reps" },
      { id: "cable-curl",             name: "Cable Curl",             sets: 3, repMin: 12, repMax: 15, type: "reps" },
    ],
  },
  C: {
    name: "Day C",
    exercises: [
      { id: "chest-supported-row", name: "Chest Supported Row", sets: 4, repMin: 10, repMax: 12, type: "reps" },
      { id: "incline-db-press",    name: "Incline DB Press",    sets: 3, repMin: 10, repMax: 12, type: "reps" },
      { id: "step-ups",            name: "Step Ups",            sets: 3, repMin: 10, repMax: 10, type: "reps", perSide: true },
      { id: "face-pull",           name: "Face Pull",           sets: 3, repMin: 15, repMax: 20, type: "reps" },
      { id: "tricep-pushdown",     name: "Tricep Pushdown",     sets: 3, repMin: 12, repMax: 15, type: "reps" },
    ],
  },
};
