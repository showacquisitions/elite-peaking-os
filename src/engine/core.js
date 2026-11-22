/* Elite OS v5.0 — Core Pure Engine (Dates, Training, Meal Solver, EWMA & Adaptive TDEE) */
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addD = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const diffD = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const mondayOf = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const mod = (a, n) => ((a % n) + n) % n;
const LB = 2.20462, IN = 2.54;
const fmtW = (kg, u) => u === "metric" ? `${Math.round(kg * 2) / 2} kg` : `${Math.round(kg * LB * 2) / 2} lb`;
const kcalOf = m => 4 * m.P + 4 * m.C + 9 * m.F;

function bannedTags(p) {
  const b = new Set(VEG_BAN[p.diet] || []);
  (p.excl || []).forEach(x => b.add(x === "eggs" ? "egg" : x));
  return b;
}
function foodOK(id, ban) { return !FOODS[id].t.some(t => ban.has(t)); }
function tplOK(t, ban) { return [t.p, t.c, t.f, ...t.fx.map(x => x[0])].every(id => foodOK(id, ban)); }

/* ---------- TARGETS ---------- */
function baseTargets(p) {
  const w = p.kg, male = p.sex === "m", bf = p.bf > 0 ? p.bf : 0, notes = [];
  const lbm = bf ? w * (1 - bf / 100) : null;
  const bmr = lbm ? 370 + 21.6 * lbm : 10 * w + 6.25 * p.cm - 5 * p.age + (male ? 5 : -161);
  const tdee = bmr * ACT[p.act];
  let goal = p.goal;
  const lowBf = bf && (male ? bf < 10 : bf < 18);
  if (goal === "cut" && p.age < 18) { goal = "recomp"; notes.push("Under 18: fat-loss deficits are disabled. Plan set to maintenance and strength."); }
  else if (goal === "cut" && lowBf) { goal = "recomp"; notes.push("Body fat is already low: deficit disabled. Plan set to maintenance."); }
  let pct = 0;
  if (goal === "cut") pct = -({ cons: 0.10, std: 0.18, agg: 0.25 }[p.rate]);
  else if (goal === "bulk") pct = { cons: 0.05, std: 0.10, agg: 0.15 }[p.rate];
  else if (goal === "recomp") pct = (bf && bf >= (male ? 18 : 28)) ? -0.05 : 0;
  let kcal = tdee * (1 + pct) + (p.kcalAdj || 0);
  const floor = male ? 1500 : 1200;
  if (kcal < floor) { kcal = floor; notes.push(`Calories raised to the ${floor} kcal safety floor.`); }
  let P = ({ cut: 2.2, peak: 2.0 }[goal] || 2.0) * w;
  if (lbm) P = Math.min(P, 2.7 * lbm);
  let F = Math.max(0.7 * w, 0.22 * kcal / 9), C = (kcal - 4 * P - 9 * F) / 4;
  if (C < 1.5 * w) { F = Math.max(0.6 * w, (kcal - 4 * P - 6 * w) / 9); C = Math.max(0, (kcal - 4 * P - 9 * F) / 4); notes.push("Carbs are low for hard training. Consider a slower rate of loss."); }
  return { bmr, tdee, goal, pct, kcal: 4 * P + 4 * C + 9 * F, P, C, F, lbm, notes, fiber: 14 * kcal / 1000, water: Math.round(w * 35 / 100) / 10, floor };
}

/* ---------- PEAK WEEK ---------- */
const PEAK = [
  { k: "deplete", l: "Depletion + hard training", c: 2.5, f: 1.0, train: true },
  { k: "deplete", l: "Depletion + hard training", c: 2.5, f: 1.0, train: true },
  { k: "deplete", l: "Depletion + hard training", c: 2.5, f: 1.0, train: true },
  { k: "flush", l: "Flush & transition (Zone 2)", c: 4.0, f: 0.9 },
  { k: "load1", l: "Carb load 1 + light pump", c: 7.0, f: 0.5 },
  { k: "load2", l: "Carb load 2 + posing", c: 8.0, f: 0.5 },
  { k: "event", l: "Event day", c: 5.0, f: 0.6 }
];
function peakMacros(t, p, i) {
  const ph = PEAK[i], cap = p.sex === "f" ? 7 : 8.5;
  return { P: 2.0 * p.kg, C: Math.min(ph.c, cap) * p.kg, F: Math.max(0.5, ph.f) * p.kg };
}

