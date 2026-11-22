/* Elite OS v5.0 — Wall-Clock Rest Timer, E1RM/BW Engine, Plate Calc & Gym-Floor Workout Cockpit (#wm) */
const NM = {}, HI = {}, PG = {}, EXI = {};
const WU = {
  1: "1 set of 5 at 60% of your working weight",
  2: "5 reps at 50%, then 3 reps at 75%",
  3: "6 reps at 40%, 4 at 60%, 2 at 80%",
  4: "6 reps at 40%, 4 at 55%, 3 at 70%, 1 at 85%"
};

/* ---------- Shared AudioContext chime (unlocked on user gesture, never leaks) ---------- */
let _ac = null;
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!_ac) _ac = new Ctx();
    if (_ac.state === "suspended") _ac.resume().catch(() => {});
  } catch (e) {}
}
document.addEventListener("pointerdown", unlockAudio, { passive: true, once: true });

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!_ac) _ac = new Ctx();
    if (_ac.state === "suspended") _ac.resume().catch(() => {});
    const now = _ac.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const o = _ac.createOscillator(), g = _ac.createGain();
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.001, now + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.14, now + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.24);
      o.connect(g); g.connect(_ac.destination);
      o.start(now + i * 0.14); o.stop(now + i * 0.14 + 0.26);
    });
  } catch (e) {}
}

/* ---------- Wall-Clock Rest Timer (never freezes in background / locked iOS PWA) ---------- */
let tmr = null, tmrEnd = 0, tmrTotal = 0, left = 0;
function drawClock() {
  const clk = $("clk"), bar = $("tBar");
  if (clk) clk.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (bar && tmrTotal > 0) bar.style.transform = `scaleX(${clamp01(left / tmrTotal).toFixed(4)})`;
}
function tickTimer() {
  if (!tmrEnd) return;
  const rem = Math.max(0, Math.ceil((tmrEnd - Date.now()) / 1000));
  left = rem;
  drawClock();
  if (rem <= 0) {
    clearInterval(tmr); tmr = null; tmrEnd = 0;
    const el = $("timer"); if (el) el.className = "end";
    beep();
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  }
}
function startTimer(s) {
  unlockAudio();
  clearInterval(tmr);
  const secs = Math.max(1, Math.round(+s || 60));
  tmrTotal = secs; tmrEnd = Date.now() + secs * 1000; left = secs;
  const el = $("timer"); if (el) el.className = "run";
  drawClock();
  tmr = setInterval(tickTimer, 250);
}
function adjustTimer(delta) {
  if (!tmrEnd) return;
  tmrEnd = Math.max(Date.now() + 1000, tmrEnd + delta * 1000);
  tmrTotal = Math.max(tmrTotal, Math.ceil((tmrEnd - Date.now()) / 1000));
  tickTimer();
}
function stopTimer() {
  clearInterval(tmr); tmr = null; tmrEnd = 0; left = 0;
  const el = $("timer"); if (el) el.className = "";
  drawClock();
  if (typeof PU !== "undefined" && PU.timer && typeof restPush === "function") restPush(false);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tmrEnd) tickTimer();
});

const autoRestOn = () => { try { return localStorage.getItem("eliteAutoRest") !== "0"; } catch (e) { return true; } };
function setAutoRest(v) { try { localStorage.setItem("eliteAutoRest", v ? "1" : "0"); } catch (e) {} }
function adaptRest(x, r, rir) {
  let s = x.rest || 90;
  if ((x.lo && r && r < x.lo) || rir === 0) s += 30;
  return Math.min(600, s);
}
function autoRest(uid, r, rir) {
  if (!autoRestOn()) return;
  const x = EXI[uid];
  if (!x || x.ss || !(x.rest > 0)) return;
  startTimer(adaptRest(x, r, rir));
}

/* ---------- E1RM (no 12-rep cliff) & Bodyweight-Inclusive Load ---------- */
function isBwEx(uid) {
  const lib = EX.find(e => `${e.slot}:${e.id}` === uid);
  return !!(lib && lib.bw);
}
function effLoad(uid, w) {
  const load = +w || 0;
  if (isBwEx(uid) && S && S.prof && S.prof.kg > 0) return S.prof.kg + Math.max(0, load);
  return load;
}
/* Smooth Epley up to 15 reps, tapered slope 16..25 so high-rep isolation PRs still register */
function e1(w, r) {
  if (!(w > 0 && r > 0)) return 0;
  if (r === 1) return w;
  const effR = r <= 15 ? r : 15 + (r - 15) * 0.55;
  return w * (1 + Math.min(effR, 24) / 30);
}
const valOf = h => {
  const ew = h.u && isBwEx(h.u) ? effLoad(h.u, h.w || 0) : (+h.w || 0);
  return ew > 0 ? e1(ew, h.r) : (+h.r || 0);
};
const perfOf = uid => { const v = S.perf[uid]; return v && typeof v === "object" ? v : { w: "", r: "" }; };
function bestBefore(uid, date) {
  let b = 0;
  Object.values(S.hist || {}).forEach(h => { if (h.u === uid && h.d < date) { const v = valOf(h); if (v > b) b = v; } });
  return b;
}
function prevSetsFor(uid, beforeDate) {
  const keys = Object.keys(S.sets || {}).filter(k => k.startsWith(uid + "|") && k.slice(uid.length + 1) < beforeDate).sort();
  if (!keys.length) return [];
  return S.sets[keys[keys.length - 1]] || [];
}

