/* Elite OS v5.0 — Exercise Library (~130 exercises: calisthenics + full modern gym hypertrophy) */
const EQUIP = [
  ["pullbar", "Pull-up bar"], ["bands", "Resistance bands"], ["bag", "Weighted bag / vest"],
  ["db", "Dumbbells"], ["bb", "Barbell + rack"], ["bench", "Bench"],
  ["cable", "Cable / machines (gym)"], ["dipbars", "Dip bars / parallettes"],
  ["lowbar", "Rings / low bar / sturdy table"], ["step", "Step / box"]
];
const MUSCLES = [
  ["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["biceps", "Biceps"],
  ["triceps", "Triceps"], ["quads", "Quads"], ["hams", "Hamstrings"], ["glutes", "Glutes"],
  ["calves", "Calves"], ["abs", "Abs"]
];

const X = (slot, id, n, mu, o) => Object.assign({
  slot, id, n, mu, mu2: [], eq: [], ay: null, cal: false, bw: false, c: true,
  rr: [8, 12], rest: 90, cue: "", bm: null, bmr: [0, 999], bmReps: false, w: null, unit: "", ph: 0
}, o);

const EX = [
  /* vertical pull */
  X("vpull", "wpu", "Weighted pull-up", "back", { mu2: ["biceps"], eq: ["pullbar"], ay: ["bag", "db"], cal: 1, bw: 1, rr: [5, 8], rest: 150, w: "bagdb", bm: "pull", bmr: [10, 999], cue: "Dead hang to chin over bar. Drive elbows to ribs." }),
  X("vpull", "pu", "Pull-up", "back", { mu2: ["biceps"], eq: ["pullbar"], cal: 1, bw: 1, rr: [6, 10], rest: 120, bm: "pull", bmr: [4, 999], bmReps: true, cue: "Full hang, chest to bar, no kipping." }),
  X("vpull", "chin", "Chin-up (supinated)", "back", { mu2: ["biceps"], eq: ["pullbar"], cal: 1, bw: 1, rr: [6, 10], rest: 120, bm: "pull", bmr: [3, 999], bmReps: true, cue: "Palms toward you, lead with the chest." }),
  X("vpull", "npu", "Neutral / close-grip pull-up", "back", { mu2: ["biceps"], eq: ["pullbar"], cal: 1, bw: 1, rr: [6, 10], rest: 120, bm: "pull", bmr: [5, 999], bmReps: true, cue: "Elbows to hips, big stretch at the bottom." }),
  X("vpull", "pd", "Lat pulldown", "back", { mu2: ["biceps"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Pull to the upper chest, avoid leaning back." }),
  X("vpull", "npd", "Neutral-grip lat pulldown", "back", { mu2: ["biceps"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Drive elbows straight down toward your hips." }),
  X("vpull", "sapd", "Single-arm kneeling lat pulldown", "back", { mu2: ["biceps"], eq: ["cable"], rr: [10, 14], rest: 75, w: "mach", cue: "Full overhead stretch, pull elbow into hip." }),
  X("vpull", "sap", "Straight-arm cable pulldown", "back", { c: false, eq: ["cable"], rr: [12, 16], rest: 60, w: "mach", cue: "Soft elbows, sweep the bar to thighs with lats." }),
  X("vpull", "apull", "Assisted pull-up machine", "back", { mu2: ["biceps"], eq: ["cable"], rr: [6, 10], rest: 90, w: "mach", cue: "Full stretch at bottom, pull chest to handles." }),
  X("vpull", "bapu", "Band-assisted pull-up", "back", { mu2: ["biceps"], eq: ["pullbar", "bands"], cal: 1, rr: [5, 8], rest: 120, bm: "pull", bmr: [0, 5], w: "band", cue: "Use the thinnest band that still allows the target reps." }),
  X("vpull", "negpu", "Negative pull-up (5s lowering)", "back", { mu2: ["biceps"], eq: ["pullbar"], cal: 1, bw: 1, rr: [3, 5], rest: 120, bm: "pull", bmr: [0, 5], cue: "Jump to the top, lower for 5 full seconds." }),
  X("vpull", "bpd", "Banded lat pulldown", "back", { mu2: ["biceps"], eq: ["bands"], rr: [12, 15], rest: 60, w: "band", cue: "Anchor the band high (door anchor), pull to the chest." }),
  X("vpull", "sup", "Prone superman pull-down", "back", { rr: [12, 15], rest: 45, cue: "Lie face down, sweep arms from overhead to ribs." }),

  /* horizontal pull */
  X("hrow", "wir", "Weighted inverted row", "back", { mu2: ["biceps"], eq: ["lowbar"], ay: ["bag", "db"], cal: 1, bw: 1, rr: [8, 12], rest: 90, w: "bagdb", cue: "Body in a straight line, chest to the bar, 1s squeeze." }),
  X("hrow", "ir", "Inverted row (rings / low bar / table)", "back", { mu2: ["biceps"], eq: ["lowbar"], cal: 1, bw: 1, rr: [8, 15], rest: 75, cue: "Straight body, pull chest to the bar." }),
  X("hrow", "bbr", "Barbell row", "back", { mu2: ["biceps"], eq: ["bb"], rr: [6, 10], rest: 120, w: "bb", cue: "Hinge to ~45°, row to the lower ribs." }),
  X("hrow", "dbr", "One-arm dumbbell row", "back", { mu2: ["biceps"], eq: ["db"], rr: [8, 12], rest: 90, w: "db", cue: "Pull the elbow to the hip, full stretch at the bottom." }),
  X("hrow", "csr", "Chest-supported dumbbell row", "back", { mu2: ["biceps"], eq: ["db", "bench"], rr: [8, 12], rest: 90, w: "db", cue: "Chest on an incline bench, squeeze shoulder blades." }),
  X("hrow", "cr", "Seated cable row", "back", { mu2: ["biceps"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Tall chest, row to the navel." }),
  X("hrow", "tbar", "Chest-supported T-bar row", "back", { mu2: ["biceps"], eq: ["cable"], rr: [6, 10], rest: 120, w: "mach", cue: "Pin chest to pad, pull elbows back and squeeze upper back." }),
  X("hrow", "mhr", "Machine high row", "back", { mu2: ["biceps"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Let shoulders protract forward, pull elbows down and back." }),
  X("hrow", "sacr", "Single-arm seated cable row", "back", { mu2: ["biceps"], eq: ["cable"], rr: [10, 14], rest: 75, w: "mach", cue: "Keep torso square, pull handle toward hip." }),
  X("hrow", "pend", "Pendlay row", "back", { mu2: ["biceps"], eq: ["bb"], rr: [5, 8], rest: 120, w: "bb", cue: "Torso parallel to floor, pull explosively from dead stop." }),
  X("hrow", "mdw", "Meadows row (landmine)", "back", { mu2: ["biceps"], eq: ["bb"], rr: [8, 12], rest: 90, w: "bb", cue: "Staggered stance, pull sleeve toward hip with flared elbow." }),
  X("hrow", "brow", "Banded row", "back", { mu2: ["biceps"], eq: ["bands"], rr: [12, 15], rest: 60, w: "band", cue: "Anchor at chest height, pause 1s at the squeeze." }),
  X("hrow", "prw", "Prone reverse snow angel", "back", { rr: [12, 15], rest: 45, cue: "Face down, sweep arms wide with straight elbows." }),

  /* horizontal push */
  X("hpush", "wpush", "Weighted push-up (bag / vest)", "chest", { mu2: ["triceps", "shoulders"], ay: ["bag"], cal: 1, bw: 1, rr: [8, 12], rest: 90, w: "bagdb", bm: "push", bmr: [20, 999], cue: "Chest to floor, full lockout, ribs down." }),
  X("hpush", "bench", "Barbell bench press", "chest", { mu2: ["triceps", "shoulders"], eq: ["bb", "bench"], rr: [5, 8], rest: 150, w: "bb", cue: "Shoulder blades pinned, bar to the lower chest." }),
  X("hpush", "ibench", "Incline barbell bench press", "chest", { mu2: ["triceps", "shoulders"], eq: ["bb", "bench"], rr: [6, 10], rest: 150, w: "bb", cue: "30° bench, touch upper chest with control." }),
  X("hpush", "dbb", "Dumbbell bench press", "chest", { mu2: ["triceps", "shoulders"], eq: ["db", "bench"], rr: [8, 12], rest: 120, w: "db", cue: "Deep stretch, press slightly inward." }),
  X("hpush", "idbb", "Incline dumbbell press", "chest", { mu2: ["triceps", "shoulders"], eq: ["db", "bench"], rr: [8, 12], rest: 120, w: "db", cue: "30° incline, elbows ~45°, deep stretch at bottom." }),
  X("hpush", "smip", "Smith machine incline press", "chest", { mu2: ["triceps", "shoulders"], eq: ["cable"], rr: [8, 12], rest: 120, w: "mach", cue: "Touch upper chest cleanly, pause 1s, drive up." }),
  X("hpush", "mcp", "Converging machine chest press", "chest", { mu2: ["triceps", "shoulders"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Seat so handles align with mid-chest; full stretch." }),
  X("hpush", "fepu", "Feet-elevated push-up", "chest", { mu2: ["triceps", "shoulders"], cal: 1, bw: 1, rr: [8, 15], rest: 90, bm: "push", bmr: [12, 999], bmReps: true, cue: "Feet on a chair, body rigid, chest to the floor." }),
  X("hpush", "dip", "Parallel-bar dip (chest lean)", "chest", { mu2: ["triceps", "shoulders"], eq: ["dipbars"], cal: 1, bw: 1, rr: [6, 12], rest: 120, bm: "push", bmr: [12, 999], cue: "Lean forward, elbows out slightly, deep stretch." }),
  X("hpush", "wdip", "Weighted chest dip", "chest", { mu2: ["triceps", "shoulders"], eq: ["dipbars"], ay: ["bag", "db"], cal: 1, bw: 1, rr: [6, 10], rest: 150, w: "bagdb", bm: "push", bmr: [20, 999], cue: "Slight forward torso lean, lower to 90°+ with control." }),
  X("hpush", "pu", "Push-up", "chest", { mu2: ["triceps", "shoulders"], cal: 1, bw: 1, rr: [8, 20], rest: 75, bm: "push", bmr: [6, 40], bmReps: true, cue: "Hands under shoulders, elbows ~45°." }),
  X("hpush", "arch", "Archer push-up", "chest", { mu2: ["triceps", "shoulders"], cal: 1, bw: 1, rr: [4, 8], rest: 120, bm: "push", bmr: [25, 999], cue: "Shift weight to one side, other arm stays straight." }),
  X("hpush", "bpu", "Banded push-up", "chest", { mu2: ["triceps", "shoulders"], eq: ["bands"], cal: 1, bw: 1, rr: [8, 15], rest: 90, bm: "push", bmr: [10, 999], w: "band", cue: "Band across the upper back, press against the lockout." }),
  X("hpush", "cp", "Cable / machine chest press", "chest", { mu2: ["triceps", "shoulders"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Control the stretch, squeeze at the center." }),
  X("hpush", "fp", "Dumbbell floor press", "chest", { mu2: ["triceps"], eq: ["db"], rr: [8, 12], rest: 90, w: "db", cue: "Pause the triceps on the floor, then drive up." }),
  X("hpush", "ipu", "Incline push-up (hands on bench / chair)", "chest", { mu2: ["triceps", "shoulders"], cal: 1, rr: [8, 15], rest: 75, bm: "push", bmr: [0, 10], cue: "Lower the incline each week until floor push-ups are possible." }),

  /* vertical push */
  X("vpush", "ohp", "Barbell overhead press", "shoulders", { mu2: ["triceps"], eq: ["bb"], rr: [5, 8], rest: 150, w: "bb", cue: "Squeeze glutes, bar path close to the face." }),
  X("vpush", "dbp", "Seated dumbbell shoulder press", "shoulders", { mu2: ["triceps"], eq: ["db", "bench"], rr: [8, 12], rest: 120, w: "db", cue: "Elbows slightly in front, full lockout." }),
  X("vpush", "dbps", "Standing dumbbell shoulder press", "shoulders", { mu2: ["triceps"], eq: ["db"], rr: [8, 12], rest: 120, w: "db", cue: "Ribs down, press in a slight arc." }),
  X("vpush", "smohp", "Smith machine seated overhead press", "shoulders", { mu2: ["triceps"], eq: ["cable"], rr: [8, 12], rest: 120, w: "mach", cue: "High incline bench, lower to chin level and drive." }),
  X("vpush", "arn", "Arnold press", "shoulders", { mu2: ["triceps"], eq: ["db", "bench"], rr: [8, 12], rest: 90, w: "db", cue: "Smooth rotation from palms-in to overhead press." }),
  X("vpush", "fpike", "Feet-elevated pike push-up", "shoulders", { mu2: ["triceps"], cal: 1, bw: 1, rr: [6, 12], rest: 90, bm: "push", bmr: [10, 999], cue: "Hips high, head travels between the hands." }),
  X("vpush", "pike", "Pike push-up", "shoulders", { mu2: ["triceps"], cal: 1, bw: 1, rr: [6, 12], rest: 90, cue: "Hips high, lower the crown of the head forward." }),
  X("vpush", "msp", "Machine shoulder press", "shoulders", { mu2: ["triceps"], eq: ["cable"], rr: [8, 12], rest: 90, w: "mach", cue: "Stay tight to the pad, control the descent." }),
  X("vpush", "bohp", "Banded overhead press", "shoulders", { mu2: ["triceps"], eq: ["bands"], rr: [10, 15], rest: 60, w: "band", cue: "Stand on the band, press without arching." }),

  /* chest isolation */
  X("chestfly", "cfly", "Cable fly", "chest", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Hug a barrel, squeeze 1s at the center." }),
  X("chestfly", "pecd", "Pec deck / machine fly", "chest", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Keep elbows high, sweep hands together and pause." }),
  X("chestfly", "lcfly", "Low-to-high cable fly (upper chest)", "chest", { c: false, eq: ["cable"], rr: [12, 16], rest: 60, w: "mach", cue: "Scoop upward in an arc toward collarbone height." }),
  X("chestfly", "dfly", "Dumbbell fly", "chest", { c: false, eq: ["db", "bench"], rr: [10, 15], rest: 60, w: "db", cue: "Soft elbows, stretch without dropping the shoulders." }),
  X("chestfly", "bfly", "Banded chest fly", "chest", { c: false, eq: ["bands"], rr: [12, 20], rest: 45, w: "band", cue: "Anchor behind you, sweep arms together." }),
  X("chestfly", "ppl", "Push-up plus (serratus)", "chest", { c: false, mu2: ["shoulders"], cal: 0, rr: [12, 20], rest: 45, cue: "Push the floor away at the top." }),

  /* lateral delt */
  X("lateral", "clat", "Cable lateral raise", "shoulders", { c: false, eq: ["cable"], rr: [12, 20], rest: 45, w: "mach", cue: "Lead with the elbow, stop at shoulder height." }),
  X("lateral", "mlat", "Machine lateral raise", "shoulders", { c: false, eq: ["cable"], rr: [12, 18], rest: 45, w: "mach", cue: "Drive through the elbow pads, pause briefly at top." }),
  X("lateral", "cy", "Cable Y-raise", "shoulders", { c: false, eq: ["cable"], rr: [12, 18], rest: 45, w: "mach", cue: "Sweep arms out in a 30° scapular plane." }),
  X("lateral", "dlat", "Dumbbell lateral raise", "shoulders", { c: false, eq: ["db"], rr: [12, 20], rest: 45, w: "db", cue: "Slight forward lean, raise in the scapular plane." }),
  X("lateral", "upr", "Cable / dumbbell upright row", "shoulders", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Wide grip, lead elbows up to shoulder height only." }),
  X("lateral", "blat", "Banded lateral raise", "shoulders", { c: false, eq: ["bands"], rr: [15, 25], rest: 45, w: "band", cue: "Stand on the band, raise to shoulder height." }),
  X("lateral", "ylat", "Prone Y raise", "shoulders", { c: false, rr: [12, 20], rest: 45, cue: "Face down, thumbs up, lift arms into a Y." }),

  /* rear delt */
  X("reardelt", "rpd", "Reverse pec deck", "shoulders", { c: false, mu2: ["back"], eq: ["cable"], rr: [12, 18], rest: 45, w: "mach", cue: "Reach wide rather than pinching traps; control return." }),
  X("reardelt", "fp", "Banded face pull", "shoulders", { c: false, mu2: ["back"], eq: ["bands"], rr: [15, 25], rest: 45, w: "band", cue: "Pull to the forehead, elbows high and wide." }),
  X("reardelt", "rfly", "Rear-delt dumbbell fly", "shoulders", { c: false, mu2: ["back"], eq: ["db"], rr: [12, 20], rest: 45, w: "db", cue: "Hinge forward, lead with the elbows." }),
  X("reardelt", "cfp", "Cable face pull", "shoulders", { c: false, mu2: ["back"], eq: ["cable"], rr: [12, 20], rest: 45, w: "mach", cue: "Rope to the forehead, externally rotate at the end." }),
  X("reardelt", "crdf", "Cross-body cable rear delt fly", "shoulders", { c: false, mu2: ["back"], eq: ["cable"], rr: [12, 18], rest: 45, w: "mach", cue: "Sweep arm back at ~45° without twisting torso." }),
  X("reardelt", "pyt", "Prone Y-T-W raise", "shoulders", { c: false, mu2: ["back"], rr: [10, 15], rest: 45, cue: "Face down, slow, light and controlled." }),

  /* biceps */
  X("biceps", "bay", "Bayesian cable curl", "biceps", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Step ahead of low pulley so arm sits behind torso for stretch." }),
  X("biceps", "idc", "Incline dumbbell curl", "biceps", { c: false, eq: ["db", "bench"], rr: [8, 12], rest: 60, w: "db", cue: "Let the arms hang behind the torso for a long stretch." }),
  X("biceps", "pre", "Preacher curl (EZ-bar / machine)", "biceps", { c: false, eq: ["cable"], rr: [8, 12], rest: 60, w: "mach", cue: "Lower to a controlled stretch, curl without lifting elbows." }),
  X("biceps", "ezc", "EZ-bar curl", "biceps", { c: false, eq: ["bb"], rr: [8, 12], rest: 60, w: "bb", cue: "Elbows locked to sides, 2s lowering." }),
  X("biceps", "ham", "Dumbbell hammer curl", "biceps", { c: false, eq: ["db"], rr: [10, 15], rest: 60, w: "db", cue: "Neutral grip, targets brachialis and forearms." }),
  X("biceps", "dc", "Dumbbell curl", "biceps", { c: false, eq: ["db"], rr: [8, 12], rest: 60, w: "db", cue: "No swinging, full supination at the top." }),
  X("biceps", "bbc", "Barbell curl", "biceps", { c: false, eq: ["bb"], rr: [8, 12], rest: 60, w: "bb", cue: "Elbows pinned to the sides." }),
  X("biceps", "ccu", "Cable curl", "biceps", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Constant tension, squeeze at the top." }),
  X("biceps", "spid", "Spider curl", "biceps", { c: false, eq: ["db", "bench"], rr: [10, 14], rest: 60, w: "db", cue: "Chest on incline bench, arms straight down, peak contraction." }),
  X("biceps", "bc", "Banded curl", "biceps", { c: false, eq: ["bands"], rr: [12, 20], rest: 45, w: "band", cue: "Stand on the band, slow lowering." }),
  X("biceps", "irc", "Inverted-row bicep curl", "biceps", { c: false, eq: ["lowbar"], cal: 1, bw: 1, rr: [8, 15], rest: 60, cue: "Hang under the bar, curl the body up with the arms." }),
  X("biceps", "bagc", "Bag curl", "biceps", { c: false, eq: ["bag"], rr: [10, 15], rest: 45, w: "bagdb", cue: "Hold the bag by the handles, strict curl." }),
  X("biceps", "tic", "Towel isometric curl", "biceps", { c: false, rr: [20, 40], unit: "s", rest: 45, cue: "Loop a towel under a foot, pull against it hard." }),

  /* triceps */
  X("triceps", "cohe", "Overhead cable tricep extension", "triceps", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Deep stretch behind head, lock elbows cleanly." }),
  X("triceps", "tdip", "Parallel-bar dip (upright, triceps)", "triceps", { c: false, mu2: ["chest"], eq: ["dipbars"], cal: 1, bw: 1, rr: [8, 15], rest: 90, cue: "Torso upright, elbows back, lock out fully." }),
  X("triceps", "cpd", "Cable pushdown", "triceps", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Elbows pinned, flare the rope at the bottom." }),
  X("triceps", "sacp", "Single-arm cable tricep pushdown", "triceps", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "No attachment needed; drive wrist straight down past hip." }),
  X("triceps", "ohe", "Overhead dumbbell extension", "triceps", { c: false, eq: ["db"], rr: [10, 15], rest: 60, w: "db", cue: "Elbows pointing up, deep stretch behind the head." }),
  X("triceps", "ezsk", "EZ-bar skullcrusher", "triceps", { c: false, eq: ["bb", "bench"], rr: [8, 12], rest: 75, w: "bb", cue: "Lower behind forehead for deep long-head stretch." }),
  X("triceps", "cgbp", "Close-grip bench press", "triceps", { mu2: ["chest"], eq: ["bb", "bench"], rr: [6, 10], rest: 120, w: "bb", cue: "Hands shoulder-width, elbows tucked close to ribs." }),
  X("triceps", "mdip", "Seated machine dip", "triceps", { c: false, mu2: ["chest"], eq: ["cable"], rr: [8, 14], rest: 75, w: "mach", cue: "Stay upright, press down to full extension." }),
  X("triceps", "skc", "Dumbbell skullcrusher", "triceps", { c: false, eq: ["db", "bench"], rr: [8, 12], rest: 60, w: "db", cue: "Lower to the forehead, elbows still." }),
  X("triceps", "bpd", "Banded pushdown", "triceps", { c: false, eq: ["bands"], rr: [12, 20], rest: 45, w: "band", cue: "Anchor high, pin the elbows." }),
  X("triceps", "dpu", "Diamond push-up", "triceps", { c: false, mu2: ["chest"], cal: 1, bw: 1, rr: [8, 15], rest: 75, bm: "push", bmr: [8, 999], cue: "Hands form a diamond, elbows brush the ribs." }),
  X("triceps", "bdip", "Bench / chair dip", "triceps", { c: false, cal: 1, bw: 1, rr: [8, 15], rest: 75, cue: "Stay close to the seat, shoulders down." }),

  /* squat / quads */
  X("squat", "bsq", "Barbell back squat", "quads", { mu2: ["glutes"], eq: ["bb"], rr: [5, 8], rest: 180, w: "bb", cue: "Brace, hit depth, drive the floor away." }),
  X("squat", "hack", "Hack squat", "quads", { mu2: ["glutes"], eq: ["cable"], rr: [6, 10], rest: 150, w: "mach", cue: "Low-mid foot placement, full knee flexion, control bottom." }),
  X("squat", "pend", "Pendulum squat", "quads", { mu2: ["glutes"], eq: ["cable"], rr: [8, 12], rest: 150, w: "mach", cue: "Deep knee travel, pause 1s at bottom." }),
  X("squat", "fsq", "Barbell front squat", "quads", { mu2: ["glutes", "abs"], eq: ["bb"], rr: [5, 8], rest: 150, w: "bb", cue: "Elbows high, upright torso, drop straight between heels." }),
  X("squat", "smsq", "Smith machine squat", "quads", { mu2: ["glutes"], eq: ["cable"], rr: [8, 12], rest: 120, w: "mach", cue: "Feet slightly forward, upright torso, full depth." }),
  X("squat", "lp", "Leg press", "quads", { mu2: ["glutes"], eq: ["cable"], rr: [8, 12], rest: 120, w: "mach", cue: "Deep range, do not lock the knees hard." }),
  X("squat", "lext", "Leg extension", "quads", { c: false, eq: ["cable"], rr: [10, 15], rest: 75, w: "mach", cue: "Lock hips into seat, 1s hard squeeze at top, 2s lower." }),
  X("squat", "gob", "Goblet squat", "quads", { mu2: ["glutes"], eq: ["db"], rr: [8, 12], rest: 90, w: "db", cue: "Elbows inside the knees, tall chest." }),
  X("squat", "bagsq", "Bag front squat", "quads", { mu2: ["glutes"], ay: ["bag"], cal: 1, rr: [8, 12], rest: 90, w: "bagdb", cue: "Hold the bag on the chest, sit between the heels." }),
  X("squat", "siss", "Sissy squat (band-assisted if needed)", "quads", { cal: 1, bw: 1, rr: [8, 15], rest: 90, cue: "Knees travel forward, torso leans back, hold a support." }),
  X("squat", "bsqt", "Tempo bodyweight squat (3-1-1)", "quads", { mu2: ["glutes"], cal: 1, bw: 1, rr: [12, 20], rest: 60, cue: "3s down, 1s pause, drive up." }),

  /* hinge / posterior chain */
  X("hinge", "rdlb", "Romanian deadlift (barbell)", "hams", { mu2: ["glutes"], eq: ["bb"], rr: [6, 10], rest: 150, w: "bb", cue: "Hips back, bar glued to the legs, feel the hamstrings." }),
  X("hinge", "sldl", "Stiff-leg deadlift (barbell)", "hams", { mu2: ["glutes"], eq: ["bb"], rr: [6, 10], rest: 150, w: "bb", cue: "Minimal knee bend, hinge deep, drive hips through." }),
  X("hinge", "rdld", "Romanian deadlift (dumbbell)", "hams", { mu2: ["glutes"], eq: ["db"], rr: [8, 12], rest: 120, w: "db", cue: "Soft knees, push hips back." }),
  X("hinge", "bht", "Barbell hip thrust", "glutes", { mu2: ["hams"], eq: ["bb", "bench"], rr: [8, 12], rest: 120, w: "bb", cue: "Ribs down, chin tucked, 1s glute lockout at top." }),
  X("hinge", "bext", "45° back extension (glute/ham focus)", "glutes", { mu2: ["hams"], eq: ["cable"], rr: [10, 15], rest: 75, w: "mach", cue: "Round upper back slightly, hinge at hips and squeeze glutes." }),
  X("hinge", "cpt", "Cable pull-through", "glutes", { mu2: ["hams"], eq: ["cable"], rr: [12, 16], rest: 75, w: "mach", cue: "Push hips far back between legs, snap hips forward." }),
  X("hinge", "slrdl", "Single-leg RDL (bag / dumbbell optional)", "hams", { mu2: ["glutes"], cal: 1, rr: [8, 12], rest: 90, w: "optbag", cue: "Square hips, reach long, flat back." }),
  X("hinge", "ht", "Hip thrust (bench or floor, loaded)", "glutes", { mu2: ["hams"], rr: [8, 15], rest: 90, w: "optbag", cue: "Chin tucked, pause 1s at the top." }),
  X("hinge", "bgm", "Banded good morning", "hams", { mu2: ["glutes"], eq: ["bands"], rr: [12, 15], rest: 60, w: "band", cue: "Stand on the band, hinge with a flat back." }),

  /* lunge / unilateral */
  X("lunge", "bss", "Bulgarian split squat", "quads", { mu2: ["glutes"], cal: 1, rr: [8, 12], rest: 90, w: "optbag", cue: "Rear foot on a bench, front shin vertical." }),
  X("lunge", "wl", "Walking dumbbell lunge", "quads", { mu2: ["glutes"], eq: ["db"], rr: [10, 14], rest: 90, w: "db", cue: "Long step, drive through the front heel." }),
  X("lunge", "su", "Step-up", "quads", { mu2: ["glutes"], eq: ["step"], rr: [8, 12], rest: 75, w: "optbag", cue: "Drive with the front leg only, control down." }),
  X("lunge", "rl", "Reverse lunge", "quads", { mu2: ["glutes"], cal: 1, rr: [10, 14], rest: 75, w: "optbag", cue: "Step back, torso upright." }),
  X("lunge", "habd", "Hip abduction machine", "glutes", { c: false, eq: ["cable"], rr: [12, 20], rest: 60, w: "mach", cue: "Slight forward lean, push knees wide and hold 1s." }),
  X("lunge", "hadd", "Hip adduction machine", "quads", { c: false, eq: ["cable"], rr: [12, 18], rest: 60, w: "mach", cue: "Full controlled stretch, squeeze pads together cleanly." }),

  /* hamstring curl */
  X("hamcurl", "slcm", "Seated leg curl", "hams", { c: false, eq: ["cable"], rr: [10, 15], rest: 75, w: "mach", cue: "Lock lap pad tight for deep hamstring stretch; slow return." }),
  X("hamcurl", "lc", "Lying / seated leg curl", "hams", { c: false, eq: ["cable"], rr: [10, 15], rest: 75, w: "mach", cue: "Slow lowering, hold the squeeze." }),
  X("hamcurl", "nord", "Nordic hamstring curl (assisted)", "hams", { c: false, cal: 1, bw: 1, rr: [4, 8], rest: 120, cue: "Keep hips straight, resist gravity as slowly as possible." }),
  X("hamcurl", "slc", "Slider / towel leg curl", "hams", { c: false, mu2: ["glutes"], cal: 1, bw: 1, rr: [8, 15], rest: 75, cue: "Hips high, drag the heels in slowly." }),
  X("hamcurl", "blc", "Banded leg curl", "hams", { c: false, eq: ["bands"], rr: [12, 20], rest: 60, w: "band", cue: "Anchor low, curl against the band." }),
  X("hamcurl", "sgb", "Single-leg glute bridge", "glutes", { c: false, mu2: ["hams"], cal: 1, bw: 1, rr: [10, 15], rest: 60, cue: "Drive through the heel, pause at the top." }),

  /* calves */
  X("calves", "lpc", "Leg press / standing machine calf raise", "calves", { c: false, eq: ["cable"], rr: [10, 16], rest: 60, w: "mach", cue: "2s pause at full bottom stretch, drive through big toe." }),
  X("calves", "stcr", "Seated calf raise", "calves", { c: false, eq: ["cable"], rr: [12, 20], rest: 45, w: "mach", cue: "Full bottom stretch, pause 1s, smooth rise." }),
  X("calves", "scr", "Single-leg calf raise (step, loaded)", "calves", { c: false, eq: ["step"], cal: 1, rr: [10, 20], rest: 45, w: "optbag", cue: "Full stretch, 2s pause at the top." }),
  X("calves", "dcr", "Standing dumbbell calf raise", "calves", { c: false, eq: ["db"], rr: [12, 20], rest: 45, w: "db", cue: "Pause at the stretch, rise high." }),
  X("calves", "fcr", "Single-leg calf raise (floor)", "calves", { c: false, cal: 1, bw: 1, rr: [15, 25], rest: 45, cue: "Slow tempo, squeeze at the top." }),

  /* abs */
  X("abs", "hlr", "Hanging leg raise", "abs", { c: false, eq: ["pullbar"], cal: 1, bw: 1, rr: [8, 15], rest: 60, cue: "Curl the pelvis up, no swing." }),
  X("abs", "cc", "Cable crunch", "abs", { c: false, eq: ["cable"], rr: [10, 15], rest: 60, w: "mach", cue: "Round the spine, hips still." }),
  X("abs", "abw", "Ab wheel rollout", "abs", { c: false, cal: 1, bw: 1, rr: [8, 15], rest: 60, cue: "Posterior pelvic tilt, brace hard, don't let lower back sag." }),
  X("abs", "dwc", "Decline weighted crunch", "abs", { c: false, eq: ["bench"], rr: [10, 16], rest: 60, w: "db", cue: "Flex the spine through full range, control down." }),
  X("abs", "pal", "Cable Pallof press", "abs", { c: false, eq: ["cable"], rr: [10, 15], rest: 45, w: "mach", cue: "Press handle straight out and resist rotation for 2s." }),
  X("abs", "hb", "Hollow-body hold", "abs", { c: false, cal: 1, bw: 1, rr: [20, 45], unit: "s", rest: 45, cue: "Low back glued to the floor." }),
  X("abs", "rc", "Reverse crunch", "abs", { c: false, cal: 1, bw: 1, rr: [10, 20], rest: 45, cue: "Lift the hips, no momentum." }),
  X("abs", "svac", "Stomach vacuum", "abs", { c: false, cal: 1, rr: [15, 30], unit: "s", rest: 30, cue: "Exhale all air, pull the navel to the spine." })
].filter(Boolean);

const AV = {
  shoulder: ["vpush:ohp", "vpush:dbp", "vpush:dbps", "vpush:smohp", "vpush:arn", "vpush:fpike", "vpush:pike", "vpush:msp", "vpush:bohp", "hpush:dip", "hpush:wdip", "triceps:tdip", "hpush:arch", "lateral:upr"],
  elbow: ["hpush:dip", "hpush:wdip", "triceps:tdip", "triceps:skc", "triceps:ezsk", "triceps:ohe", "triceps:cohe", "triceps:dpu", "triceps:bdip"],
  wrist: ["hpush:pu", "hpush:wpush", "hpush:fepu", "hpush:arch", "hpush:bpu", "hpush:ipu", "triceps:dpu", "vpush:pike", "vpush:fpike", "hpush:dip", "hpush:wdip", "triceps:tdip", "chestfly:ppl", "triceps:bdip"],
  back: ["hrow:bbr", "hrow:pend", "hinge:rdlb", "hinge:sldl", "hinge:rdld", "hinge:slrdl", "hinge:bgm", "squat:bsq", "squat:fsq", "vpush:ohp"],
  knee: ["squat:siss", "lunge:bss", "lunge:wl", "lunge:su", "lunge:rl", "squat:bsq", "squat:fsq", "squat:bagsq", "squat:hack", "squat:pend"]
};

const SES = {
  FBA: ["Full Body A", [["squat", 0], ["hpush", 0], ["vpull", 0], ["hinge", 0], ["lateral", 0], ["abs", 0], ["biceps", 0]]],
  FBB: ["Full Body B", [["lunge", 0], ["vpush", 0], ["hrow", 0], ["hamcurl", 0], ["triceps", 0], ["reardelt", 0], ["calves", 0]]],
  FBC: ["Full Body C", [["squat", 1], ["hpush", 1], ["vpull", 1], ["hrow", 1], ["lateral", 1], ["biceps", 1], ["abs", 1]]],
  U1: ["Upper 1", [["hpush", 0], ["vpull", 0], ["vpush", 0], ["hrow", 0], ["chestfly", 0], ["lateral", 0], ["triceps", 0]]],
  L1: ["Lower 1", [["squat", 0], ["hinge", 0], ["lunge", 0], ["hamcurl", 0], ["calves", 0], ["abs", 0]]],
  U2: ["Upper 2", [["vpull", 1], ["hpush", 1], ["hrow", 1], ["vpush", 1], ["reardelt", 0], ["biceps", 0], ["triceps", 1]]],
  L2: ["Lower 2", [["hinge", 1], ["squat", 1], ["lunge", 1], ["hamcurl", 1], ["calves", 1], ["abs", 1]]],
  PUSH: ["Push", [["hpush", 0], ["vpush", 0], ["hpush", 1], ["chestfly", 0], ["lateral", 0], ["triceps", 0], ["triceps", 1]]],
  PULL: ["Pull", [["vpull", 0], ["hrow", 0], ["vpull", 1], ["reardelt", 0], ["biceps", 0], ["biceps", 1]]],
  LEGS: ["Legs", [["squat", 0], ["hinge", 0], ["lunge", 0], ["hamcurl", 0], ["calves", 0], ["abs", 0]]]
};
const SPLIT = {
  3: [[0, "FBA"], [2, "FBB"], [4, "FBC"]],
  4: [[0, "U1"], [1, "L1"], [3, "U2"], [4, "L2"]],
  5: [[0, "PUSH"], [1, "PULL"], [2, "LEGS"], [4, "U2"], [5, "L2"]],
  6: [[0, "PUSH"], [1, "PULL"], [2, "LEGS"], [3, "PUSH"], [4, "PULL"], [5, "LEGS"]]
};
const SLOTMU = { hpush: "chest", chestfly: "chest", vpull: "back", hrow: "back", vpush: "shoulders", lateral: "shoulders", reardelt: "shoulders", biceps: "arms", triceps: "arms", squat: "legs", lunge: "legs", hinge: "legs", hamcurl: "legs", calves: "legs", abs: "abs" };
const PRI_EXTRA = { chest: ["chestfly"], back: ["hrow"], shoulders: ["lateral"], arms: ["biceps", "triceps"], legs: ["hamcurl"], abs: ["abs"] };
const MAXEX = { 30: 4, 45: 5, 60: 7, 75: 9 };