/* ---------- EXERCISE PICKERS & PROGRAM ---------- */
function eligible(slot, p) {
  const has = k => p.eq.includes(k), inj = p.inj || [];
  let list = EX.filter(e => e.slot === slot && e.eq.every(has) && !inj.some(j => AV[j] && AV[j].includes(e.slot + ":" + e.id)) && (!e.ay || e.ay.some(has)) && (!e.bm || (p[e.bm + "Max"] >= e.bmr[0] && p[e.bm + "Max"] <= e.bmr[1])));
  if (p.style === "cal") list = list.map((e, i) => [e, i]).sort((a, b) => (b[0].cal - a[0].cal) || (a[1] - b[1])).map(x => x[0]);
  else if (p.style === "wt") list = list.map((e, i) => [e, i]).sort((a, b) => (a[0].cal - b[0].cal) || (a[1] - b[1])).map(x => x[0]);
  return list;
}
function pickEx(slot, v, p, block, used, swap) {
  const list = eligible(slot, p), n = list.length;
  if (!n) return null;
  const K = Math.min(3, n), start = (v + mod(block, K) + (swap || 0)) % n;
  for (let k = 0; k < n; k++) { const e = list[(start + k) % n]; if (!used.has(e.n)) { used.add(e.n); return e; } }
  return null;
}
function loadText(e, p) {
  const bag = p.eq.includes("bag");
  switch (e.w) {
    case "bagdb": return bag ? `Bag / vest ${fmtW(p.bagKg, p.units)}` : "Dumbbell (heavy enough for target RIR)";
    case "optbag": return bag ? `Bodyweight, bag ${fmtW(p.bagKg, p.units)} when easy` : "Bodyweight, add dumbbells when easy";
    case "db": return "Dumbbells, load for target RIR";
    case "bb": return "Barbell, load for target RIR";
    case "band": return "Band tier for target RIR";
    case "mach": return "Stack, load for target RIR";
    default: return "Bodyweight";
  }
}
const RIR = { beg: [3, 3, 2, 4], int: [3, 2, 1, 4], adv: [3, 2, 1, 4] };
function setsFor(p, e, wk, priBoost) {
  let b = e.c ? { beg: 3, int: 4, adv: 4 }[p.exp] : { beg: 2, int: 3, adv: 3 }[p.exp];
  if (wk === 2 && p.exp !== "beg") b += 1;
  b += priBoost;
  if (p.days >= 6) b -= 1;
  b = Math.min(b, 5);
  return wk === 3 ? Math.max(2, Math.ceil(b * 0.6)) : b;
}
function priBoostFor(e, slot, p) { return (p.pri || []).includes(SLOTMU[slot]) ? 1 : 0; }
function buildProgram(p, block, swaps) {
  const pat = SPLIT[p.days] || SPLIT[4], maxEx = MAXEX[p.len] || 7, out = [];
  pat.forEach(([dow, key], si) => {
    const [name, slots0] = SES[key];
    let slots = slots0.map(s => s.slice());
    (p.pri || []).forEach((g, gi) => {
      const arr = PRI_EXTRA[g] || [], sl = arr[gi % arr.length];
      const first = pat.findIndex(([, k]) => SES[k][1].some(x => SLOTMU[x[0]] === g));
      if (sl && first === si && !slots.some(x => x[0] === sl && x[1] === 2)) slots.splice(Math.min(2, slots.length), 0, [sl, 2]);
    });
    slots = slots.slice(0, maxEx);
    const used = new Set(), ex = [];
    slots.forEach((s, idx) => {
      const key2 = `${name}|${idx}`;
      const e = pickEx(s[0], s[1], p, block, used, swaps && swaps[key2] || 0);
      if (e) ex.push({ e, slot: s[0], key: key2, pri: priBoostFor(e, s[0], p) });
    });
    out.push({ dow, name, ex });
  });
  return out;
}
function instSession0(sess, p, wk) {
  const rir = RIR[p.exp][wk];
  return {
    name: sess.name, dow: sess.dow, wk, rir,
    ex: sess.ex.map(x => {
      const e = x.e, sets = setsFor(p, e, wk, x.pri);
      let reps = e.bmReps ? `${Math.max(1, p[e.bm + "Max"] - rir)}` : `${e.rr[0]}–${e.rr[1]}`;
      if (e.unit) reps += e.unit;
      return {
        id: e.id, uid: `${e.slot}:${e.id}`, name: e.n, slot: x.slot, key: x.key, sets, reps, rir,
        rest: e.rest, cue: e.cue, load: loadText(e, p), mu: e.mu, mu2: e.mu2, bmReps: !!e.bmReps,
        bw: !!e.bw, hi: e.rr[1], note: e.bmReps ? `Sets at max (${p[e.bm + "Max"]}) − ${rir} RIR` : ""
      };
    })
  };
}
function instSession(sess, p, wk) {
  const s = instSession0(sess, p, wk);
  if (p.autoSS === "acc") for (let i = 2; i + 1 < s.ex.length; i += 2) {
    const a = s.ex[i], b = s.ex[i + 1];
    if (a.mu !== b.mu && !a.bmReps && !b.bmReps) { a.ss = true; b.rest = Math.max(a.rest, b.rest); } else i--;
  }
  return s;
}
function planDays(cp) {
  if (cp.plans) { const p = cp.plans[cp.active]; return p && !p.deleted ? p.days : null; }
  return cp.days || null;
}
function customSessions(st, p, wk) {
  const cp = st.cplan;
  if (!cp || cp.mode !== "custom") return null;
  const days = planDays(cp); if (!days) return null;
  const rir = RIR[p.exp][wk], out = [];
  for (let dow = 0; dow < 7; dow++) {
    const d = days[dow];
    if (!d || !Array.isArray(d.ex) || !d.ex.length) continue;
    out.push({
      name: d.name || "Workout", dow, wk, rir,
      ex: d.ex.map((x, ix, arr) => {
        const base = Math.max(1, Math.min(10, Math.round(+x.sets) || 3));
        const sets = (wk === 3 && cp.deload !== false) ? Math.max(2, Math.ceil(base * 0.6)) : base;
        const reps = String(x.reps || "8\u201312"), hm = reps.match(/(\d+)\D*$/);
        const lib = EX.find(e => `${e.slot}:${e.id}` === x.uid);
        return {
          id: x.id || x.uid, uid: x.uid, name: x.name, slot: x.slot || "custom", key: "cust", sets, reps, rir,
          rest: Math.max(0, Math.min(600, Math.round(+x.rest) || 90)), cue: x.cue || "", load: x.load || "Load for target RIR",
          mu: x.mu || "chest", mu2: x.mu2 || [], bmReps: false, bw: !!(x.bw || (lib && lib.bw)), hi: hm ? +hm[1] : 0, note: "",
          demo: /^https:\/\//.test(x.demo || "") ? String(x.demo).slice(0, 300) : "",
          ss: !!x.ss && ix < arr.length - 1, wu: Math.max(0, Math.min(4, Math.round(+x.wu) || 0)),
          prog: x.prog === "reps" ? "reps" : "dbl", inc: Math.max(0, +x.inc || 0)
        };
      })
    });
  }
  return out.length ? out : null;
}
function pumpCircuit(p, block, rounds) {
  const used = new Set(), ex = [];
  ["hpush", "vpull", "lateral", "biceps", "triceps"].forEach(sl => {
    const e = pickEx(sl, 0, p, block, used, 0);
    if (e) ex.push({ id: e.id, uid: `pump:${e.id}`, name: e.n, slot: sl, key: "pump", sets: rounds, reps: e.unit ? `${e.rr[0]}${e.unit}` : "15–25", rir: 4, rest: e.rest > 60 ? 45 : 30, cue: "Light, fast, constant tension. No sweat, stop 4 reps short.", load: loadText(e, p), mu: e.mu, mu2: e.mu2, bw: !!e.bw, note: "" });
  });
  return ex;
}
function weeklyVolume(sessions) {
  const v = {}; MUSCLES.forEach(([k]) => v[k] = 0);
  sessions.forEach(s => s.ex.forEach(x => { v[x.mu] = (v[x.mu] || 0) + x.sets; (x.mu2 || []).forEach(m => v[m] = (v[m] || 0) + x.sets * 0.5); }));
  return v;
}