function sugText(uid) {
  const v = perfOf(uid), r = parseFloat(v.r), hi = HI[uid], pg = PG[uid] || {};
  const step = pg.inc > 0 ? pg.inc : (metric() ? 2.5 : 5), wd = v.w === "" ? 0 : dW(v.w);
  if (!r) return "Log your best set to get a target for next time.";
  let t;
  if (hi && r >= hi && pg.mode !== "reps") {
    t = wd ? `Top of the range. Next time: ${r1(wd + step)} ${wU()} for ${Math.max(1, r - 3)}+ reps.` : "Top of the range. Add load (bag, vest, dumbbell) or a harder variation.";
  } else {
    t = wd ? `Next time: ${wd} ${wU()} for ${r + 1}+ reps.` : `Next time: ${r + 1}+ reps.`;
  }
  const cur = valOf({ u: uid, w: v.w === "" ? 0 : v.w, r }), prev = bestBefore(uid, S.sel);
  if (prev > 0 && cur > prev) t += " New PR!";
  const ls = (S.sets[uid + "|" + S.sel] || []).filter(x => x.rir != null);
  const lr = ls.length ? ls[ls.length - 1].rir : null, tg = (EXI[uid] || {}).rir;
  if (lr != null && tg != null) {
    if (lr >= tg + 2) t += " Last set felt easy, so you can progress faster.";
    else if (lr === 0 && tg >= 2) t += ` You hit failure: keep this load until it feels like ${tg} reps left.`;
  }
  const ew = effLoad(uid, v.w === "" ? 0 : +v.w);
  if (ew > 0 && (wd > 0 || isBwEx(uid))) t += ` Est. 1RM ${r1(dW(e1(ew, r)))} ${wU()}${isBwEx(uid) ? " (incl. BW)" : ""}.`;
  const lh = Object.values(S.hist || {}).filter(h => h.u === uid && h.d < S.sel).sort((a, b) => a.d < b.d ? 1 : -1)[0];
  if (lh) t += ` Last time: ${lh.w > 0 ? dW(lh.w) + " " + wU() + " × " : ""}${lh.r}.`;
  return t;
}

function setsHTML(uid) {
  const a = S.sets[uid + "|" + S.sel] || [];
  return a.length ? `Sets: ${a.map(x => (x.w > 0 ? dW(x.w) + " × " : "") + x.r + (x.rir != null ? " @" + x.rir + " RIR" : "")).join(" · ")} <button class="rest" data-undoset="${esc(uid)}">Undo last</button>` : "";
}
function perfHTML(e) {
  const v = perfOf(e.uid);
  wmReg(e);
  return `<div class="perfrow"><input class="perf" type="number" inputmode="decimal" step="0.5" data-pw="${esc(e.uid)}" placeholder="${e.bw ? "+" + wU() : wU()}" value="${v.w === "" ? "" : esc(dW(v.w))}"/><span>×</span><input class="perf" type="number" inputmode="numeric" data-pr="${esc(e.uid)}" placeholder="reps" value="${esc(v.r)}"/><button class="btn" data-addset="${esc(e.uid)}">+ Log set</button></div><div class="cue" data-setlist="${esc(e.uid)}">${setsHTML(e.uid)}</div><div class="cue" data-sug="${esc(e.uid)}">${esc(sugText(e.uid))}</div>`;
}
function onPerfInput(t) {
  const uid = t.dataset.pw || t.dataset.pr, o = Object.assign({}, perfOf(uid));
  if (t.dataset.pw) o.w = t.value === "" ? "" : fromW(parseFloat(t.value));
  else o.r = t.value;
  S.perf[uid] = o;
  const key = uid + "|" + S.sel, r = parseFloat(o.r) || 0;
  if (r > 0) S.hist[key] = { u: uid, n: NM[uid] || uid, d: S.sel, w: o.w === "" ? 0 : o.w, r };
  else delete S.hist[key];
  save();
  const el = document.querySelector(`[data-sug="${uid}"]`);
  if (el) el.textContent = sugText(uid);
}
function pushSet(uid, w, r, rir, noRest) {
  const dt = WM.on ? WM.date : S.sel, k = uid + "|" + dt, o = { w, r };
  if (rir >= 0 && rir <= 10) o.rir = rir;
  (S.sets[k] = S.sets[k] || []).push(o);
  topSet(uid);
  if (!noRest) autoRest(uid, r, rir);
}
function addSet(uid) {
  const wi = document.querySelector('[data-pw="' + uid + '"]'), ri = document.querySelector('[data-pr="' + uid + '"]');
  if (!ri) return;
  const r = parseInt(ri.value) || 0; if (r <= 0) return;
  const w = wi && wi.value !== "" ? fromW(parseFloat(wi.value)) : 0;
  pushSet(uid, w, r);
}
function undoSet(uid) {
  const dt = WM.on ? WM.date : S.sel, k = uid + "|" + dt, a = S.sets[k] || [];
  a.pop();
  if (a.length) topSet(uid);
  else { delete S.sets[k]; delete S.hist[k]; save(); if (!WM.on) renderPlan(); }
}
function topSet(uid) {
  const dt = WM.on ? WM.date : S.sel, k = uid + "|" + dt, a = S.sets[k];
  if (!a || !a.length) return;
  const best = a.reduce((b, x) => valOf(Object.assign({ u: uid }, x)) > valOf(Object.assign({ u: uid }, b)) ? x : b, a[0]);
  S.perf[uid] = { w: best.w || "", r: best.r };
  S.hist[k] = { u: uid, n: NM[uid] || uid, d: dt, w: best.w || 0, r: best.r };
  save();
  if (!WM.on) renderPlan();
}