/* ---------- MEAL SOLVER ---------- */
function solveMeal(t, T) {
  const fx = t.fx.map(([id, g]) => ({ id, g }));
  const fixed = fx.reduce((a, x) => { const f = FOODS[x.id]; return { P: a.P + f.p * x.g / 100, C: a.C + f.c * x.g / 100, F: a.F + f.f * x.g / 100 }; }, { P: 0, C: 0, F: 0 });
  const R = [T.P - fixed.P, T.C - fixed.C, T.F - fixed.F];
  const ids = [t.p, t.c, t.f], v = ids.map(id => [FOODS[id].p / 100, FOODS[id].c / 100, FOODS[id].f / 100]);
  const w = [2, 1, 1.2], cap = [600, FOODS[t.c].max || 800, FOODS[t.f].max || 90], g = [0, 0, 0];
  for (let it = 0; it < 600; it++) for (let i = 0; i < 3; i++) {
    let num = 0, den = 0;
    for (let k = 0; k < 3; k++) { let r = R[k]; for (let j = 0; j < 3; j++) r -= v[j][k] * g[j]; num += w[k] * v[i][k] * r; den += w[k] * v[i][k] * v[i][k]; }
    if (den > 0) g[i] = Math.min(cap[i], Math.max(0, g[i] + num / den));
  }
  const minP = v[0][0] > 0 ? 0.7 * R[0] / v[0][0] : 0;
  if (g[0] < minP) {
    g[0] = Math.min(cap[0], minP);
    for (let it = 0; it < 400; it++) for (let i = 1; i < 3; i++) {
      let num = 0, den = 0;
      for (let k = 0; k < 3; k++) { let r = R[k]; for (let j = 0; j < 3; j++) r -= v[j][k] * g[j]; num += w[k] * v[i][k] * r; den += w[k] * v[i][k] * v[i][k]; }
      if (den > 0) g[i] = Math.min(cap[i], Math.max(0, g[i] + num / den));
    }
  }
  const items = [];
  ids.forEach((id, i) => {
    const st = FOODS[id].st; let q = Math.round(g[i] / st) * st;
    if (FOODS[id].u && FOODS[id].u[0] === "egg" && q > 0 && q < 50) q = 50;
    if (q > 0) items.push({ id, g: q });
  });
  fx.forEach(x => items.push({ id: x.id, g: x.g }));
  const m = items.reduce((a, x) => { const f = FOODS[x.id]; return { P: a.P + f.p * x.g / 100, C: a.C + f.c * x.g / 100, F: a.F + f.f * x.g / 100 }; }, { P: 0, C: 0, F: 0 });
  return { tid: t.id, name: t.n, items, P: Math.round(m.P), C: Math.round(m.C), F: Math.round(m.F), kcal: Math.round(kcalOf(m)) };
}
const SUB = { gyog: "lfgyog", cott: "lfcott" };
function lfMap(t) {
  const m = Object.assign({}, t, { p: SUB[t.p] || t.p, c: SUB[t.c] || t.c, f: SUB[t.f] || t.f, fx: t.fx.map(([id, g]) => [SUB[id] || id, g]) });
  if (m.p !== t.p || m.c !== t.c || m.f !== t.f) {
    m.n = t.n.replace("Greek yogurt", "lactose-free Greek yogurt").replace(/[Cc]ottage cheese/, "lactose-free cottage cheese");
    m.n = m.n[0].toUpperCase() + m.n.slice(1);
  }
  return m;
}
function tplCost(t) {
  const per = (id, k, amt) => foodCost(id, amt / (FOODS[id][k] / 100));
  return per(t.p, "p", 30) + per(t.c, "c", 60) + per(t.f, "f", 12) + t.fx.reduce((a, [id, g]) => a + foodCost(id, g), 0);
}
function buildMeals(p, macros, seed, swapOff, st) {
  const ban = bannedTags(p), lf = ban.has("lactose"), pf = p.priceF || 1, shares = SHARES[p.meals] || SHARES[4], usedT = new Set(), meals = [];
  const pr = (st && st.prefs) || {}, fp = pr.foods || {}, mp = pr.meals || {};
  const ids = t => [t.p, t.c, t.f, ...t.fx.map(x => x[0])];
  const dis = x => x.m.user ? mp[x.m.id] === -1 : (mp[x.o.id] === -1 || ids(x.o).concat(ids(x.m)).some(id => fp[id] === -1));
  const like = x => x.m.user ? (x.m.r.fav ? 3 : 1) : Math.min(4, [x.m.p, x.m.c, x.m.f].filter(id => fp[id] === 1).length + (mp[x.o.id] === 1 ? 2 : 0));
  const base = TPL.map(t => ({ o: t, m: lf ? lfMap(t) : t })).filter(x => tplOK(x.m, ban));
  const users = ((st && st.recipes) || []).filter(r => r.use !== false).map(r => ({ o: { id: "u" + r.id }, m: { id: "u" + r.id, n: r.name, s: r.slots, user: true, r } }));
  const all = base.concat(users);
  shares.forEach(([slot, sh], i) => {
    let pool = all.filter(x => x.m.s.includes(slot)), miss = false;
    if (!pool.length) pool = all.filter(x => x.m.s.includes("S"));
    const ok = pool.filter(x => !dis(x));
    if (ok.length) pool = ok; else if (pool.length) miss = true;
    if (p.budget === "budget" && pool.length > 3) { const c = x => x.m.user ? 0 : tplCost(x.m); pool = pool.slice().sort((x, y) => c(x) - c(y)).slice(0, Math.max(3, Math.ceil(pool.length * 0.6))); }
    const tgt = { P: macros.P * sh, C: macros.C * sh, F: macros.F * sh };
    if (!pool.length) { meals.push({ name: "Add a protein-rich meal that fits your diet", items: [], P: Math.round(tgt.P), C: Math.round(tgt.C), F: Math.round(tgt.F), kcal: Math.round(kcalOf(tgt)), slot, custom: true, cost: 0 }); return; }
    const wpool = []; pool.forEach(x => { for (let k = 0; k < 1 + like(x); k++) wpool.push(x); });
    const start = mod(seed * 7 + i * 3 + (swapOff[i] || 0), wpool.length);
    let pick = null;
    for (let k = 0; k < wpool.length; k++) { const c = wpool[(start + k) % wpool.length]; if (!usedT.has(c.m.id)) { pick = c; break; } }
    if (!pick) pick = wpool[start];
    usedT.add(pick.m.id);
    const t = pick.m;
    if (t.user) {
      const r = t.r, per = r.kcal || kcalOf(r), mult = Math.max(0.5, Math.min(3, Math.round(kcalOf(tgt) / per * 4) / 4));
      meals.push({ tid: t.id, name: t.n, items: [], user: true, mult, ing: r.ing || [], P: Math.round(r.P * mult), C: Math.round(r.C * mult), F: Math.round(r.F * mult), kcal: Math.round(per * mult), slot, share: sh, prep: "", rec: [r.time || "your recipe"].concat(r.steps || []), var: null, cost: 0 });
      return;
    }
    const m = solveMeal(t, tgt);
    m.slot = slot; m.share = sh; m.prep = [t.p, t.c, t.f].map(id => FOODS[id].prep).filter(Boolean).join(" ");
    m.rec = REC[t.id] || null; m.var = VAR[t.id] || null;
    m.cost = Math.round(m.items.reduce((a, it) => a + foodCost(it.id, it.g), 0) * pf * 100) / 100;
    if (miss) m.prefMiss = true;
    meals.push(m);
  });
  return meals;
}

/* ---------- WEEK BUILDER ---------- */
function buildWeek(p, st, monISO, curToday) {
  const bw = Math.floor(diffD(st.blockStart, monISO) / 7), wk = mod(bw, 4), block = Math.floor(bw / 4) + (st.blockOffset || 0);
  const T = typeof applyCoachTargets === "function" ? applyCoachTargets(baseTargets(p), st) : baseTargets(p), notes = T.notes.slice();
  const program = buildProgram(p, block, st.swaps || {});
  const cust = customSessions(st, p, wk);
  const sess = cust || program.map(s => instSession(s, p, wk));
  const nTrain = sess.length;
  const ev = p.goal === "peak" && p.event ? p.event : null;
  const toEv = ev ? diffD(curToday, ev) : null;
  const peak = ev && toEv >= 0 && toEv <= 7;
  const trainC = T.C * 1.10, restC = nTrain < 7 ? Math.max(1.0 * p.kg, (7 * T.C - nTrain * trainC) / (7 - nTrain)) : T.C;
  const days = [];
  for (let i = 0; i < 7; i++) {
    let date, label, session = null, kind = "rest", macros, phase = null;
    if (peak) {
      date = addD(ev, i - 6); phase = PEAK[i]; macros = peakMacros(T, p, i);
      if (i < 3) { session = sess[i % sess.length]; kind = "train"; label = session.name; }
      else if (i === 3) { kind = "flush"; label = "Zone 2 + decompression"; }
      else if (i === 4) { kind = "pump"; label = "Light pump"; session = { name: "Light pump (RIR 4)", rir: 4, wk: 0, ex: pumpCircuit(p, block, 2) }; }
      else if (i === 5) { kind = "posing"; label = "Posing & vacuums"; }
      else { kind = "event"; label = "Pre-event pump (T – 75 min)"; session = { name: "Pre-event pump", rir: 4, wk: 0, ex: pumpCircuit(p, block, 3) }; }
    } else {
      date = addD(monISO, i);
      const hit = sess.find(s => s.dow === i), asg = st.cx && st.cx.asg && st.cx.asg[date];
      if (asg && typeof asgSession === "function") {
        const a = asg.ex && asg.ex.length ? asgSession(asg, i, p, wk) : null;
        if (a) { session = a; kind = "train"; label = a.name; macros = { P: T.P, C: trainC, F: T.F }; }
        else { label = "Rest (from " + (asg.coach || "coach") + ")"; macros = { P: T.P, C: restC, F: T.F }; }
      } else if (hit) { session = hit; kind = "train"; label = hit.name; macros = { P: T.P, C: trainC, F: T.F }; }
      else { label = "Rest & recovery"; macros = { P: T.P, C: restC, F: T.F }; }
    }
    macros.kcal = Math.round(kcalOf(macros));
    const meals = buildMeals(p, macros, bw * 7 + i, (st.mswaps && st.mswaps[date]) || [], st);
    const act = { P: 0, C: 0, F: 0, kcal: 0 };
    meals.forEach(m => { act.P += m.P; act.C += m.C; act.F += m.F; act.kcal += m.kcal; });
    const cost = Math.round(meals.reduce((a, m) => a + (m.cost || 0), 0) * 100) / 100;
    days.push({ i, date, label, kind, session, macros, meals, actual: act, phase, cost });
  }
  const vol = weeklyVolume(sess);
  if (cust) notes.push("You are on your own training plan (Train tab). Meals and calories still follow your profile. Auto-rotation and swaps are off for your exercises.");
  if ((p.inj || []).length && !cust) notes.push("Exercises that commonly aggravate " + p.inj.join(", ") + " were removed. Stop anything that hurts and see a clinician for persistent pain.");
  if (ev && !peak) notes.push(`Peak week starts ${addD(ev, -6)}. Until then the plan runs at maintenance.`);
  return { T, days, wk, block, bw, vol, sessions: sess, peak: !!peak, notes, rir: RIR[p.exp][wk], nTrain, custom: !!cust };
}