function histList() {
  const m = {}; Object.values(S.hist || {}).forEach(h => (m[h.u] = m[h.u] || []).push(h));
  return Object.values(m).map(a => {
    a.sort((x, y) => x.d < y.d ? -1 : 1);
    let best = a[0], bv = valOf(a[0]);
    a.forEach(h => { const v = valOf(h); if (v > bv) { bv = v; best = h; } });
    const last = a[a.length - 1];
    return { n: last.n, last, best, bv, count: a.length };
  }).sort((x, y) => x.last.d < y.last.d ? 1 : -1);
}
function prList() {
  const out = [], m = {};
  Object.values(S.hist || {}).forEach(h => (m[h.u] = m[h.u] || []).push(h));
  Object.values(m).forEach(a => { a.sort((x, y) => x.d < y.d ? -1 : 1); let b = 0; a.forEach((h, i) => { const v = valOf(h); if (v > b) { if (i > 0) out.push(h); b = v; } }); });
  return out;
}

/* ---------- Plate Calculator ---------- */
function platesFor(total, bar, plates) {
  let side = (total - bar) / 2; if (!(side >= 0)) return null;
  const out = [];
  for (const p of plates) { const n = Math.floor(side / p + 1e-9); if (n > 0) { out.push([p, n]); side -= n * p; } }
  return { out, left: Math.round(side * 100) / 100 };
}
let PL = { t: "", bar: "" };
const PLATES = () => metric() ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
function plateSummaryHTML(total, barVal) {
  const t = parseFloat(total), bar = barVal === "" || barVal == null ? (metric() ? 20 : 45) : parseFloat(barVal);
  if (!(t > 0)) return "Enter the total weight you want on the bar.";
  const r = platesFor(t, bar, PLATES());
  if (!r) return `Lighter than the empty bar (${bar} ${wU()}).`;
  const loaded = r1(t - 2 * r.left);
  return (r.out.length ? "Each side: <b>" + r.out.map(([p, n]) => `${n} × ${p}`).join(", ") + "</b>" : "Bar only") + ` · loads ${loaded} ${wU()}` + (r.left > 0 ? `<br>Closest loadable is ${loaded} ${wU()} (${r1(2 * r.left)} ${wU()} short).` : "");
}
function plateOut() {
  const el = $("plateOut"); if (el) el.innerHTML = plateSummaryHTML(PL.t, PL.bar);
}
function renderPlate() {
  const b = $("plateBox"); if (!b) return;
  b.innerHTML = `<div class="d">Plates per side · standard ${PLATES().join(", ")} ${wU()}.</div><div class="fgrid" style="margin-top:8px"><div class="cg"><label>Total weight (${wU()})</label><input type="number" inputmode="decimal" id="plT" value="${esc(PL.t)}"/></div><div class="cg"><label>Empty bar (${wU()})</label><input type="number" inputmode="decimal" id="plB" placeholder="${metric() ? 20 : 45}" value="${esc(PL.bar)}"/></div></div><div class="d" id="plateOut" style="margin-top:8px"></div>`;
  plateOut();
}

/* ---------- Superset Groups & Warm-up / Cool-down ---------- */
function ssGroups(ex) {
  const out = ex.map(() => null); let L = 0;
  for (let i = 0; i < ex.length;) {
    if (ex[i].ss && i < ex.length - 1) {
      let j = i; while (j < ex.length - 1 && ex[j].ss) j++;
      const g = String.fromCharCode(65 + (L++ % 26));
      for (let k = i; k <= j; k++) out[k] = { g, k: k - i + 1, n: j - i + 1, s: i, e: j };
      i = j + 1;
    } else i++;
  }
  return out;
}
const ssRounds = (ex, gi, rd) => Math.max(...ex.slice(gi.s, gi.e + 1).map(x => adjusted(x, rd).sets));
function setLine(e, rd, gi) {
  const a = adjusted(e, rd);
  let reps = e.reps;
  if (e.bmReps && a.rir !== e.rir) reps = String(Math.max(1, parseInt(e.reps) - (a.rir - e.rir)));
  const changed = a.sets !== e.sets || a.rir !== e.rir;
  const rest = gi ? (gi.k < gi.n ? `→ ${gi.g}${gi.k + 1}, no rest` : `${e.rest}s rest, then ${gi.g}1`) : e.ss ? "→ next, no rest" : `${e.rest}s rest`;
  return `<span class="rx"><span class="rx-main">${a.sets} × ${esc(reps)}</span><span class="rx-c">${a.rir} RIR</span><span class="rx-c">${rest}</span>${changed ? `<span class="rx-c rx-a">readiness adjusted</span>` : ""}</span>`;
}