/* ---------- GROCERIES ---------- */
function qtyText(id, g, units, buy) {
  const f = FOODS[id];
  const grams = buy ? g * f.raw : g;
  if (f.u) { const n = grams / f.u[1]; return `${n < 10 ? (Math.round(n * 2) / 2) : Math.round(n)} ${f.u[0]}${n > 1 ? "s" : ""}`; }
  if (!buy) return units === "metric" ? `${Math.round(grams)} g` : `${Math.round(grams)} g (${(grams / 28.35).toFixed(1)} oz)`;
  return units === "metric" ? `${Math.round(grams / 10) * 10} g` : grams >= 454 ? `${(grams / 453.6).toFixed(1)} lb` : `${Math.round(grams / 28.35)} oz`;
}
function grocery(week, units, pf) {
  const tot = {};
  week.days.forEach(d => d.meals.forEach(m => m.items.forEach(it => tot[it.id] = (tot[it.id] || 0) + it.g)));
  const groups = {};
  Object.keys(tot).forEach(id => {
    const f = FOODS[id], cat = f.cat || "Other";
    (groups[cat] = groups[cat] || []).push({ id, name: f.n, cooked: tot[id], text: qtyText(id, tot[id], units, true), cost: foodCost(id, tot[id]) * (pf || 1) });
  });
  Object.values(groups).forEach(a => a.sort((x, y) => y.cooked - x.cooked));
  return groups;
}