const LOWERM = ["quads", "hams", "glutes", "calves"];
function sessMus(s) { const c = {}; (s.ex || []).forEach(x => { c[x.mu] = (c[x.mu] || 0) + 2; (x.mu2 || []).forEach(y => c[y] = (c[y] || 0) + 1); }); return c; }
function warmHTML(d) {
  const s = d.session; if (!s || !s.ex || !s.ex.length) return "";
  const m = Object.keys(sessMus(s)), lower = m.some(x => LOWERM.includes(x)), upper = m.some(x => !LOWERM.includes(x) && x !== "abs"), f = s.ex[0];
  const it = ["<b>3–5 min easy cardio</b> · bike, row, brisk walk or skipping. Warm, not tired."];
  if (upper) it.push("<b>Upper body</b> · 10 arm circles each way, 15 band pull-aparts, 10 scap push-ups");
  if (lower) it.push("<b>Lower body</b> · 10 leg swings each way, 10 bodyweight squats, 10 glute bridges");
  it.push(`<b>Ramp-up sets</b> · ${esc(f.name)}: ${f.wu ? WU[f.wu] : "5 reps at 50%, then 3 reps at 75% of your working weight"}`);
  return callout("warm", "flame", "Warm-up", "5–8 min", `<ol class="cl">${it.map(x => `<li>${x}</li>`).join("")}</ol>${ccheck(`${d.date}|wu`, "Warm-up done")}`);
}
const STRETCH = { chest: "Doorway chest stretch · 30 s each side", back: "Child's pose, arms long · 45 s", shoulders: "Cross-body shoulder stretch · 30 s each side", biceps: "Wall biceps stretch · 30 s each side", triceps: "Overhead triceps stretch · 30 s each side", arms: "Overhead triceps stretch · 30 s each side", quads: "Couch or standing quad stretch · 45 s each side", legs: "Standing hamstring stretch · 45 s each side", hams: "Standing hamstring stretch · 45 s each side", glutes: "Figure-4 glute stretch · 45 s each side", calves: "Wall calf stretch · 30 s each side", abs: "Cobra stretch · 30 s" };
function coolHTML(d) {
  const s = d.session; if (!s || !s.ex || !s.ex.length) return "";
  const c = sessMus(s), seen = new Set(), st = Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => STRETCH[k]).filter(x => x && !seen.has(x) && seen.add(x)).slice(0, 4);
  const it = ["<b>3–5 min easy walk</b> · until breathing settles"].concat(st.map(x => { const [a, b] = x.split(" · "); return `<b>${a}</b> · ${b}`; }), ["<b>1 min slow breathing</b> · 4 s in through the nose, 6 s out"]);
  return callout("cool", "wind", "Cool-down", "5–8 min", `<ol class="cl">${it.map(x => `<li>${x}</li>`).join("")}</ol>${ccheck(`${d.date}|cd`, "Cool-down done")}`);
}

/* ---------- 1% Elite Gym-Floor Workout Cockpit (#wm) ---------- */
const WMDRAFTK = "eliteWmDraft";
const WM = { on: false, i: 0, date: "", sess: null, drawer: null, extraSets: {}, editIdx: null, wuDone: {}, clockIv: null, openedAt: 0, fin: null };

function wmReg(e) {
  HI[e.uid] = e.hi; NM[e.uid] = e.name; PG[e.uid] = { inc: e.inc, mode: e.prog };
  EXI[e.uid] = { rest: e.rest, hi: e.hi, lo: parseInt(e.reps) || 0, ss: !!e.ss, rir: e.rir, bw: !!e.bw };
}
function wmSaveDraft() {
  if (!WM.on) { try { localStorage.removeItem(WMDRAFTK); } catch (e) {} return; }
  lsSet(WMDRAFTK, JSON.stringify({ date: WM.date, i: WM.i, openedAt: WM.openedAt }));
}
function wmElapsedText() {
  const s = Math.max(0, Math.floor((Date.now() - (WM.openedAt || Date.now())) / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function wmOpen() {
  const d = selDay(); if (!d.session || !d.session.ex || !d.session.ex.length) return;
  unlockAudio();
  WM.on = true; WM.date = d.date;
  WM.sess = JSON.parse(JSON.stringify(d.session));
  WM.drawer = null; WM.editIdx = null; WM.extraSets = {}; WM.fin = null;
  let draft = null;
  try { draft = JSON.parse(lsGet(WMDRAFTK) || "null"); } catch (e) {}
  WM.openedAt = draft && draft.date === d.date && draft.openedAt ? draft.openedAt : NOW();
  WM.sess.ex.forEach(wmReg);
  const idx = draft && draft.date === d.date && draft.i < WM.sess.ex.length ? draft.i : WM.sess.ex.findIndex((e, i) => !S.checks[`${d.date}|ex|${i}`]);
  WM.i = idx < 0 ? 0 : idx;
  wmSaveDraft();
  $("wm").hidden = false; document.body.classList.add("wm-open");
  clearInterval(WM.clockIv);
  WM.clockIv = setInterval(() => { const el = $("wmClock"); if (el) el.textContent = wmElapsedText(); }, 1000);
  wmDraw();
}
function wmClose() {
  WM.on = false; WM.fin = null; WM.drawer = null; WM.editIdx = null;
  clearInterval(WM.clockIv); WM.clockIv = null;
  wmSaveDraft();
  $("wm").hidden = true; document.body.classList.remove("wm-open");
  renderPlan(); renderOverall(); renderProgExtra(); renderWlog(); renderChart();
}

function wmDrawerHTML(e, wv) {
  if (WM.drawer === "plates") {
    return `<div class="wm-inline-drawer">
      <div class="sechl" style="justify-content:space-between"><span>Plate calculator</span><button type="button" class="rest" data-wm="drawer-close">Close</button></div>
      <div class="fgrid"><div class="cg"><label>Target (${wU()})</label><input type="number" inputmode="decimal" id="wmPlT" value="${esc(wv || PL.t)}"/></div><div class="cg"><label>Bar (${wU()})</label><input type="number" inputmode="decimal" id="wmPlB" placeholder="${metric() ? 20 : 45}" value="${esc(PL.bar)}"/></div></div>
      <div class="d" id="wmPlOut" style="margin-top:8px">${plateSummaryHTML(wv || PL.t, PL.bar)}</div>
    </div>`;
  }
  if (WM.drawer === "swap") {
    const alts = EX.filter(x => x.mu === e.mu && `${x.slot}:${x.id}` !== e.uid).slice(0, 12);
    return `<div class="wm-inline-drawer">
      <div class="sechl" style="justify-content:space-between"><span>Swap ${esc(muLabel(e.mu))} exercise (this session)</span><button type="button" class="rest" data-wm="drawer-close">Close</button></div>
      <div class="trres" style="max-height:200px">${alts.map(x => `<button type="button" class="trpick" data-wmswap="${esc(x.slot + ":" + x.id)}"><b>${esc(x.n)}</b><small>${esc(x.rr[0] + "–" + x.rr[1])} reps · rest ${x.rest}s</small></button>`).join("") || '<div class="d">No same-muscle alternatives found.</div>'}</div>
    </div>`;
  }
  return "";
}

function wmDraw() {
  const s = WM.sess, e = s.ex[WM.i], n = s.ex.length, rd = readiness(WM.date), a = adjusted(e, rd);
  const done = S.sets[e.uid + "|" + WM.date] || [], prev = prevSetsFor(e.uid, WM.date);
  const editItem = WM.editIdx != null ? done[WM.editIdx] : null;
  const last = editItem || done[done.length - 1], v = perfOf(e.uid);
  const w0 = last ? last.w : (v.w === "" ? (prev[done.length] ? prev[done.length].w : 0) : v.w);
  const wv = w0 > 0 ? r1(dW(w0)) : "";
  const r0 = last ? last.r : (v.r || (prev[done.length] ? prev[done.length].r : ""));
  WM.rir = editItem && editItem.rir != null ? editItem.rir : a.rir;
  const targetSets = a.sets + (WM.extraSets[e.uid] || 0);
  const rowsCount = Math.max(targetSets, done.length);
  const stepW = (PG[e.uid] && PG[e.uid].inc > 0) ? PG[e.uid].inc : (metric() ? 2.5 : 5);
  const nxt = s.ex[WM.i + 1], pop = WM.just === e.uid, sug = sugText(e.uid); WM.just = null;
  const G = ssGroups(s.ex), gi = G[WM.i];
  let ssBox = "";
  if (gi) {
    const mem = s.ex.slice(gi.s, gi.e + 1).map((x, k) => { const i = gi.s + k, c = (S.sets[x.uid + "|" + WM.date] || []).length, t = adjusted(x, rd).sets; return { i, x, c, t, lab: gi.g + (k + 1) }; });
    const rounds = Math.max(...mem.map(m => m.t)), round = Math.min(rounds, Math.min(...mem.filter(m => m.c < m.t).map(m => m.c).concat([rounds - 1])) + 1);
    ssBox = `<div class="wm-ss"><div class="wm-ssh"><span>Superset ${gi.g} · ${gi.n} exercises</span><span>Round ${round} of ${rounds}</span></div>
      ${mem.map(m => `<button type="button" class="wm-ssm ${m.i === WM.i ? "on" : ""} ${m.c >= m.t ? "done" : ""}" data-wmgo="${m.i}"><span class="ssl">${m.lab}</span>${esc(m.x.name)}<span>${m.c}/${m.t}</span></button>`).join("")}
      <div class="d">Do ${mem.map(m => m.lab).join(" → ")} back to back, then rest ${s.ex[gi.e].rest}s.</div></div>`;
  }
  const dots = Array.from({ length: rowsCount }, (_, k) => `<i class="${k < done.length ? "on" : ""}${pop && k === done.length - 1 ? " pop" : ""}"></i>`).join("");
  const tableRows = Array.from({ length: rowsCount }, (_, k) => {
    const cur = done[k], pr = prev[k], isActive = WM.editIdx != null ? k === WM.editIdx : k === done.length;
    const prevTxt = pr ? `${pr.w > 0 ? dW(pr.w) + "×" : ""}${pr.r}` : "–";
    const logTxt = cur ? `${cur.w > 0 ? dW(cur.w) + " " + wU() + " × " : ""}${cur.r}` : (isActive ? "Next" : "–");
    return `<div class="wm-tr ${cur ? "done" : ""} ${isActive ? "cur" : ""}">
      <span class="wm-setn">${k + 1}</span>
      <span class="wm-prev">${esc(prevTxt)}</span>
      <span class="wm-val">${esc(logTxt)}</span>
      <span class="wm-rir-b">${cur && cur.rir != null ? "@" + cur.rir : "–"}</span>
      <span>${cur ? `<button type="button" class="rest" style="padding:2px 6px;min-height:26px" data-wmedit="${k}" aria-label="Edit set ${k + 1}">${ico("edit", 13)}</button>` : ""}</span>
    </div>`;
  }).join("");

  $("wm").innerHTML = `
   <div class="wm-top">
     <button class="btn" data-wm="close">${ico("x", 16)} Exit</button>
     <div class="wm-prog">
       <div class="wm-prog-r"><span>${esc(s.name)} · ${WM.i + 1}/${n}</span><span class="wm-clock" id="wmClock">${wmElapsedText()}</span></div>
       <div class="bar"><div style="width:${((WM.i + 1) / n * 100).toFixed(1)}%"></div></div>
     </div>
     <div class="wm-tools">
       <button type="button" class="rest ${WM.drawer === "plates" ? "on" : ""}" data-wm="plates" title="Plate calculator" aria-label="Plate calculator">${ico("disc", 16)}</button>
       <button type="button" class="rest ${WM.drawer === "swap" ? "on" : ""}" data-wm="swap" title="Swap exercise" aria-label="Swap exercise">${ico("swap", 16)}</button>
     </div>
   </div>
   <div class="wm-body">
     ${wmDrawerHTML(e, wv)}
     <h2 class="wm-name">${esc(e.name)}</h2>
     ${ssBox}
     <div class="wm-target">${gi ? `<span class="ssl">${gi.g}${gi.k}</span>` : ""}${setLine(e, rd, gi)}</div>
     <div class="d">${esc(e.load)}${formLink(e.name, e.demo)}</div>
     ${WM.i === 0 && !S.checks[WM.date + "|wu"] && !s.ex.some(x => (S.sets[x.uid + "|" + WM.date] || []).length) ? warmHTML({ session: s, date: WM.date }) : e.wu && !done.length && !WM.wuDone[e.uid] && !(WM.i === 0 && S.checks[WM.date + "|wu"]) ? callout("warm", "flame", "Ramp-up sets first", "", `${WU[e.wu]}<br><label class="ccheck"><input type="checkbox" data-wmwu="${esc(e.uid)}"/> Ramp-up done</label>`) : ""}
     ${e.cue ? `<div class="cue">${esc(e.cue)}</div>` : ""}
     <div class="wm-dots" aria-label="Sets done">${dots}</div>
     <div class="wm-tbl">
       <div class="wm-tr hd"><span>Set</span><span>Previous</span><span>Logged</span><span style="text-align:center">RIR</span><span></span></div>
       ${tableRows}
     </div>
     <div class="wm-inputs">
       <div class="wm-in-box"><span>${e.bw ? "+" + wU() + " (added)" : wU()}</span>
         <div class="wm-step-row"><button type="button" data-wmstep="w|-${stepW}" aria-label="Decrease weight">−</button><input id="wmW" type="number" inputmode="decimal" step="0.5" value="${esc(wv)}"/><button type="button" data-wmstep="w|${stepW}" aria-label="Increase weight">+</button></div>
       </div>
       <div class="wm-in-box"><span>Reps</span>
         <div class="wm-step-row"><button type="button" data-wmstep="r|-1" aria-label="Decrease reps">−</button><input id="wmR" type="number" inputmode="numeric" value="${esc(r0)}"/><button type="button" data-wmstep="r|1" aria-label="Increase reps">+</button></div>
       </div>
     </div>
     <div class="wm-rir" role="group" aria-label="Reps left in the tank"><span>Reps left</span>${[0, 1, 2, 3, 4].map(k => `<button type="button" data-wmrir="${k}" class="${k === Math.min(4, WM.rir) ? "on" : ""}">${k === 4 ? "4+" : k}</button>`).join("")}</div>
     <div style="display:flex;gap:8px">
       <button class="btn pri wm-log" data-wm="log">${WM.editIdx != null ? `Update set ${WM.editIdx + 1}` : `Log set ${done.length + 1}`}</button>
       ${WM.editIdx != null ? '<button class="btn" data-wm="editcancel">Cancel</button>' : ""}
     </div>
     ${pop && sug.includes("New PR") ? `<div class="prflash">${ico("trophy", 14)} New PR</div>` : ""}
     <div class="d">${esc(sug)}</div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
       <button type="button" class="rest" data-wm="addset">+ Add set</button>
       ${done.length ? '<button type="button" class="rest" data-wm="undo">Undo last</button>' : ""}
     </div>
     ${(() => { const nx = gi ? wmNextInGroup(s, G, WM.i, true) : null, o = nx != null ? s.ex[nx] : (gi ? s.ex[gi.e + 1] : nxt); return o ? `<div class="d">Up next: <b>${esc(o.name)}</b>${nx != null && nx <= WM.i ? " (after rest)" : ""}</div>` : ""; })()}
   </div>
   <div class="wm-nav"><button class="btn" data-wm="prev" ${WM.i === 0 ? "disabled" : ""}>‹ Prev</button><button class="btn ${WM.i === n - 1 ? "pri" : ""}" data-wm="next">${WM.i === n - 1 ? "Finish session" : "Next ›"}</button></div>`;
}

function wmLog() {
  const s = WM.sess, e = s.ex[WM.i], r = parseInt($("wmR").value) || 0;
  if (r <= 0) { $("wmR").focus(); return; }
  const wv = $("wmW").value, w = wv === "" ? 0 : fromW(parseFloat(wv));
  if (!(S.wlog = S.wlog || {})[WM.date]) S.wlog[WM.date] = { name: s.name, start: WM.openedAt || NOW() };
  if (WM.editIdx != null) {
    const a = S.sets[e.uid + "|" + WM.date] || [];
    if (a[WM.editIdx]) { a[WM.editIdx] = { w, r, rir: WM.rir }; topSet(e.uid); }
    WM.editIdx = null;
    wmDraw();
    return;
  }
  const G = ssGroups(s.ex), gi = G[WM.i];
  pushSet(e.uid, w, r, WM.rir, !!gi); WM.just = e.uid;
  const cnt = (S.sets[e.uid + "|" + WM.date] || []).length;
  if (cnt >= adjusted(e, readiness(WM.date)).sets) {
    const key = `${WM.date}|ex|${WM.i}`; S.checks[key] = true; markDone(key); save();
  }
  if (gi) {
    const nx = wmNextInGroup(s, G, WM.i, false);
    if (nx === null || nx <= WM.i) {
      const last = s.ex[gi.e];
      if (autoRestOn() && last.rest > 0 && (nx !== null || gi.e < s.ex.length - 1)) startTimer(adaptRest(EXI[last.uid] || last, r, WM.rir));
    }
    if (nx !== null) WM.i = nx; else if (gi.e < s.ex.length - 1) WM.i = gi.e + 1;
  }
  wmSaveDraft();
  wmDraw();
}

function wmNextInGroup(s, G, i, peek) {
  const gi = G[i]; if (!gi) return null;
  const rd = readiness(WM.date), need = k => (S.sets[s.ex[k].uid + "|" + WM.date] || []).length < adjusted(s.ex[k], rd).sets;
  for (let st = 1; st <= gi.n; st++) {
    const k = gi.s + ((i - gi.s + st) % gi.n);
    if (peek && k === i && st < gi.n) continue;
    if (need(k)) return k;
  }
  return null;
}

function sessStats(s, date) {
  let sets = 0, reps = 0, vol = 0;
  s.ex.forEach(e => (S.sets[e.uid + "|" + date] || []).forEach(x => {
    sets++; reps += x.r; vol += effLoad(e.uid, x.w || 0) * x.r;
  }));
  return { sets, reps, vol };
}
function prevSession(name, date) {
  return Object.entries(S.wlog || {}).filter(([d, l]) => d < date && l && l.name === name && l.end).sort((a, b) => a[0] < b[0] ? 1 : -1)[0] || null;
}
const volDelta = (v, pv) => pv && pv[1].vol > 0 && v > 0 ? Math.round((v / pv[1].vol - 1) * 100) : null;

function wmFinish() {
  const s = WM.sess, st = sessStats(s, WM.date);
  if (!st.sets) { wmClose(); return; }
  S.wlog = S.wlog || {};
  const L = S.wlog[WM.date] = S.wlog[WM.date] || { name: s.name, start: WM.openedAt || NOW() };
  const end = NOW(), mins = Math.max(1, Math.round((end - (L.start || end)) / 60000));
  const pv = prevSession(s.name, WM.date), dv = volDelta(st.vol, pv), prs = prList().filter(h => h.d === WM.date).length;
  WM.fin = Object.assign({ end, mins }, st);
  $("wm").innerHTML = `<div class="wm-top"><div class="wm-prog">${esc(s.name)} · complete</div></div>
   <div class="wm-body"><h2 class="wm-name">Session complete</h2>
    <div class="wm-sum"><div><span>Time</span><b>${mins} min</b></div><div><span>Sets</span><b>${st.sets}</b></div><div><span>Reps</span><b>${st.reps}</b></div><div><span>Volume</span><b>${st.vol ? Math.round(dW(st.vol)).toLocaleString() + " " + wU() : '<span style="font-size:.95rem">Bodyweight</span>'}</b></div><div><span>PRs</span><b>${prs}</b></div></div>
    ${dv !== null ? `<div class="d">Volume vs your last ${esc(s.name)} (${dateLabel(pv[0], { month: "short", day: "numeric" })}): <b style="color:${dv >= 0 ? "var(--green)" : "var(--amber)"}">${dv >= 0 ? "+" : ""}${dv}%</b></div>` : ""}
    ${coolHTML({ session: s, date: WM.date })}
    <label class="wm-notel">Session note<textarea id="wmNote" maxlength="500" placeholder="How it felt, any pain, what to change next time">${esc(L.note || "")}</textarea></label>
   </div>
   <div class="wm-nav"><button class="btn" data-wm="back">‹ Back</button><button class="btn pri" data-wm="save">Save session</button></div>`;
}

function wmSave() {
  const L = S.wlog[WM.date], f = WM.fin; if (!L || !f) { wmClose(); return; }
  Object.assign(L, { end: f.end, mins: f.mins, sets: f.sets, reps: f.reps, vol: Math.round(f.vol), note: String(($("wmNote") || {}).value || "").slice(0, 500) });
  save(); stopTimer(); wmClose();
  toast("Session saved", "good");
}

function wmClick(t) {
  const go = t.closest("[data-wmgo]");
  if (go) { WM.i = +go.dataset.wmgo; WM.editIdx = null; wmSaveDraft(); wmDraw(); return true; }
  const rb = t.closest("[data-wmrir]");
  if (rb) { WM.rir = +rb.dataset.wmrir; document.querySelectorAll("[data-wmrir]").forEach(x => x.classList.toggle("on", x === rb)); return true; }
  const st = t.closest("[data-wmstep]");
  if (st) {
    const [k, dv] = st.dataset.wmstep.split("|"), inp = k === "w" ? $("wmW") : $("wmR");
    if (inp) { const cur = parseFloat(inp.value) || 0, nw = Math.max(0, Math.round((cur + parseFloat(dv)) * 10) / 10); inp.value = nw || ""; }
    return true;
  }
  const ed = t.closest("[data-wmedit]");
  if (ed) { WM.editIdx = +ed.dataset.wmedit; wmDraw(); return true; }
  const sw = t.closest("[data-wmswap]");
  if (sw) {
    const lib = EX.find(x => `${x.slot}:${x.id}` === sw.dataset.wmswap);
    if (lib && WM.sess) {
      const cur = WM.sess.ex[WM.i];
      WM.sess.ex[WM.i] = Object.assign({}, cur, { id: lib.id, uid: `${lib.slot}:${lib.id}`, name: lib.n, slot: lib.slot, reps: `${lib.rr[0]}–${lib.rr[1]}${lib.unit || ""}`, rest: lib.rest, cue: lib.cue, load: loadText(lib, S.prof), bw: !!lib.bw, hi: lib.rr[1] });
      wmReg(WM.sess.ex[WM.i]); WM.drawer = null; WM.editIdx = null;
      toast("Swapped to " + lib.n, "good"); wmDraw();
    }
    return true;
  }
  const b = t.closest("[data-wm]"); if (!b) return false;
  const a = b.dataset.wm;
  if (a === "open") wmOpen();
  else if (a === "close") wmClose();
  else if (a === "log") wmLog();
  else if (a === "editcancel") { WM.editIdx = null; wmDraw(); }
  else if (a === "addset") { const uid = WM.sess.ex[WM.i].uid; WM.extraSets[uid] = (WM.extraSets[uid] || 0) + 1; wmDraw(); }
  else if (a === "undo") { undoSet(WM.sess.ex[WM.i].uid); wmDraw(); }
  else if (a === "plates") { WM.drawer = WM.drawer === "plates" ? null : "plates"; wmDraw(); }
  else if (a === "swap") { WM.drawer = WM.drawer === "swap" ? null : "swap"; wmDraw(); }
  else if (a === "drawer-close") { WM.drawer = null; wmDraw(); }
  else if (a === "prev" && WM.i > 0) { WM.i--; WM.editIdx = null; wmSaveDraft(); wmDraw(); }
  else if (a === "next") { if (WM.i < WM.sess.ex.length - 1) { WM.i++; WM.editIdx = null; wmSaveDraft(); wmDraw(); } else wmFinish(); }
  else if (a === "back") wmDraw();
  else if (a === "save") wmSave();
  return true;
}

/* ---------- Workout History & Interactive Strength Chart ---------- */
function renderWlog() {
  const el = $("wlogBox"); if (!el) return;
  const all = Object.entries(S.wlog || {}).filter(([, l]) => l && l.end).sort((a, b) => a[0] < b[0] ? 1 : -1);
  const byMsg = {}; (cx().msgs || []).forEach(m => { if (m.date) (byMsg[m.date] = byMsg[m.date] || []).push(m); });
  el.innerHTML = `<div class="card"><h2><span>Workout history</span><span class="badge">${all.length} session${all.length === 1 ? "" : "s"}</span></h2>${all.length ? all.slice(0, 12).map(([d, l]) => {
    const dv = volDelta(l.vol, prevSession(l.name, d));
    const cmts = (byMsg[d] || []).map(m => `<div class="note">${esc(m.body)}</div>`).join("");
    return `<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(l.name)} <span class="ims">${esc(dateLabel(d))}</span></div><div class="d">${l.mins} min · ${l.sets} set${l.sets === 1 ? "" : "s"} · ${l.reps} rep${l.reps === 1 ? "" : "s"}${l.vol ? ` · ${Math.round(dW(l.vol)).toLocaleString()} ${wU()} volume` : ""}${dv !== null ? ` · <b style="color:${dv >= 0 ? "var(--green)" : "var(--amber)"}">${dv >= 0 ? "+" : ""}${dv}% vs last</b>` : ""}</div>${l.note ? `<div class="cue">${esc(l.note)}</div>` : ""}${cmts}</div></div>`;
  }).join("") : '<div class="d">Finish a session in workout mode (Start workout on Today) and it lands here with time, sets, volume, change vs last time, and your note.</div>'}</div>`;
}

const CH = { uid: "" };
function chartSeries(uid) {
  const m = {};
  Object.values(S.hist || {}).forEach(h => { if (h.u !== uid) return; const v = valOf(h); if (!m[h.d] || v > m[h.d].v) m[h.d] = { v, w: h.w > 0 || isBwEx(uid) }; });
  return Object.keys(m).sort().map(d => ({ d, v: m[d].v, w: m[d].w }));
}
function renderChart() {
  const el = $("chartBox"); if (!el) return;
  const list = histList();
  if (!list.length) { el.innerHTML = ""; return; }
  if (!list.some(x => x.last.u === CH.uid)) CH.uid = list[0].last.u;
  const cur = list.find(x => x.last.u === CH.uid), pts = chartSeries(CH.uid), wt = pts.some(p => p.w);
  const vs = pts.map(p => wt ? r1(dW(p.v)) : p.v), unit = wt ? wU() + " est. 1RM" : "reps";
  let body = '<div class="d">Log this exercise on 2 or more days to see a trend line.</div>';
  if (pts.length >= 2) {
    const ch = vs[0] ? Math.round((vs[vs.length - 1] / vs[0] - 1) * 100) : 0;
    body = `<div class="d" style="margin-bottom:6px">${vs[0]} → <b>${vs[vs.length - 1]}</b> ${esc(unit)} over ${diffD(pts[0].d, pts[pts.length - 1].d)} days · <b style="color:${ch >= 0 ? "var(--green)" : "var(--amber)"}">${ch >= 0 ? "+" : ""}${ch}%</b></div>` +
      buildInteractiveChart({
        svgClass: "chart", connect: true, aria: `${cur.n}: ${vs[0]} to ${vs[vs.length - 1]} ${unit}`,
        series: pts.map((p, i) => ({ label: dateLabel(p.d, { month: "short", day: "numeric" }), v: vs[i] })),
        fmt: v => `${r1(v)} ${wt ? wU() : "reps"}`, fmtAxis: v => String(r1(v)),
        startLabel: dateLabel(pts[0].d, { month: "short", day: "numeric" }),
        endLabel: dateLabel(pts[pts.length - 1].d, { month: "short", day: "numeric" })
      });
  }
  el.innerHTML = `<div class="card"><h2><span>Strength chart</span><select id="chSel" aria-label="Exercise">${list.map(x => `<option value="${esc(x.last.u)}" ${x.last.u === CH.uid ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</select></h2>${body}</div>`;
}