/* ---------- EWMA TREND WEIGHT & MACROFACTOR-STYLE ADAPTIVE TDEE ---------- */
function ewmaSeries(log, curToday, spanDays) {
  const n = spanDays || 28;
  const out = []; let ema = null; const alpha = 0.14;
  for (let i = n - 1; i >= 0; i--) {
    const d = addD(curToday, -i);
    const w = log && log[d] && +log[d].w > 0 ? +log[d].w : null;
    if (w != null) ema = ema == null ? w : alpha * w + (1 - alpha) * ema;
    out.push({ d, scale: w, trend: ema });
  }
  return out;
}
function weightTrend(log, curToday) {
  const pts = Object.keys(log || {}).filter(d => log[d] && log[d].w > 0 && diffD(d, curToday) <= 21 && diffD(d, curToday) >= 0).sort().map(d => ({ d, x: diffD(addD(curToday, -21), d), y: +log[d].w }));
  if (pts.length < 4 || pts[pts.length - 1].x - pts[0].x < 7) return null;
  const series = ewmaSeries(log, curToday, 28).filter(p => p.trend != null && diffD(p.d, curToday) <= 21);
  const first = series[0], last = series[series.length - 1];
  const span = first && last ? diffD(first.d, last.d) : 0;
  let perWeek, avg;
  if (span >= 7) {
    perWeek = (last.trend - first.trend) / span * 7;
    avg = last.trend;
  } else {
    const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
    let sxy = 0, sxx = 0; pts.forEach(p => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; });
    perWeek = (sxx ? sxy / sxx : 0) * 7; avg = my;
  }
  return { perWeek, rate: perWeek, avg, pct: perWeek / avg * 100, n: pts.length, trendNow: last ? last.trend : avg, ewma: series };
}
function adaptiveTDEE(log, nut, prof, curToday) {
  if (typeof prof === "string") { curToday = prof; prof = null; }
  const today = curToday || todayISO();
  const series = ewmaSeries(log, today, 28).filter(p => p.trend != null);
  const wPts = series.filter(p => p.scale != null);
  if (wPts.length < 6) return null;
  const first = series[0], last = series[series.length - 1], span = diffD(first.d, last.d);
  if (span < 10) return null;
  const intakes = [];
  for (let i = 0; i < span; i++) {
    const d = addD(first.d, i), e = nut && nut[d];
    if (e && e.k >= 800) intakes.push(e.k);
  }
  if (intakes.length < 7) return null;
  const avgIn = intakes.reduce((a, b) => a + b, 0) / intakes.length;
  const deltaKg = last.trend - first.trend;
  const est = Math.round(avgIn - (deltaKg * 7700 / span));
  const formula = prof ? baseTargets(prof).tdee : avgIn;
  if (!(est >= formula * 0.65 && est <= formula * 1.45)) return null;
  return { tdee: est, formula: Math.round(formula), diff: est - Math.round(formula), avgIn: Math.round(avgIn), days: intakes.length, wDays: wPts.length, deltaKg };
}
function advice(p, tr) {
  if (!tr) return null;
  const tgt = { cut: { cons: -0.4, std: -0.7, agg: -1 }, bulk: { cons: 0.15, std: 0.3, agg: 0.5 } }[p.goal === "cut" ? "cut" : p.goal === "bulk" ? "bulk" : ""];
  const target = tgt ? tgt[p.rate] : 0, tol = 0.2, diff = target - tr.pct;
  if (Math.abs(diff) <= tol) return { delta: 0, target, msg: "On track. Keep calories the same." };
  const raw = diff / 100 * tr.avg * 7700 / 7, delta = Math.max(-250, Math.min(250, Math.round(raw / 25) * 25));
  return { delta, target, msg: `EWMA trend ${tr.pct.toFixed(2)}%/wk vs target ${target.toFixed(2)}%/wk. ${delta > 0 ? "Add" : "Remove"} ${Math.abs(delta)} kcal/day.` };
}
