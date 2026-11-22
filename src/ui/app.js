/* Elite OS v5.0 — Unified App Orchestrator (Zero monkey-patching, zero native popups) */
const APP_VER = "2026.11.21.1", APP_MAJOR = "5.0";
let UPD = false, BIP = null;

function callout(kind, icon, title, meta, body) {
  const ic = ICO_P[icon] ? ico(icon, 15) : esc(icon);
  return `<div class="callout c-${kind}"><div class="c-h"><span class="c-i" aria-hidden="true">${ic}</span><b>${title}</b>${meta ? `<span class="c-m">${meta}</span>` : ""}</div>${body ? `<div class="c-b">${body}</div>` : ""}</div>`;
}
function ccheck(key, label) {
  const on = !!S.checks[key];
  return `<label class="ccheck ${on ? "on" : ""}"><input type="checkbox" data-k="${esc(key)}" ${on ? "checked" : ""}/> ${label}</label>`;
}
const formLink = (n, demo) => /^https:\/\/[^\s"<>]{4,300}$/.test(demo || "")
  ? ` <a class="vid vid-c" href="${esc(demo)}" target="_blank" rel="noopener">demo ↗</a>`
  : ` <a class="vid" href="https://www.youtube.com/results?search_query=${encodeURIComponent(n + " proper form")}" target="_blank" rel="noopener">form ↗</a>`;

function row(key, title, desc, extra, right) {
  const on = !!S.checks[key];
  return `<div class="row ${on ? "done" : ""}"><input type="checkbox" ${on ? "checked" : ""} data-k="${esc(key)}"/><div class="body"><div class="t">${title}</div>${desc ? `<div class="d">${desc}</div>` : ""}${extra || ""}</div>${right ? `<div class="btns">${right}</div>` : ""}</div>`;
}

/* ---------- Plan Regen & Progress Helpers ---------- */
function weekMon() { return addD(mondayOf(TODAY), S.weekOffset * 7); }
function regen() {
  W = buildWeek(S.prof, S, weekMon(), TODAY);
  if (!W.days.some(d => d.date === S.sel)) S.sel = (W.days.find(d => d.date === TODAY) || W.days[0]).date;
}
const selDay = () => W.days.find(d => d.date === S.sel) || W.days[0];
function commit() { save(); regen(); renderAll(true); }

function dayKeys(d) {
  const k = [];
  if (d.session) d.session.ex.forEach((_, i) => k.push(`${d.date}|ex|${i}`));
  if (d.session && d.session.ex.length && d.kind === "train") k.push(`${d.date}|wu`, `${d.date}|cd`);
  d.meals.forEach((_, i) => k.push(`${d.date}|meal|${i}`));
  ["water", "move", "sleep"].forEach(h => k.push(`${d.date}|hab|${h}`));
  cxHabits().forEach((_, i) => k.push(`${d.date}|hab|c${i}`));
  return k;
}
function dayProg(d) { const k = dayKeys(d), n = k.filter(x => S.checks[x]).length; return { n, t: k.length, pct: k.length ? n / k.length : 0 }; }
const pctOf = d => S.done[d] || 0;
function streak() { let n = 0, d = TODAY; if (pctOf(d) < 70) d = addD(d, -1); while (pctOf(d) >= 70) { n++; d = addD(d, -1); } return n; }
function markDone(key) {
  if (!/\|(ex|meal|hab)\|/.test(key) && !/\|(wu|cd)$/.test(key)) return;
  const date = key.split("|")[0], d = W && W.days.find(x => x.date === date);
  if (d) S.done[date] = Math.round(dayProg(d).pct * 100);
}

/* ---------- Unified Day Read Model & Readiness Engine ---------- */
function dayModel(date) {
  const l = S.log[date] || {}, h = (S.hd || {})[date] || {}, n = (S.nut || {})[date], wl = (S.wlog || {})[date];
  const cm = cardioOn(date).reduce((a, c) => a + (+c.min || 0), 0);
  return {
    date, weight: posNum(l.w), bf: posNum(h.bf), sleep: posNum(l.s) || posNum(h.sleep),
    rhr: posNum(h.rhr), hrv: posNum(h.hrv), steps: posNum(S.steps[date]) || posNum(h.steps),
    akcal: posNum(h.kcal), energy: posNum(l.e), sore: posNum(l.sr), water: posNum((S.water || {})[date]),
    kcal: n ? n.k : null, protein: n ? n.p : null, kcalT: n ? n.t : null,
    adh: S.done[date] != null ? +S.done[date] : null,
    vol: wl && wl.end && wl.vol > 0 ? wl.vol : null, sets: wl && wl.end ? wl.sets : null, cardio: cm || null
  };
}

const SLEEP_OPT = [[4.5, "Under 5 h"], [5.5, "5–6 h"], [6.5, "6–7 h"], [7.5, "7–8 h"], [8.5, "8+ h"]];
const RD_CORE = ["sleep", "energy", "sore", "hrv", "rhr"];
const RD_NAME = { sleep: "Sleep", energy: "Energy", sore: "Soreness", hrv: "HRV", rhr: "Resting HR" };
function rdSignals(date) {
  const l = S.log[date] || {}, out = [], s = parseFloat(l.s), e = parseFloat(l.e), sr = parseFloat(l.sr);
  if (s > 0) out.push({ k: "sleep", label: "Sleep", w: 0.4, v: clamp01((s - 5) / 3), core: 1, src: l.sh ? "Health" : "You", txt: r1(s) + " h" });
  if (e > 0) out.push({ k: "energy", label: "Energy", w: 0.35, v: clamp01((e - 1) / 4), core: 1, src: "You", txt: e + " / 5" });
  if (sr > 0) out.push({ k: "sore", label: "Soreness", w: 0.25, v: clamp01((5 - sr) / 4), core: 1, src: "You", txt: sr + " / 5" });
  const hd = S.hd || {}, h = hd[date];
  if (h) {
    const base = k => { const v = []; for (let i = 1; i <= 14; i++) { const x = hd[addD(date, -i)]; if (x && +x[k] > 0) v.push(+x[k]); } return v.length >= 3 ? avgOf(v) : 0; };
    const bh = base("hrv"), br = base("rhr");
    if (+h.hrv > 0 && bh) out.push({ k: "hrv", label: "HRV", w: 0.3, v: clamp01((h.hrv / bh - 0.85) / 0.25), core: 1, src: "Health", txt: Math.round(h.hrv) + " ms (usual " + Math.round(bh) + ")" });
    if (+h.rhr > 0 && br) out.push({ k: "rhr", label: "Resting HR", w: 0.15, v: clamp01(1 - (h.rhr - br) / 7), core: 1, src: "Health", txt: Math.round(h.rhr) + " bpm (usual " + Math.round(br) + ")" });
  }
  const y = addD(date, -1), wy = (S.water || {})[y], wt = W && W.T ? W.T.water * 1000 : 3000;
  if (wy > 0) out.push({ k: "water", label: "Hydration yesterday", w: 0.1, v: clamp01(wy / wt), src: "You", txt: r1(wy / 1000) + " L" });
  const dn = [1, 2, 3].map(i => S.done[addD(date, -i)]).filter(x => x != null);
  if (dn.length) out.push({ k: "adh", label: "Plan adherence, 3d", w: 0.1, v: clamp01(avgOf(dn) / 100), src: "App", txt: Math.round(avgOf(dn)) + "%" });
  const wl = S.wlog || {}, recent = [1, 2].reduce((a, i) => { const x = wl[addD(date, -i)]; return a + (x && x.end ? +x.sets || 0 : 0); }, 0);
  const hist = Object.keys(wl).filter(d => d < date && diffD(d, date) <= 28 && wl[d] && wl[d].end);
  if (hist.length >= 3) { const per2 = hist.reduce((a, d) => a + (+wl[d].sets || 0), 0) / 14; if (per2 > 0) out.push({ k: "load", label: "Training load, 2d", w: 0.1, v: clamp01(1 - (recent / per2 - 1)), src: "App", txt: recent + " sets (usual " + Math.round(per2) + ")" }); }
  return out;
}
function rdScore(parts) { const ws = parts.reduce((a, p) => a + p.w, 0); return ws > 0 ? clamp01(parts.reduce((a, p) => a + p.w * p.v, 0) / ws) : null; }
function readiness(date) {
  const l = S.log[date] || {}; let parts = rdSignals(date), est = false, from = null;
  if (!parts.some(p => p.core)) {
    for (let i = 1; i <= 3 && !from; i++) {
      const pp = rdSignals(addD(date, -i));
      if (pp.some(p => p.core)) { const sc = rdScore(pp); if (sc !== null) { from = addD(date, -i); parts = [{ k: "carry", label: "Carried from " + dateLabel(from, { weekday: "short" }), w: 1, v: sc * 0.7 + 0.18, core: 1, src: "Estimate", txt: "no data today" }]; } }
    }
    if (!from) return null;
    est = true;
  }
  const score = rdScore(parts); if (score === null || !isFinite(score)) return null;
  const have = parts.filter(p => p.core).map(p => p.k);
  return { score, pct: Math.round(score * 100), level: score >= 0.7 ? "green" : score >= 0.4 ? "yellow" : "red", off: !!l.ro, est, from, parts, missing: est ? RD_CORE.slice() : RD_CORE.filter(k => !have.includes(k)) };
}
function adjusted(e, rd) {
  if (!rd || rd.off || rd.est || rd.level === "green") return { sets: e.sets, rir: e.rir };
  if (rd.level === "yellow") return { sets: Math.max(2, e.sets - 1), rir: e.rir + 1 };
  return { sets: Math.max(2, Math.ceil(e.sets * 0.6)), rir: e.rir + 2 };
}
function healthChips(date) {
  const h = (S.hd || {})[date]; if (!h) return "";
  const base = k => { const v = []; for (let i = 1; i <= 14; i++) { const x = S.hd[addD(date, -i)]; if (x && +x[k] > 0) v.push(+x[k]); } return v.length >= 3 ? Math.round(avgOf(v)) : 0; };
  const ch = [];
  if (h.sleep > 0) ch.push(`${ico("moon", 13)} ${r1(h.sleep)} h sleep`);
  if (h.hrv > 0) { const b = base("hrv"); ch.push(`${ico("activity", 13)} HRV ${Math.round(h.hrv)}${b ? ` <small>(usual ${b})</small>` : ""}`); }
  if (h.rhr > 0) { const b = base("rhr"); ch.push(`${ico("heart", 13)} RHR ${Math.round(h.rhr)}${b ? ` <small>(usual ${b})</small>` : ""}`); }
  return ch.length ? `<div class="hchips"><span class="hsrc">${ico("watch", 13)} Health</span>${ch.map(x => `<span>${x}</span>`).join("")}</div>` : "";
}
function renderReady() {
  const d = selDay(), l = S.log[d.date] || {}, rd = readiness(d.date);
  const sel = (f, opts, cur) => `<select data-rd="${f}"><option value="">–</option>${opts.map(o => `<option value="${o[0]}" ${String(o[0]) === String(cur) ? "selected" : ""}>${o[1]}</option>`).join("")}</select>`;
  const s = parseFloat(l.s), sCur = s > 0 ? SLEEP_OPT.reduce((b, o) => Math.abs(o[0] - s) < Math.abs(b[0] - s) ? o : b)[0] : "";
  const e5 = [[1, "1 · drained"], [2, "2 · low"], [3, "3 · ok"], [4, "4 · good"], [5, "5 · great"]];
  const so = [[1, "1 · none"], [2, "2 · light"], [3, "3 · moderate"], [4, "4 · high"], [5, "5 · severe"]];
  const msg = !rd ? "Fill these in to get a suggestion for this day." : rd.off ? "Suggestion off. Training as planned." : rd.level === "green" ? "Train as planned." : rd.level === "yellow" ? "1 fewer set per exercise and +1 RIR." : "About 40% fewer sets and +2 RIR. Easy walk is fine if unwell.";
  $("rdBadge").textContent = rd ? `${rd.level.toUpperCase()} · ${rd.pct}${rd.est ? " · estimate" : ""}` : "";
  const miss = rd ? rd.missing.map(k => RD_NAME[k]) : [];
  const rdxHTML = rd ? `<div class="rdx"><div class="rdx-h"><b>${rd.pct}<small>/100</small></b><span>${rd.est ? "Estimated from last measured day (does not alter sets)." : `Built from ${rd.parts.length} signal${rd.parts.length === 1 ? "" : "s"}${miss.length ? `. Re-weighted around missing: ${esc(miss.join(", "))}.` : "."}`}</span></div><div class="rdx-t pro-only">${rd.parts.map(p => `<div class="rdx-r"><span>${esc(p.label)}</span><div class="vbar"><i style="width:${Math.round(p.v * 100)}%;background:${p.v >= 0.7 ? "var(--green)" : p.v >= 0.4 ? "var(--amber)" : "var(--red)"}"></i></div><small>${esc(p.txt)}</small><em>${esc(p.src)}</em></div>`).join("")}</div></div>` : "";
  $("readyBox").innerHTML = `<div class="fgrid"><div class="cg"><label>Sleep last night</label>${sel("s", SLEEP_OPT, sCur)}</div><div class="cg"><label>Energy</label>${sel("e", e5, l.e)}</div><div class="cg"><label>Soreness</label>${sel("sr", so, l.sr)}</div></div>${healthChips(d.date)}${rd ? callout(rd.off ? "info" : rd.level, rd.off ? "sliders" : rd.level === "green" ? "check" : "alert", rd.off ? "Training as planned" : rd.level === "green" ? "Green light" : rd.level === "yellow" ? "Go a bit easier" : "Back off today", "", msg) : `<div class="d" style="margin-top:8px">${msg}</div>`}${rd && rd.level !== "green" ? `<button class="btn" data-rd="toggle" style="margin-top:8px">${rd.off ? "Use the suggestion" : "Train as planned anyway"}</button>` : ""}${rdxHTML}`;
}
function onReady(t) {
  const f = t.dataset.rd; if (f === "toggle") return;
  const l = S.log[S.sel] = S.log[S.sel] || {};
  l[f] = t.value;
  if (f === "s") delete l.sh; /* manual sleep beats Health */
  save(); renderPlan(); renderProgExtra();
}
function toggleReady() { const l = S.log[S.sel] = S.log[S.sel] || {}; l.ro = l.ro ? 0 : 1; save(); renderPlan(); }

/* ---------- Unified Daily Brief (Command Strip + Streak/PR pills) ---------- */
function dayFrac() { const n = new Date(), h = n.getHours() + n.getMinutes() / 60; return clamp01((h - 7) / 14); }
function nextActions(d) {
  const A = [], isT = d.date === TODAY, s = d.session, e = eatenOn(d), m = d.macros, rd = readiness(d.date), fr = dayFrac(), hx = hxState();
  if (!S.confirmed) A.push({ i: "user", t: "Finish your profile", w: "Calories, macros and your training split are built from your stats and goal.", b: '<button class="btn pri" data-goto="profile">Open Profile</button>' });
  if (isT && s && s.ex.length && d.kind === "train" && (!rd || rd.est)) A.push({ i: "activity", t: "10-second readiness check", w: "Sleep, energy and soreness calibrate today's volume and RIR.", b: '<button class="btn" data-nba="ready">Check in</button>' });
  if (s && s.ex && s.ex.length) {
    const n = s.ex.length, dn = s.ex.filter((x, i) => S.checks[`${d.date}|ex|${i}`]).length;
    if (dn < n) A.push({ i: "dumbbell", t: dn ? `Resume ${s.name}` : `Train: ${s.name}`, w: `${n - dn} exercise${n - dn === 1 ? "" : "s"} left · ${s.rir} RIR. Log sets so targets auto-progress.`, b: `<button class="btn pri" data-wm="open">${ico("play", 13)} ${dn ? "Resume" : "Start"}</button>` });
  }
  const mi = d.meals.findIndex((x, i) => !S.checks[`${d.date}|meal|${i}`]);
  if (mi >= 0) A.push({ i: "utensils", t: `Eat: ${d.meals[mi].name}`, w: `${d.meals[mi].kcal} kcal · ${d.meals[mi].P} g protein.`, b: `<button class="btn" data-nba="meal" data-i="${mi}">Mark eaten</button>` });
  if (isT) {
    const pl = Math.round(m.P - e.P);
    if (fr > 0.55 && e.P < m.P * fr * 0.75 && pl > 20) A.push({ i: "utensils", t: `Protein behind: ${pl} g to go`, w: "A shake or Greek yogurt closes most of the gap.", b: '<button class="btn" data-nba="food">Log food</button>' });
    const wt = W.T.water * 1000, wn = (S.water || {})[d.date] || 0;
    if (wn < wt * fr * 0.7 && wn < wt) A.push({ i: "droplet", t: `Hydration: ${r1(wn / 1000)} / ${W.T.water} L`, w: "Steady intake through the day.", b: '<button class="btn" data-wa="500">+500 ml</button>' });
    const st = S.steps[d.date] || 0, g = stepGoal();
    if (st > 0 && st < g * fr * 0.7) A.push({ i: "steps", t: `${(g - st).toLocaleString()} steps to goal`, w: "A 10-minute walk after a meal adds ~1,000 steps.", b: "" });
    if (!(S.log[d.date] || {}).w && new Date().getHours() < 12) A.push({ i: "scale", t: "Log morning weight", w: "Feeds your EWMA trend and adaptive TDEE.", b: '<button class="btn" data-goto="progress">Log weight</button>' });
    if (hx.state === "stale") A.splice(Math.min(1, A.length), 0, { i: "heart", t: `Health data is ${hx.age} days old`, w: isIOS() ? "One tap runs your shortcut and pulls today's metrics." : "Open on your iPhone and tap Run sync.", b: isIOS() ? hxRunBtn("pri", "Run sync") : '<button class="btn" data-hx="sync">Check</button>' });
  }
  if (!A.length) A.push({ i: "check", t: isT ? "Everything done for today" : "Nothing open on this day", w: "Recovery is the job now: aim for 7.5+ h sleep.", b: "" });
  return A;
}
function renderCommand() {
  const el = $("cmdBox"); if (!el || !W) return;
  const d = selDay(), e = eatenOn(d), m = d.macros, rd = readiness(d.date), s = d.session, st = S.steps[d.date] || 0, g = stepGoal(), fr = d.date === TODAY ? dayFrac() : 1;
  const n = s && s.ex ? s.ex.length : 0, dn = n ? s.ex.filter((x, i) => S.checks[`${d.date}|ex|${i}`]).length : 0;
  const pace = (v, t) => d.date !== TODAY ? "" : v >= t ? "goal hit" : v >= t * fr * 0.9 ? "on pace" : "behind";
  const A = nextActions(d), guided = UX().mode === "guided", top = A[0], rest = A.slice(1, guided ? 3 : 4);
  const str = streak(), prs7 = prList().filter(h => diffD(h.d, TODAY) >= 0 && diffD(h.d, TODAY) < 7).length;
  el.innerHTML = `<div class="card cmd"><div class="crings">
     ${ringSm(rd ? rd.score : 0, rd ? (rd.level === "green" ? "var(--green)" : rd.level === "yellow" ? "var(--amber)" : "var(--red)") : "var(--panel3)", "Readiness", rd ? rd.pct : "–", rd ? (rd.est ? "estimate" : rd.level === "green" ? "ready" : rd.level === "yellow" ? "moderate" : "back off") : "check in")}
     ${ringSm(e.kcal / m.kcal, "var(--accent)", "Fuel", Math.round(e.kcal / m.kcal * 100) + "%", `${Math.round(e.kcal).toLocaleString()} / ${Math.round(m.kcal).toLocaleString()}<br>${Math.round(e.P)}/${Math.round(m.P)}g P`)}
     ${ringSm(n ? dn / n : d.kind === "rest" ? 1 : 0, "var(--green)", "Train", n ? `${dn}/${n}` : "Rest", n ? (dn === n ? "complete" : s.name.slice(0, 14)) : "recovery")}
     ${ringSm(st / g, "var(--amber)", "Move", st ? (st >= 1000 ? r1(st / 1000) + "k" : st) : "–", st ? pace(st, g) || "steps" : "no steps")}
    </div>
    <div class="nba">
     <div class="brief-meta">
       <div class="sechl" style="margin:0">Next best action</div>
       <div class="brief-pills">
         ${str ? `<span class="badge g">${str}d streak</span>` : ""}
         ${prs7 ? `<span class="badge a">${prs7} PR${prs7 === 1 ? "" : "s"} this wk</span>` : ""}
       </div>
     </div>
     <div class="nba1"><span class="nba-i" aria-hidden="true">${ico(top.i, 20)}</span><div class="nba-b"><b>${esc(top.t)}</b><p class="guided-only">${esc(top.w)}</p></div>${top.b}</div>
     ${rest.length ? `<div class="nbaq">${rest.map(a => `<div class="nba2"><span class="nba-s" aria-hidden="true">${ico(a.i, 15)}</span><span>${esc(a.t)}</span>${a.b}</div>`).join("")}</div>` : ""}
    </div></div>`;
}

/* ---------- Water, Supplements & Cardio ---------- */
const waterAmt = date => r1(((S.water || {})[date] || 0) / 1000);
const waterBtns = () => `<button type="button" class="rest" data-wa="-250">−250</button><button type="button" class="rest" data-wa="250">+250</button><button type="button" class="rest" data-wa="500">+500</button>`;
function addWater(ml) {
  S.water = S.water || {};
  const nw = Math.max(0, (S.water[S.sel] || 0) + ml);
  S.water[S.sel] = nw;
  const key = `${S.sel}|hab|water`;
  S.checks[key] = nw >= W.T.water * 1000;
  markDone(key); save(); renderPlan(); renderOverall(); renderProgExtra();
}
function renderSupp() {
  const h = $("hList"); if (!h) return;
  const ux = UX(), day = S.supp[S.sel] || {}, n = ux.supps.filter(x => day[x]).length;
  h.insertAdjacentHTML("beforeend", `<div class="suppbar"><div class="sechl">Supplements &amp; electrolytes <b>${n} / ${ux.supps.length}</b><button class="rest" data-supp-edit="1">Edit list</button></div><div class="fchips">${ux.supps.map(x => `<button type="button" class="fchip ${day[x] ? "s1" : "s0"}" data-supp="${esc(x)}" aria-pressed="${!!day[x]}">${day[x] ? "✓ " : ""}${esc(x)}</button>`).join("") || '<span class="d">No supplements listed.</span>'}</div></div>`);
}

const CT = ["Walk", "Run", "Bike", "Row", "Swim", "Stairs", "Elliptical", "HIIT", "Hike", "Sport", "Other"];
const stepGoal = () => ({ cut: 10000, bulk: 7000 })[S.prof.goal] || 8000;
const cardioGoal = () => ({ cut: 150, recomp: 120, bulk: 60, peak: 90 })[S.prof.goal] || 120;
function cardioOn(date) {
  const a = ((S.cardio || {})[date] || []).map((x, idx) => Object.assign({ src: "me", _id: x.id != null ? String(x.id) : "idx:" + idx }, x));
  const h = (((S.hd || {})[date] || {}).cardio) || [];
  return a.concat(h.map(x => Object.assign({ src: "health" }, x)));
}
function renderCardio() {
  const el = $("cardioBox"); if (!el || !W) return;
  const d = selDay(), date = d.date, hdSteps = (((S.hd || {})[date] || {}).steps || 0), st = S.steps[date] || 0, g = stepGoal(), fromH = hdSteps > 0 && !(S.stepsM && S.stepsM[date]);
  const days = []; for (let i = 6; i >= 0; i--) days.push(addD(date, -i));
  const v = days.map(x => S.steps[x] || 0), mx = Math.max(g * 1.15, ...v);
  const wkMin = W.days.reduce((a, x) => a + cardioOn(x.date).reduce((b, c) => b + (+c.min || 0), 0), 0), cg = cardioGoal();
  const hm = 220 - (+S.prof.age || 30), z2 = [Math.round(hm * 0.6), Math.round(hm * 0.7)];
  const list = cardioOn(date);
  const rx = d.kind === "train" ? ["warm", "bolt", "Optional finisher", "10 min easy bike or incline walk after lifting."]
    : d.kind === "rest" ? ["good", "heart", "Zone 2 day", `30–40 min at <b>${z2[0]}–${z2[1]} bpm</b> (conversational pace).`]
    : ["info", "steps", "Light movement only", "Easy walking. Save your energy."];
  $("cdBadge").textContent = `${wkMin} / ${cg} min this week`;
  el.innerHTML = `<div class="stepwrap"><div class="stepring">${ringBig(st / g)}<div class="stepnum"><b>${st ? st.toLocaleString() : "0"}</b><small>/ ${g.toLocaleString()}</small></div></div>
   <div class="stepside"><div class="sechl">Steps · last 7 days</div><div class="stepbars" style="--goal:${g / mx * 100}%">${v.map((x, i) => `<i title="${esc(days[i])}: ${x}" style="height:${Math.max(4, x / mx * 100)}%" class="${x >= g ? "hit" : ""} ${days[i] === date ? "cur" : ""}"></i>`).join("")}</div>
   <div class="stepsrc">${fromH ? '<span class="badge g">Synced from Health</span>' : `<label>Steps today <input type="number" inputmode="numeric" id="cdSteps" value="${st || ""}" placeholder="0"/></label>${hdSteps > 0 ? `<span class="badge">Synced from Health: ${hdSteps.toLocaleString()}</span>` : ""}`}</div></div></div>
   ${callout(rx[0], rx[1], rx[2], "", rx[3])}
   <div class="cdweek"><div class="sechl">Cardio this week <b>${wkMin} / ${cg} min</b></div><div class="cdbar"><i style="width:${Math.min(100, wkMin / cg * 100)}%"></i></div></div>
   <div class="sechl" style="margin-top:12px">${esc(dateLabel(date, { weekday: "long" }))}</div>
   ${list.length ? list.map(c => `<div class="cdrow"><span class="cdt">${esc(c.type)}</span><span class="cdm">${c.min} min${c.km ? ` · ${metric() ? r1(c.km) + " km" : r1(c.km / 1.60934) + " mi"}` : ""}${c.hr ? ` · ${c.hr} bpm` : ""}${c.kcal ? ` · ${c.kcal} kcal` : ""}</span>${c.src === "health" ? `<span class="badge">${ico("watch", 12)}</span>` : `<button class="rest" data-cddel="${esc(c._id)}" aria-label="Remove">✕</button>`}</div>`).join("") : '<div class="d">No cardio logged.</div>'}
   <div class="cdadd"><select id="cdType" aria-label="Type">${CT.map(t => `<option>${t}</option>`).join("")}</select><input id="cdMin" type="number" inputmode="numeric" placeholder="Min" min="1" max="600" aria-label="Minutes"/><input id="cdHr" type="number" inputmode="numeric" placeholder="HR" aria-label="Average heart rate"/><button class="btn pri" id="cdAdd">Log</button></div>`;
}

/* ---------- Today (renderPlan) ---------- */
const UIR = {}, UIT = {};
const PEAKNOTE = {
  deplete: "Train hard and keep carbs low (~2.5 g/kg). Keep water and sodium normal.",
  flush: "Easy Zone 2 walk and decompression. Carbs rise to ~4 g/kg.",
  load1: "Carb load day 1. Avoid fibrous foods you don't tolerate, drink normally, light training.",
  load2: "Carb load day 2. Practice posing, sleep well, eat on schedule.",
  event: "Eat pre-event meals on time, do the 15-min pump ~75 min before."
};
function recipeHTML(mm, date, i) {
  if (!mm.rec) return "";
  const key = date + "|" + i, v = mm.var, tab = UIT[key] || (S.prof.budget === "budget" && v ? "bud" : "std");
  const ol = a => `<ol>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ol>`;
  const price = f => `≈$${((mm.cost || 0) * f).toFixed(2)}`;
  const ingH = mm.ing && mm.ing.length ? `<div class="d"><b>Ingredients (per serving):</b></div><ul style="margin:4px 0 8px 18px;font-size:.8rem">${mm.ing.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const itemH = !mm.user && mm.items && mm.items.length ? ingredientTable(mm) : "";
  const panels = { std: ingH + itemH + ol(mm.rec.slice(1)) };
  if (v) { panels.bud = `<div class="d"><b>Swaps:</b> ${esc(v.b[0])} <b>${price(0.7)}</b></div>${ol(v.b[1])}`; panels.gour = `<div class="d"><b>Upgrades:</b> ${esc(v.g[0])} <b>${price(1.5)}</b></div>${ol(v.g[1])}`; }
  const tabs = [["std", "Standard"], ["bud", "Budget"], ["gour", "Gourmet"]].filter(x => panels[x[0]]);
  return `<details class="rec" data-rk="${key}" ${UIR[key] ? "open" : ""}><summary>Recipe · ${esc(mm.rec[0])}</summary>${macroChips(mm, mm.user ? "planned portion" : "")}<button type="button" class="btn" data-cook="${date}|${i}" style="margin-top:8px">${ico("flame", 14)} Cook mode</button><div class="rtabs">${tabs.map(x => `<button type="button" class="rtab ${x[0] === tab ? "on" : ""}" data-rt="${x[0]}" data-rk="${key}">${x[1]}</button>`).join("")}</div>${tabs.map(x => `<div class="rpanel" data-rp="${x[0]}" ${x[0] === tab ? "" : "hidden"}>${panels[x[0]]}</div>`).join("")}</details>`;
}

function renderPlan() {
  const p = S.prof, d = selDay(), T = W.T, mon = weekMon();
  $("weekNav").innerHTML = W.peak
    ? `<span class="badge a">Peak week · event ${dateLabel(p.event)}</span><button class="btn" id="btnIcs">${ico("calendar", 15)} Add week to calendar</button>`
    : `<button class="btn" data-wk="-1" aria-label="Previous week">‹</button><b>${dateLabel(mon, { month: "short", day: "numeric" })} – ${dateLabel(addD(mon, 6), { month: "short", day: "numeric" })}</b><button class="btn" data-wk="1" aria-label="Next week">›</button>${S.weekOffset ? '<button class="btn" data-wk="0">Today</button>' : ""}<span class="badge"><span class="bfull">Week ${W.wk + 1} of 4 · RIR ${W.rir}${W.wk === 3 ? " · deload" : ""}</span><span class="bshort">W${W.wk + 1} · RIR ${W.rir}${W.wk === 3 ? " · DL" : ""}</span></span><details class="more"><summary class="btn" aria-label="More week options">⋯</summary><div class="menu"><button class="btn" id="btnRotate">${ico("refresh", 15)} New block (rotate)</button><button class="btn" id="btnIcs">${ico("calendar", 15)} Add week to calendar</button><button class="btn" data-ui="ics4">${ico("clock", 15)} Reminders: next 4 weeks</button><button class="btn" id="btnWake">${ico("sun", 15)} ${wlWant ? "Screen stays on ✓" : "Keep screen on"}</button><div class="mver">Elite OS v${APP_MAJOR} · ${APP_VER}</div></div></details>`;
  $("days").innerHTML = W.days.map(x => {
    const pr = dayProg(x);
    return `<button aria-pressed="${x.date === d.date}" class="day ${x.date === d.date ? "active" : ""} ${pr.t && pr.n === pr.t ? "done" : ""} ${x.date === TODAY ? "today" : ""} ${x.session && x.session.ex && x.session.ex.length ? "tr" : "rs"}" data-day="${x.date}"><b>${dateLabel(x.date, { weekday: "short" })}</b><small class="dd"><span class="dm">${dateLabel(x.date, { month: "short" })} </span>${parseISO(x.date).getDate()}</small><small class="dl">${esc(x.label)}</small><div class="mini"><i style="width:${pr.pct * 100}%"></i></div></button>`;
  }).join("");

  const pr = dayProg(d), m = d.macros, a = d.actual, xt = S.extra[d.date] || { kcal: 0, p: 0 }, eat = eatenOn(d), water = T.water;
  $("kpis").innerHTML = `
   <div class="kpi"><div class="ring">${ring(pr.pct)}<div><div class="l">Day complete</div><div class="s">${pr.n} / ${pr.t} items</div></div></div></div>
   <div class="kpi"><div class="l">Calories · cost</div><div class="v">${Math.round(m.kcal).toLocaleString()}</div><div class="s">Meals ${a.kcal.toLocaleString()} (${a.kcal >= m.kcal ? "+" : ""}${a.kcal - m.kcal}) · ≈$${d.cost.toFixed(2)}</div></div>
   <div class="kpi"><div class="l">P / C / F target</div><div class="v" style="font-size:1.05rem">${Math.round(m.P)} / ${Math.round(m.C)} / ${Math.round(m.F)} g</div><div class="mbar"><div class="p" style="width:${m.P * 4 / m.kcal * 100}%"></div><div class="c" style="width:${m.C * 4 / m.kcal * 100}%"></div><div class="f" style="width:${m.F * 9 / m.kcal * 100}%"></div></div></div>
   <div class="kpi"><div class="l">Eaten so far</div><div class="v" style="font-size:1.05rem">${Math.round(eat.kcal)} kcal · ${Math.round(eat.P)}P</div><div class="s">${Math.max(0, Math.round(m.kcal - eat.kcal))} kcal · ${Math.max(0, Math.round(m.P - eat.P))}g P left</div></div>`;

  const retest = W.wk === 3 && !W.peak ? callout("warn", "refresh", "Deload & retest week", "Week 4", `Do lighter sets, then test max strict reps and update them here.<div class="fgrid" style="margin-top:8px;max-width:340px"><div class="cg"><label>Max pull-ups</label><input type="number" inputmode="numeric" data-p="pullMax" value="${p.pullMax}"/></div><div class="cg"><label>Max push-ups</label><input type="number" inputmode="numeric" data-p="pushMax" value="${p.pushMax}"/></div></div>`) : "";
  $("peakNote").innerHTML = retest + (d.phase ? callout("info", "target", esc(d.phase.l), "Peak week", PEAKNOTE[d.phase.k]) : "");

  if (d.session) {
    const s = d.session, rd = readiness(d.date);
    $("wTitle").innerHTML = `${ico("dumbbell", 17)} ${esc(s.name)}`;
    $("wBadge").textContent = `Week ${s.wk + 1} · ${s.rir} RIR`;
    $("wEdit").hidden = false; $("wStart").hidden = !s.ex.length;
    $("wList").innerHTML = warmHTML(d) + `<div class="sech"><span>${ico("dumbbell", 14)} Main work</span><small>${s.ex.length} exercises · ${s.ex.reduce((ac, x) => ac + adjusted(x, rd).sets, 0)} sets</small></div><label class="trchk sw-auto"><input type="checkbox" id="autoRest" ${autoRestOn() ? "checked" : ""}/> Auto-start rest timer when logging a set</label>` +
      (() => {
        const G = ssGroups(s.ex);
        return s.ex.map((e, i) => {
          const gi = G[i];
          const r = row(`${d.date}|ex|${i}`, (gi ? `<span class="ssl">${gi.g}${gi.k}</span>` : "") + esc(e.name) + formLink(e.name, e.demo), `${setLine(e, rd, gi)}<div class="exload">${esc(e.load)}</div>${e.wu ? `<div class="wuchip">Ramp-up: ${WU[e.wu]}</div>` : ""}`, `${e.note ? `<div class="d">${esc(e.note)}</div>` : ""}<div class="cue">${esc(e.cue)}</div>${perfHTML(e)}`, `${e.ss ? "" : `<button type="button" class="rest" data-t="${e.rest}">${ico("clock", 13)} ${e.rest}s</button>`}${e.key !== "pump" && e.key !== "cust" ? `<button type="button" class="rest" data-swap="${esc(e.key)}">${ico("swap", 13)} swap</button>` : ""}`);
          if (!gi) return r;
          const head = gi.k === 1 ? `<div class="ssg" role="group" aria-label="Superset ${gi.g}"><div class="ssh"><b>SUPERSET ${gi.g}</b><span>${gi.n === 2 ? "2 exercises" : gi.n === 3 ? "Tri-set" : gi.n + " exercises"} · ${ssRounds(s.ex, gi, rd)} rounds</span><span>${s.ex.slice(gi.s, gi.e + 1).map((x, k) => gi.g + (k + 1)).join(" → ")}, rest ${s.ex[gi.e].rest}s</span></div>` : "";
          return head + r + (gi.k === gi.n ? "</div>" : "");
        }).join("");
      })() + coolHTML(d);
  } else {
    $("wTitle").innerHTML = `${ico("leaf", 17)} ${esc(d.label)}`;
    $("wBadge").textContent = d.kind === "rest" ? "Recovery" : "No lifting";
    $("wEdit").hidden = false; $("wStart").hidden = true;
    const walk = d.kind === "flush" ? "35 min Zone 2 walk, nasal breathing. 4 × 45s dead hangs. 5 × 20s stomach vacuums."
      : d.kind === "posing" ? "10 min mobility, 5 × 20s stomach vacuums, practice poses."
      : T.goal === "cut" ? "30–40 min Zone 2 walk plus 10 min mobility. Target 9–11k steps." : "20–30 min easy walk plus 10 min mobility. Target 7–9k steps.";
    $("wList").innerHTML = callout(d.kind === "rest" ? "good" : "info", d.kind === "rest" ? "leaf" : "target", d.kind === "rest" ? "Recovery day" : d.label, "", walk) +
      (d.kind === "rest" ? callout("cool", "wind", "Mobility · 10 min", "", '<ul class="cl"><li>Cat-cow, 10 slow reps</li><li>World\'s greatest stretch, 5 each side</li><li>90/90 hip switches, 10 total</li><li>Dead hang or doorway chest stretch, 3 × 30 s</li></ul>') : "");
  }

  $("mBadge").textContent = `${d.meals.length} meals`;
  $("mList").innerHTML = d.meals.map((mm, i) => {
    const mult = mealMultOf(d.date, i), scaled = mult === 1 ? mm : { kcal: Math.round(mm.kcal * mult), P: Math.round(mm.P * mult), C: Math.round(mm.C * mult), F: Math.round(mm.F * mult) };
    const items = mm.user ? `Your recipe · ${r1(mm.mult * mult)} serving${mm.mult * mult === 1 ? "" : "s"}` : mm.items.map(it => `${qtyText(it.id, Math.round(it.g * mult), p.units, false)}${FOODS[it.id].u && BARE2.includes(FOODS[it.id].u[0]) ? "" : " " + FOODS[it.id].n.toLowerCase()}`).join(" · ");
    const multBar = mm.custom ? "" : `<div class="mmult" role="group" aria-label="Portion size">${[0.5, 1, 1.5].map(v => `<button type="button" class="${v === mult ? "on" : ""}" data-mmult="${d.date}|${i}|${v}">${v}×</button>`).join("")}</div>`;
    return row(`${d.date}|meal|${i}`, esc(mm.name), esc(items || "Add your own"),
      `${macroChips(scaled, mm.cost ? `≈$${(mm.cost * mult).toFixed(2)}` : "")}${multBar}${mm.prep ? `<div class="cue">${esc(mm.prep)}</div>` : ""}${recipeHTML(mm, d.date, i)}`,
      mm.custom ? "" : `<button type="button" class="rest" data-mswap="${d.date}|${i}">${ico("swap", 13)} swap</button><button type="button" class="rest ${(S.prefs.meals || {})[mm.tid] === 1 ? "on" : ""}" data-mp="1|${mm.tid}" aria-label="Like meal">${ico("thumbUp", 13)}</button><button type="button" class="rest" data-mp="-1|${mm.tid}" aria-label="Dislike meal">${ico("thumbDn", 13)}</button>`);
  }).join("");

  $("exBox").innerHTML = `<div style="padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--border)"><div class="d">Quick macro entry (leave calories blank to compute from macros).</div><div class="fgrid" style="margin-top:8px"><div class="cg"><label>What (optional)</label><input id="exN" maxlength="60" placeholder="Restaurant burrito"/></div><div class="cg"><label>Calories</label><input type="number" inputmode="numeric" id="exK"/></div><div class="cg"><label>Protein (g)</label><input type="number" inputmode="numeric" id="exP"/></div><div class="cg"><label>Carbs (g)</label><input type="number" inputmode="numeric" id="exC"/></div><div class="cg"><label>Fat (g)</label><input type="number" inputmode="numeric" id="exF"/></div></div><div style="display:flex;gap:8px;margin-top:8px"><button class="btn pri" id="btnAddEx">Add to food log</button>${xt.kcal || xt.p ? '<button class="btn danger" id="btnClrEx">Clear legacy quick adds</button>' : ""}</div>${xt.kcal || xt.p ? `<div class="d" style="margin-top:6px">Legacy quick adds: ${xt.kcal || 0} kcal, ${xt.p || 0} g protein</div>` : ""}</div>`;

  const stepsLbl = T.goal === "cut" ? "9–11k" : "7–9k";
  $("hList").innerHTML = [
    ["water", `Water ${waterAmt(d.date)} / ${water} L`, "Steady intake through the day."],
    ["move", d.session && d.kind === "train" ? `Hit all sets at ${d.session.rir} RIR` : `Walk ${stepsLbl} steps`, d.session && d.kind === "train" ? "Log sets so next week auto-progresses." : "Easy movement speeds recovery."],
    ["sleep", "Sleep 7.5–9 h", "Consistent bedtime, cool dark room."]
  ].map(h => row(`${d.date}|hab|${h[0]}`, h[1], h[2], "", h[0] === "water" ? waterBtns() : "")).join("");

  /* Direct calls — zero monkey-patching */
  renderReady();
  snapNut();
  renderCommand();
  renderSupp();
  renderFood();
  renderMicro();
  renderCardio();
  renderPlate();
  renderCoachToday();
  renderQuality();
}

/* ---------- Overview / Targets ---------- */
const SUPP_CARD = `<div class="card"><h2><span>Supplements, ranked by evidence</span><span class="badge">Optional</span></h2><div class="d" style="line-height:1.65"><b>Strong:</b> creatine monohydrate 3–5 g daily. Protein powder for convenience.<br><b>Moderate:</b> caffeine ~3 mg/kg, 30–60 min pre-workout (if sleep allows).<br><b>Conditional:</b> vitamin D if bloodwork is low; omega-3 if fish intake is low.<br><b>Skip:</b> BCAAs, fat burners, testosterone boosters. Not medical advice.</div></div>`;
function renderOverview() {
  const T = W.T, p = S.prof, w = p.kg, wkChange = (T.kcal - T.tdee) * 7 / 7700, pctWk = wkChange / w * 100;
  const bands = { chest: [10, 22], back: [10, 22], shoulders: [8, 30], quads: [10, 20], hams: [8, 16], glutes: [6, 18], biceps: [6, 20], triceps: [6, 20], calves: [6, 16], abs: [6, 16] };
  if (p.exp === "beg") Object.keys(bands).forEach(k => bands[k][0] = Math.min(bands[k][0], 6));
  const vol = MUSCLES.map(([k, l]) => {
    const v = W.vol[k] || 0, [lo, hi] = bands[k], col = v < lo ? "var(--amber)" : v > hi ? "var(--red)" : "var(--green)";
    return `<div class="vrow"><span>${l}</span><div class="vbar"><i style="width:${Math.min(100, v / 24 * 100)}%;background:${col}"></i></div><b>${v}</b><small>${lo}–${hi}</small></div>`;
  }).join("");
  const segH = `<div class="seg foodseg">${[["grocery", "cart", "Groceries"], ["kitchen", "book", "Recipes"], ["overview", "target", "Targets"]].map(([k, ic, l]) => `<button data-food="${k}" class="${FOODSUB === k ? "on" : ""}">${ico(ic, 16)}${l}</button>`).join("")}</div>`;
  $("pane-overview").innerHTML = segH +
    W.notes.map(n => /are set by/.test(n) ? callout("coach", "target", "Targets from your coach", "", esc(n)) : callout(/^Peak week/.test(n) ? "warn" : /clinician|aggravate/.test(n) ? "red" : "info", /^Peak week/.test(n) ? "calendar" : /clinician|aggravate/.test(n) ? "alert" : "info", /^You are on your own/.test(n) ? "Your own training plan" : /^Peak week/.test(n) ? "Peak week coming" : /aggravate/.test(n) ? "Injury filter on" : "Note", "", esc(n))).join("") +
    (() => { const lo = [], hi = []; MUSCLES.forEach(([k, l]) => { const v = W.vol[k] || 0, [a, b] = bands[k]; if (v < a) lo.push(l); else if (v > b) hi.push(l); }); return !lo.length && !hi.length ? callout("good", "target", "Volume is on target", "", "Every muscle sits inside its weekly hard-set range.") : callout("warn", "sliders", "Volume needs attention", "", `${lo.length ? `<b>Under target:</b> ${esc(lo.join(", "))}. ` : ""}${hi.length ? `<b>Over target:</b> ${esc(hi.join(", "))}. ` : ""}See the bars below.`); })() +
    `<div class="kpis">
      <div class="kpi"><div class="l">Target calories</div><div class="v">${Math.round(T.kcal).toLocaleString()}</div><div class="s">${T.pct > 0 ? "+" : ""}${(T.pct * 100).toFixed(0)}% vs TDEE${p.kcalAdj ? ` · ${p.kcalAdj > 0 ? "+" : ""}${p.kcalAdj} adj` : ""}</div></div>
      <div class="kpi"><div class="l">Maintenance (TDEE)</div><div class="v">${Math.round(T.tdee).toLocaleString()}</div><div class="s">BMR ${Math.round(T.bmr)} · ${p.bf > 0 ? "Katch-McArdle" : "Mifflin-St Jeor"}</div></div>
      <div class="kpi"><div class="l">Protein</div><div class="v" style="color:var(--accent2)">${Math.round(T.P)} g</div><div class="s">${(T.P / w).toFixed(1)} g/kg</div></div>
      <div class="kpi"><div class="l">Carbs · fat</div><div class="v" style="font-size:1.12rem"><span style="color:var(--green)">${Math.round(T.C)}g</span> · <span style="color:var(--amber)">${Math.round(T.F)}g</span></div><div class="s">${(T.C / w).toFixed(1)} · ${(T.F / w).toFixed(1)} g/kg</div></div>
      <div class="kpi"><div class="l">Fiber · water</div><div class="v" style="font-size:1.12rem">${Math.round(T.fiber)} g · ${T.water} L</div><div class="s">14 g/1000 kcal · 35 ml/kg</div></div>
      <div class="kpi"><div class="l">Est. food cost</div><div class="v" style="font-size:1.12rem">$${(W.days.reduce((a, d) => a + d.cost, 0) / 7).toFixed(2)}/d</div><div class="s">${p.budget === "budget" ? "Budget mode" : "Standard"}</div></div>
      <div class="kpi"><div class="l">Expected change</div><div class="v" style="font-size:1.12rem">${wkChange > 0 ? "+" : ""}${r1(metric() ? wkChange : wkChange * LB)} ${wU()}/wk</div><div class="s">${pctWk > 0 ? "+" : ""}${pctWk.toFixed(2)}%/wk</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2><span>Weekly hard sets per muscle</span><span class="badge">${W.sessions.length} sessions · wk ${W.wk + 1}/4</span></h2>${vol}<div class="d" style="margin-top:8px">Secondary work counts half.</div></div>
      <div class="card"><h2><span>Why this plan</span></h2><div class="d" style="line-height:1.6"><b>Energy:</b> ${p.bf > 0 ? "Katch-McArdle" : "Mifflin-St Jeor"} × activity, refined by EWMA weight trend and adaptive TDEE.<br><b>Protein:</b> ${W.T.goal === "cut" ? "2.2" : "2.0"} g/kg to protect lean mass.<br><b>Carbs &amp; fat:</b> ≥0.7 g/kg fat; carbs +10% on training days.<br><b>Training:</b> 4-week RIR wave (3 → 2 → 1 → deload).</div></div>
    </div>` + SUPP_CARD;
}

/* ---------- Train Custom Builder ---------- */
const DAYN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TR = { open: -1, q: "", mu: "all" };
function normCP(c) {
  if (!c || typeof c !== "object") c = {};
  if (!c.mode) c.mode = "auto";
  if (c.deload === undefined) c.deload = true;
  if (!c.plans || typeof c.plans !== "object") { c.plans = { p1: { name: "My plan", mt: 0, days: c.days || {} } }; c.active = "p1"; }
  delete c.days;
  if (!c.active || !c.plans[c.active] || c.plans[c.active].deleted) {
    const id = Object.keys(c.plans).find(k => !c.plans[k].deleted);
    if (id) c.active = id; else { c.plans.p1 = { name: "My plan", mt: NOW(), days: {} }; c.active = "p1"; }
  }
  Object.values(c.plans).forEach(p => { if (!p.days) p.days = {}; });
  return c;
}
const CP = () => S.cplan = normCP(S.cplan);
const PLN = () => { const c = CP(); return c.plans[c.active]; };
const PD = () => PLN().days;
const tomb = () => ({ name: "", ex: [], mt: NOW() });
function touch(dd) { const t = NOW(), p = PLN(); p.mt = t; CP().mt = t; if (dd !== undefined && p.days[dd]) p.days[dd].mt = t; }
function mergeCP(a, b) {
  const A = normCP(JSON.parse(JSON.stringify(a || {}))), B = normCP(JSON.parse(JSON.stringify(b || {})));
  const top = (B.mt || 0) >= (A.mt || 0) ? B : A, o = { mode: top.mode, deload: top.deload, active: top.active, mt: Math.max(A.mt || 0, B.mt || 0), plans: {} };
  new Set([...Object.keys(A.plans), ...Object.keys(B.plans)]).forEach(id => {
    const pa = A.plans[id], pb = B.plans[id];
    if (!pa || !pb) { o.plans[id] = pa || pb; return; }
    const nw = (pb.mt || 0) >= (pa.mt || 0) ? pb : pa, days = {};
    new Set([...Object.keys(pa.days), ...Object.keys(pb.days)]).forEach(k => { const da = pa.days[k], db = pb.days[k]; days[k] = !da ? db : !db ? da : ((db.mt || 0) >= (da.mt || 0) ? db : da); });
    o.plans[id] = { name: nw.name, mt: nw.mt, deleted: nw.deleted, days };
  });
  return normCP(o);
}
const cleanReps = v => String(v || "").replace(/[^0-9A-Za-z–\-+ /]/g, "").slice(0, 12).trim();
const cleanName = v => String(v || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60);
const muLabel = k => (MUSCLES.find(m => m[0] === k) || [k, k])[1];
const eqLabel = k => (EQUIP.find(m => m[0] === k) || [k, k])[1];
const mkEx = o => Object.assign({ mu2: [], cue: "", load: "Load for target RIR", wu: 0, ss: false, prog: "dbl", inc: 0 }, o);
function libToEx(e) { return mkEx({ uid: `${e.slot}:${e.id}`, id: e.id, slot: e.slot, name: e.n, mu: e.mu, mu2: e.mu2 || [], bw: !!e.bw, sets: e.c ? 3 : 2, reps: `${e.rr[0]}–${e.rr[1]}${e.unit || ""}`, rest: e.rest, cue: e.cue || "", load: loadText(e, S.prof) }); }
function seedFromAuto() {
  const p = PLN(), t = NOW(), a = buildWeek(S.prof, Object.assign({}, S, { cplan: { mode: "auto" }, blockStart: weekMon() }), weekMon(), TODAY), days = {};
  for (let d = 0; d < 7; d++) days[d] = { name: "", ex: [], mt: t };
  a.sessions.forEach(s => { days[s.dow] = { name: s.name, mt: t, ex: s.ex.map(x => { const lib = EX.find(e => e.slot === x.slot && e.id === x.id); return mkEx({ uid: x.uid, id: x.id, slot: x.slot, name: x.name, mu: x.mu, mu2: x.mu2 || [], bw: !!x.bw, sets: x.sets, reps: (x.bmReps && lib) ? `${lib.rr[0]}–${lib.rr[1]}` : x.reps, rest: x.rest, cue: x.cue, load: x.load }); }) }; });
  p.days = days; p.mt = t; CP().mt = t;
}
function trCommit(structural) { save(); regen(); if (structural) renderAll(true); else { renderPlan(); renderOverview(); renderOverall(); } }
function trResults() {
  const has = k => S.prof.eq.includes(k), q = TR.q.trim().toLowerCase();
  const list = EX.map((e, i) => [e, i]).filter(([e]) => (TR.mu === "all" || e.mu === TR.mu || (e.mu2 || []).includes(TR.mu)) && (!q || e.n.toLowerCase().includes(q)));
  if (!list.length) return '<div class="d">No match. Add a custom exercise below.</div>';
  return list.slice(0, 50).map(([e, i]) => { const miss = e.eq.filter(k => !has(k)); return `<button type="button" class="trpick" data-tr="add" data-v="${i}"><b>${esc(e.n)}</b><small>${esc(muLabel(e.mu))}${miss.length ? ` · needs ${esc(miss.map(eqLabel).join(", "))}` : ""}</small></button>`; }).join("") + (list.length > 50 ? `<div class="d">Showing 50 of ${list.length}. Search or filter to narrow.</div>` : "");
}
function trPicker(d) {
  return `<div class="trpicker"><input id="trQ" type="search" placeholder="Search ${EX.length} exercises (e.g. hack squat, bayesian, row)" value="${esc(TR.q)}" autocomplete="off"/><div class="chips" style="margin:8px 0">${[["all", "All"]].concat(MUSCLES).map(([k, l]) => `<button type="button" class="fchip ${TR.mu === k ? "s1" : ""}" data-tr="mu" data-v="${k}">${esc(l)}</button>`).join("")}</div><div class="trres" id="trRes">${trResults()}</div><h3>Custom exercise</h3><div class="trcust"><input id="trCn" placeholder="Exercise name" maxlength="60"/><select id="trCm">${MUSCLES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select><button type="button" class="btn pri" data-tr="addc" data-v="${d}">Add</button></div><button type="button" class="btn" data-tr="close" style="margin-top:8px">Done</button></div>`;
}
function trExRow(d, i, x, n, gi) {
  const tags = [x.wu ? x.wu + " warm-up" : "", x.prog === "reps" ? "reps-only" : "", x.inc > 0 ? "+" + x.inc + " " + wU() : ""].filter(Boolean);
  return `${gi && gi.k === 1 ? `<div class="trssh">Superset ${gi.g}: ${gi.n} exercises back to back, rest after ${gi.g}${gi.n}</div>` : ""}<div class="trex ${gi ? "ssin" : ""} ${gi && gi.k < gi.n ? "ssnext" : ""} ${gi && gi.k > 1 ? "ssprev" : ""}" data-d="${d}" data-i="${i}"><div class="trh"><span class="trdrag" title="Drag to reorder" aria-label="Drag to reorder">⠿</span><span class="${gi ? "ssl" : "trnum"}">${gi ? gi.g + gi.k : i + 1}</span><div><b>${esc(x.name)}</b><small>${esc(muLabel(x.mu))}</small></div><div class="trbtn"><button type="button" class="rest" data-tr="up" data-v="${d}|${i}" aria-label="Move up" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" class="rest" data-tr="down" data-v="${d}|${i}" aria-label="Move down" ${i === n - 1 ? "disabled" : ""}>▼</button><button type="button" class="rest" data-tr="del" data-v="${d}|${i}" aria-label="Remove">✕</button></div></div><div class="trf"><label>Sets<input type="number" inputmode="numeric" min="1" max="10" data-trf="sets" data-d="${d}" data-i="${i}" value="${esc(x.sets)}"/></label><label>Reps<input type="text" data-trf="reps" data-d="${d}" data-i="${i}" value="${esc(x.reps)}" maxlength="12"/></label><label>Rest (s)<input type="number" inputmode="numeric" min="0" max="600" step="15" data-trf="rest" data-d="${d}" data-i="${i}" value="${esc(x.rest)}"/></label></div>${i < n - 1 ? `<label class="trss"><input type="checkbox" data-trf="ss" data-d="${d}" data-i="${i}" ${x.ss ? "checked" : ""}/> Superset with next${x.ss && gi ? ` <span class="badge a">${gi.g}${gi.k} → ${gi.g}${gi.k + 1}</span>` : ""}</label>` : ""}<details class="trmore" ${tags.length ? "open" : ""}><summary>Warm-up &amp; progression${tags.length ? ` <span class="badge">${esc(tags.join(" · "))}</span>` : ""}</summary><div class="trf2"><label>Warm-up sets<select data-trf="wu" data-d="${d}" data-i="${i}">${[0, 1, 2, 3, 4].map(k => `<option value="${k}" ${+x.wu === k ? "selected" : ""}>${k ? k + " ramp-up" : "None"}</option>`).join("")}</select></label><label>Progression<select data-trf="prog" data-d="${d}" data-i="${i}"><option value="dbl" ${x.prog !== "reps" ? "selected" : ""}>Add load at top</option><option value="reps" ${x.prog === "reps" ? "selected" : ""}>Add reps only</option></select></label><label>Load step (${wU()})<input type="number" inputmode="decimal" step="0.5" min="0" max="100" data-trf="inc" data-d="${d}" data-i="${i}" value="${x.inc > 0 ? esc(x.inc) : ""}" placeholder="auto"/></label><label style="grid-column:1/-1">Demo video URL (optional)<input type="url" data-trf="demo" data-d="${d}" data-i="${i}" value="${esc(x.demo || "")}" placeholder="https://youtube.com/…" maxlength="300"/></label></div></details></div>`;
}
function trDayCard(d) {
  const day = PD()[d], ex = (day && day.ex) || [];
  return `<div class="card trday"><h2><span>${DAYN[d]}</span><span style="display:flex;gap:8px;align-items:center">${ex.length ? `<select class="trcopy" data-trf="copyto" data-d="${d}" aria-label="Copy ${DAYN[d]}"><option value="">Copy to…</option>${DAYN.map((n, k) => k !== d ? `<option value="${k}">${n}</option>` : "").join("")}</select>` : ""}<span class="badge ${ex.length ? "g" : ""}">${ex.length ? ex.length + " exercises" : "Rest day"}</span></span></h2>${ex.length || TR.open === d ? `<input class="trname" data-trf="name" data-d="${d}" placeholder="Session name (e.g. Push, Legs)" maxlength="40" value="${esc((day && day.name) || "")}"/>` : ""}<div class="trlist" data-d="${d}">${(() => { const G = ssGroups(ex); return ex.map((x, i) => trExRow(d, i, x, ex.length, G[i])).join(""); })()}</div>${TR.open === d ? trPicker(d) : `<button type="button" class="btn ${ex.length ? "" : "pri"}" data-tr="open" data-v="${d}">+ Add exercise</button>${ex.length ? `<button type="button" class="btn danger" data-tr="clearday" data-v="${d}" style="margin-left:8px">Clear day</button>` : ""}`}</div>`;
}
function renderTrain() {
  const el = $("pane-train"); if (!el) return;
  const c = CP(), custom = c.mode === "custom", live = Object.entries(c.plans).filter(([, p]) => !p.deleted);
  let body = `<div class="card"><h2><span>Training plan</span><span class="badge ${custom ? "g" : ""}">${custom ? esc(PLN().name) : "Auto plan"}</span></h2>
   <div class="seg"><button class="${custom ? "" : "on"}" data-tr="mode" data-v="auto">${ico("sliders", 16)} Auto-built</button><button class="${custom ? "on" : ""}" data-tr="mode" data-v="custom">${ico("edit", 16)} Build my own</button></div>
   <div class="d" style="margin-top:8px">${custom ? `Custom split (${EX.length} exercises in library). Meals, readiness and PR tracking continue automatically.` : "Built from your profile (days, equipment, level, injuries) with 4-week rotation."}</div>
   ${custom ? `<div class="trplans"><label>Saved plan<select data-trf="plan">${live.map(([id, p]) => `<option value="${esc(id)}" ${id === c.active ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><button class="btn" data-tr="newplan">+ New plan</button><button class="btn" data-tr="renameplan">Rename</button><button class="btn danger" data-tr="delplan" ${live.length < 2 ? "disabled" : ""}>Delete</button></div><label class="trchk"><input type="checkbox" data-trf="deload" ${c.deload !== false ? "checked" : ""}/> Cut sets ~40% in week 4 (deload)</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-tr="seed">${ico("refresh", 14)} Reset to auto plan</button><button class="btn danger" data-tr="clearall">Clear plan</button></div>` : ""}</div>`;
  if (custom) {
    body += `<div class="trgrid">${[0, 1, 2, 3, 4, 5, 6].map(trDayCard).join("")}</div>`;
    if (!Object.values(PD()).filter(x => x && x.ex && x.ex.length).length) body += callout("warn", "alert", "This plan is empty", "", "Today is still showing the auto plan. Add an exercise to a day or reset to the auto plan.");
  } else if (W) {
    body += `<div class="trgrid">${W.sessions.map(s => `<div class="card"><h2><span>${DAYN[s.dow]}: ${esc(s.name)}</span><span class="badge">${s.ex.length} exercises</span></h2>${s.ex.map(x => `<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(x.name)}</div><div class="d">${x.sets} × ${esc(x.reps)} · rest ${x.rest}s</div></div></div>`).join("")}</div>`).join("")}</div>`;
  }
  const keep = document.activeElement && document.activeElement.id;
  el.innerHTML = body;
  if (keep === "trQ") { const q = $("trQ"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}

/* ---------- Biometrics, Adaptive TDEE & Progress ---------- */
const BIO = { range: +lsGet("eliteBioRange") || 30, metric: lsGet("eliteBioMetric") || "weight" };
const BM = {
  weight: { l: "Weight", u: () => wU(), f: v => dW(v), dec: 1, roll: 7, good: 0 },
  bf: { l: "Body fat", u: () => "%", f: v => r1(v), dec: 1, roll: 7, good: -1 },
  sleep: { l: "Sleep", u: () => "h", f: v => r1(v), dec: 1, roll: 7, good: 1 },
  hrv: { l: "HRV", u: () => "ms", f: v => Math.round(v), dec: 0, roll: 7, good: 1 },
  rhr: { l: "Resting HR", u: () => "bpm", f: v => Math.round(v), dec: 0, roll: 7, good: -1 },
  steps: { l: "Steps", u: () => "", f: v => Math.round(v), dec: 0, roll: 7, good: 1, bar: 1 },
  akcal: { l: "Active energy", u: () => "kcal", f: v => Math.round(v), dec: 0, roll: 7, good: 1, bar: 1 },
  kcal: { l: "Calories eaten", u: () => "kcal", f: v => Math.round(v), dec: 0, roll: 7, good: 0, bar: 1 },
  vol: { l: "Training volume", u: () => wU(), f: v => Math.round(dW(v)), dec: 0, roll: 0, good: 1, bar: 1 }
};
function bioSeries(k, n, end) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = addD(end || TODAY, -i), v = dayModel(d)[k]; out.push({ d, v: v != null && isFinite(v) ? v : null }); } return out; }
function rolling(s, win) { return s.map((p, i) => { const w = s.slice(Math.max(0, i - win + 1), i + 1).filter(x => x.v != null); return w.length ? { d: p.d, v: avgOf(w.map(x => x.v)), est: p.v == null } : { d: p.d, v: null }; }); }
function bioStat(k, n) { const cur = bioSeries(k, n).filter(p => p.v != null), prev = bioSeries(k, n, addD(TODAY, -n)).filter(p => p.v != null), a = avgOf(cur.map(p => p.v)), b = avgOf(prev.map(p => p.v)); return { n: cur.length, avg: a, last: cur[cur.length - 1] || null, delta: a != null && b != null ? a - b : null }; }
function bioChart(k, n) {
  const M = BM[k], s = bioSeries(k, n), pts = s.filter(p => p.v != null);
  if (!pts.length) return `<div class="empty"><div class="empty-i">${ico("activity", 20)}</div><b>No ${M.l.toLowerCase()} data in the last ${n} days</b><p>${k === "weight" ? "Log a morning weight in the Daily log below." : k === "kcal" ? "Tick meals or log food on Today." : k === "vol" ? "Finish a session in workout mode." : "Connect Apple Health below."}</p></div>`;
  const roll = M.roll && pts.length >= 3 ? rolling(s, M.roll) : [];
  return buildInteractiveChart({
    svgClass: "biochart", bar: !!M.bar, label2: M.roll && pts.length >= 3 ? `${M.roll}d avg` : "",
    aria: `${M.l}, last ${n} days`,
    series: s.map((p, i) => ({ label: dateLabel(p.d, { month: "short", day: "numeric" }), v: p.v != null ? M.f(p.v) : null, v2: roll[i] && roll[i].v != null ? M.f(roll[i].v) : null })),
    fmt: v => `${(M.dec ? r1(v) : Math.round(v)).toLocaleString()}${M.u() ? " " + M.u() : ""}`,
    fmtAxis: v => (M.dec ? r1(v) : Math.round(v)).toLocaleString(),
    startLabel: dateLabel(s[0].d, { month: "short", day: "numeric" }), endLabel: "today"
  }) + `<div class="d">${M.bar ? "Bars" : "Dots"} are measured days (${pts.length}/${n}).${M.roll && pts.length >= 3 ? ` Solid line is the ${M.roll}-day rolling average.` : ""} Drag or hover to inspect.</div>`;
}
function pearson(xs, ys) { const n = xs.length; if (n < 3) return null; const mx = avgOf(xs), my = avgOf(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; a += dx * dy; b += dx * dx; c += dy * dy; } const den = Math.sqrt(b * c); return den > 0 ? a / den : null; }
const CORR = [["sleep", "vol", 0, "Sleep → training volume", "sleep", "lifted"], ["hrv", "vol", 0, "HRV → training volume", "HRV", "lifted"], ["sleep", "energy", 0, "Sleep → energy rating", "sleep", "rated energy"], ["kcal", "vol", 1, "Calories yesterday → training volume", "calories yesterday", "lifted"], ["steps", "sleep", 0, "Steps → sleep that night", "steps", "slept"], ["protein", "energy", 1, "Protein yesterday → energy rating", "protein yesterday", "rated energy"]];
function bioCorr(n) {
  const days = []; for (let i = n - 1; i >= 0; i--) days.push(dayModel(addD(TODAY, -i)));
  const by = Object.fromEntries(days.map(d => [d.date, d]));
  return CORR.map(([a, b, lag, label, an, bn]) => {
    const xs = [], ys = [];
    days.forEach(d => { const src = lag ? by[addD(d.date, -lag)] : d; const x = src ? src[a] : null, y = a === "steps" && b === "sleep" ? (by[addD(d.date, 1)] || {}).sleep : d[b]; if (x != null && y != null) { xs.push(x); ys.push(y); } });
    const r = xs.length >= 5 ? pearson(xs, ys) : null; let txt = "";
    if (r != null) { const med = xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)], hiY = ys.filter((y, i) => xs[i] > med), loY = ys.filter((y, i) => xs[i] <= med); if (hiY.length >= 2 && loY.length >= 2) { const dv = (avgOf(hiY) / avgOf(loY) - 1) * 100; txt = `On higher-${an} days you ${bn} ${Math.abs(dv) < 1 ? "about the same" : Math.abs(Math.round(dv)) + "% " + (dv > 0 ? "more" : "less")}.`; } }
    return { label, n: xs.length, r, txt };
  });
}
function bioCSV() {
  const all = new Set([...Object.keys(S.log), ...Object.keys(S.hd || {}), ...Object.keys(S.steps), ...Object.keys(S.nut || {}), ...Object.keys(S.wlog || {}), ...Object.keys(S.done)]);
  const dates = [...all].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const cols = ["date", "weight_kg", "body_fat_pct", "sleep_h", "hrv_ms", "resting_hr", "steps", "active_kcal", "kcal_eaten", "protein_g", "kcal_target", "water_ml", "energy_1_5", "soreness_1_5", "readiness_0_100", "readiness_estimated", "adherence_pct", "training_volume_kg", "sets", "cardio_min"];
  const rows = dates.map(d => { const m = dayModel(d), rd = readiness(d); return [d, m.weight != null ? r1(m.weight) : "", m.bf ?? "", m.sleep ?? "", m.hrv ?? "", m.rhr ?? "", m.steps ?? "", m.akcal ?? "", m.kcal ?? "", m.protein ?? "", m.kcalT ?? "", m.water ?? "", m.energy ?? "", m.sore ?? "", rd ? rd.pct : "", rd ? (rd.est ? 1 : 0) : "", m.adh ?? "", m.vol ?? "", m.sets ?? "", m.cardio ?? ""].join(","); });
  return cols.join(",") + "\n" + rows.join("\n") + "\n";
}
function dlFile(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

function renderBio() {
  const el = $("bioBox"); if (!el) return;
  const n = BIO.range, keys = ["weight", "bf", "sleep", "hrv", "rhr", "steps", "akcal", "kcal", "vol"];
  if (!BM[BIO.metric]) BIO.metric = "weight";
  const tiles = keys.map(k => {
    const M = BM[k], st = bioStat(k, n), s = bioSeries(k, Math.min(n, 30)).filter(p => p.v != null).map(p => M.f(p.v));
    const dv = st.delta, ad = dv == null ? 0 : (k === "weight" || k === "vol" ? dW(Math.abs(dv)) : Math.abs(dv)), dir = dv == null || ad < (M.dec ? 0.05 : 0.5) ? "" : dv > 0 ? "▲" : "▼", tone = !dir || !M.good ? "" : (dv > 0) === (M.good > 0) ? "up" : "dn";
    return `<button type="button" class="btile ${BIO.metric === k ? "on" : ""}" data-biom="${k}" aria-pressed="${BIO.metric === k}"><span class="l">${M.l}</span><b>${st.last ? M.f(st.last.v).toLocaleString() : "–"}<small> ${st.last ? M.u() : ""}</small></b><span class="s">${st.n ? `avg ${M.f(st.avg).toLocaleString()} · ${st.n}/${n} d` : "no data"}</span><span class="dlt ${tone}">${dir ? `${dir} ${(M.dec ? r1(ad) : Math.round(ad)).toLocaleString()} vs prior ${n}d` : "&nbsp;"}</span>${s.length >= 2 ? sparkline(s, 70, 20) : ""}</button>`;
  }).join("");
  const corr = bioCorr(n), have = corr.filter(c => c.r != null), tele = [];
  for (let i = 0; i < Math.min(n, 30); i++) tele.push(dayModel(addD(TODAY, -i)));
  const cell = (v, f) => v != null ? f(v) : '<span class="na">–</span>';
  el.innerHTML = `<div class="pgsec"><span>${ico("activity", 16)}</span> Biometrics &amp; trends</div>
   <div class="card bio"><h2><span>Telemetry</span><span class="seg bioseg" role="group" aria-label="Range">${[7, 30, 90].map(x => `<button type="button" class="${x === n ? "on" : ""}" data-bior="${x}" aria-pressed="${x === n}">${x} d</button>`).join("")}</span></h2>
    <div class="btiles">${tiles}</div>
    <h3>${BM[BIO.metric].l}${BM[BIO.metric].u() ? " · " + BM[BIO.metric].u() : ""} · last ${n} days</h3>${bioChart(BIO.metric, n)}
   </div>
   <div class="grid2">
    <div class="card"><h2><span>What drives what</span><span class="badge">${n} d</span></h2>
     ${have.length ? have.map(c => `<div class="crow"><div class="crow-h"><b>${esc(c.label)}</b><span class="badge ${Math.abs(c.r) >= 0.5 ? "g" : ""}">${Math.abs(c.r) < 0.2 ? "no clear link" : Math.abs(c.r) < 0.5 ? "weak link" : "strong link"}</span></div>${c.txt ? `<div class="d">${esc(c.txt)}</div>` : ""}<div class="d pro-only">r = ${c.r.toFixed(2)} · ${c.n} paired days</div></div>`).join("")
       : callout("info", "link", "Not enough paired days yet", "", "Needs 5 days with both metrics. Log sleep/Health, tick meals, and finish workouts.")}
     ${have.length && have.length < corr.length ? `<div class="d" style="margin-top:8px">Waiting for data: ${esc(corr.filter(c => c.r == null).map(c => `${c.label} (${c.n}/5)`).join(" · "))}</div>` : ""}</div>
    <div class="card"><h2><span>Export &amp; backup</span></h2><div class="d">Everything you log is yours. Export daily telemetry to CSV or full JSON backup.</div>
     <div class="hurlbtns" style="margin-top:10px"><button class="btn pri" data-bio="csv">Export CSV</button><button class="btn" data-bio="json">Export JSON</button><button class="btn" data-bio="imp">Import</button></div></div>
   </div>
   <div class="card pro-only"><h2><span>Daily table</span><span class="badge">last ${tele.length} days</span></h2><div class="tblw"><table class="tele"><thead><tr><th>Date</th><th>Weight</th><th>BF %</th><th>Sleep</th><th>HRV</th><th>RHR</th><th>Steps</th><th>Active</th><th>Eaten</th><th>Protein</th><th>Ready</th><th>Volume</th></tr></thead><tbody>
    ${tele.map(m => { const rd = readiness(m.date); return `<tr><td>${esc(dateLabel(m.date, { month: "short", day: "numeric" }))}</td><td>${cell(m.weight, dW)}</td><td>${cell(m.bf, r1)}</td><td>${cell(m.sleep, r1)}</td><td>${cell(m.hrv, Math.round)}</td><td>${cell(m.rhr, Math.round)}</td><td>${cell(m.steps, v => v.toLocaleString())}</td><td>${cell(m.akcal, Math.round)}</td><td>${cell(m.kcal, v => v.toLocaleString())}</td><td>${cell(m.protein, Math.round)}</td><td>${rd ? (rd.est ? `<i title="Estimate">~${rd.pct}</i>` : rd.pct) : '<span class="na">–</span>'}</td><td>${cell(m.vol, v => Math.round(dW(v)).toLocaleString())}</td></tr>`; }).join("")}
   </tbody></table></div></div>`;
}

let logDate = TODAY;
function renderCheckin() {
  const last7 = []; for (let i = 0; i < 7; i++) last7.push(addD(TODAY, -i));
  const av = k => { const v = last7.map(d => parseFloat((S.log[d] || {})[k])).filter(x => x > 0); return v.length ? r1(avgOf(v)) : "–"; };
  let n = 0, t = 0; W.days.forEach(d => { const p = dayProg(d); n += p.n; t += p.t; });
  $("checkin").innerHTML = `<div class="kpis"><div class="kpi"><div class="l">Adherence (this wk)</div><div class="v">${t ? Math.round(n / t * 100) : 0}%</div></div><div class="kpi"><div class="l">Avg sleep (7d)</div><div class="v">${av("s")} h</div></div><div class="kpi"><div class="l">Avg energy (7d)</div><div class="v">${av("e")} / 5</div></div></div>`;
  renderCoachCheckin();
}
function renderTrend() {
  const tr = weightTrend(S.log, TODAY), adv = advice(S.prof, tr), atdee = adaptiveTDEE(S.log, S.nut, S.prof, TODAY);
  if ($("tdeeBadge")) $("tdeeBadge").textContent = atdee ? `Observed ${atdee.tdee.toLocaleString()} kcal` : "EWMA";
  let h = "";
  if (tr) {
    h += `<div class="kpis"><div class="kpi"><div class="l">EWMA Trend Rate</div><div class="v">${tr.perWeek > 0 ? "+" : ""}${r1(metric() ? tr.perWeek : tr.perWeek * LB)} ${wU()}/wk</div><div class="s">${tr.pct.toFixed(2)}%/wk · trend ${dW(tr.trendNow)} ${wU()} (${tr.n} weigh-ins)</div></div>${atdee ? `<div class="kpi"><div class="l">Observed TDEE</div><div class="v">${atdee.tdee.toLocaleString()}</div><div class="s">${atdee.diff >= 0 ? "+" : ""}${atdee.diff} vs formula · ${atdee.days}d intake</div></div>` : ""}</div>`;
    if (W && W.T.coach) {
      h += callout("coach", "target", "Calories are set by " + esc(W.T.coach.name), "Coach", "Your weight trend is shared with your coach, who adjusts your targets.");
    } else {
      h += callout(adv.delta ? "warn" : "good", adv.delta ? "sliders" : "check", adv.delta ? `Adjust calories: ${adv.delta > 0 ? "+" : ""}${adv.delta} kcal/day` : "On track", "Auto-adjust", `${esc(adv.msg)}${adv.delta || S.prof.kcalAdj ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${adv.delta ? `<button class="btn pri" id="btnApply" data-delta="${adv.delta}">Apply ${adv.delta > 0 ? "+" : ""}${adv.delta} kcal</button><button class="btn" id="btnUseWt">Set bodyweight to ${dW(tr.trendNow)} ${wU()}</button>` : ""}${S.prof.kcalAdj ? `<button class="btn" id="btnClearAdj">Clear adj (${S.prof.kcalAdj > 0 ? "+" : ""}${S.prof.kcalAdj})</button>` : ""}</div>` : ""}`);
    }
  } else {
    h = W && W.T.coach
      ? callout("coach", "target", "Calories are set by " + esc(W.T.coach.name), "Coach", "Your weight trend is shared with your coach.")
      : callout("info", "scale", "Unlock EWMA trend & adaptive TDEE", "", "Log at least 4 morning weigh-ins across 7+ days. With 7+ days of intake, Elite OS calculates your true observed TDEE.");
  }
  $("trend").innerHTML = h;
  const ew = ewmaSeries(S.log, TODAY, 28), valid = ew.filter(p => p.scale != null);
  $("logWt").innerHTML = valid.length >= 2
    ? buildInteractiveChart({
      svgClass: "biochart", label2: "EWMA trend", aria: "Scale vs EWMA trend weight, 28 days",
      series: ew.map(p => ({ label: dateLabel(p.d, { month: "short", day: "numeric" }), v: p.scale != null ? dW(p.scale) : null, v2: p.trend != null ? dW(p.trend) : null })),
      fmt: v => `${r1(v)} ${wU()}`, fmtAxis: v => String(r1(v)),
      startLabel: dateLabel(ew[0].d, { month: "short", day: "numeric" }), endLabel: "today"
    })
    : '<div class="d" style="margin-top:8px">Log 2+ weigh-ins to view Scale vs EWMA trend chart.</div>';
}
const MEAS = [["wa", "Waist"], ["ch", "Chest"], ["ar", "Arm"], ["th", "Thigh"]];
function renderMeasure() {
  const box = $("measBox"); if (!box) return;
  const dates = Object.keys(S.log).sort();
  const rows = MEAS.map(([k, n]) => {
    const pts = dates.filter(d => S.log[d][k] > 0).map(d => ({ d, v: S.log[d][k] }));
    if (!pts.length) return `<div class="irow"><span>${n}</span><span class="ims">no data</span></div>`;
    const first = pts[0], last = pts[pts.length - 1], ch = last.v - first.v;
    return `<div class="irow"><span>${n}</span><span class="ims">${dL(last.v)} ${lU()}${pts.length > 1 ? ` · ${ch > 0 ? "+" : ""}${r1(metric() ? ch : ch / IN)} since ${dateLabel(first.d, { month: "short", day: "numeric" })}` : ""}</span></div>`;
  }).join("");
  box.innerHTML = `<div class="card"><h2><span>Measurements</span><span class="badge">Latest &amp; change</span></h2><div class="itab">${rows}</div></div>`;
}
function heatmap() {
  const start = addD(mondayOf(TODAY), -77); let cells = "";
  for (let w = 0; w < 12; w++) for (let i = 0; i < 7; i++) {
    const d = addD(start, w * 7 + i), p = pctOf(d), fut = d > TODAY;
    const c = fut ? "transparent" : p >= 70 ? "var(--green)" : p >= 40 ? "var(--amber)" : p > 0 ? "var(--border-strong)" : "var(--panel2)";
    cells += `<i title="${d}: ${p}%" style="background:${c}"></i>`;
  }
  return `<div class="heat">${cells}</div><div class="d" style="margin-top:6px">Last 12 weeks. Green = 70%+ daily adherence.</div>`;
}
function weekReport() {
  const days = []; for (let i = 6; i >= 0; i--) days.push(addD(TODAY, -i));
  const adh = Math.round(days.reduce((a, d) => a + pctOf(d), 0) / 7);
  const sessions = days.filter(d => Object.keys(S.checks).filter(k => S.checks[k] && k.startsWith(d + "|ex|")).length >= 3).length;
  const avg = k => { const v = days.map(d => parseFloat((S.log[d] || {})[k])).filter(x => x > 0); return v.length ? r1(avgOf(v)) : null; };
  const prs = prList().filter(p => p.d >= days[0] && p.d <= TODAY), tr = weightTrend(S.log, TODAY), adv = advice(S.prof, tr), sl = avg("s"), en = avg("e");
  const lines = [`Adherence ${adh}%`, `Sessions completed ${sessions}`, `PRs ${prs.length}${prs.length ? ": " + [...new Set(prs.map(p => p.n))].join(", ") : ""}`, `Avg sleep ${sl === null ? "–" : sl} h, energy ${en === null ? "–" : en}/5`, tr ? `Weight trend ${tr.perWeek > 0 ? "+" : ""}${r1(metric() ? tr.perWeek : tr.perWeek * LB)} ${wU()}/wk` : "Weight trend: log 4+ weigh-ins"];
  const focus = [];
  if (adh < 60) focus.push("Adherence is the bottleneck. Fix the two habits missed most.");
  if (adv && adv.delta) focus.push(adv.msg);
  if (sl !== null && sl < 6.5) focus.push("Sleep is under 6.5 h on average. Protect it first.");
  if (!prs.length && sessions >= 3) focus.push("No PRs this week. Check top-set logging and fueling.");
  if (!focus.length) focus.push("Keep going. Repeat the plan and beat last week's sets.");
  return { lines, focus };
}
function renderProgExtra() {
  const box = $("progExtra"); if (!box) return;
  const r = weekReport(), h = histList(), pr = prList();
  box.innerHTML = `<div class="grid2"><div class="card"><h2><span>Consistency</span><span class="badge g">${streak()}-day streak</span></h2>${heatmap()}</div>
  <div class="card"><h2><span>Last 7 days</span><button class="btn" id="btnCopyRep">Copy report</button></h2>${r.lines.map(l => `<div class="d" style="color:var(--text)">${esc(l)}</div>`).join("")}<h3>Next week</h3>${r.focus.map(f => `<div class="d">${esc(f)}</div>`).join("")}</div></div>
  <div class="card"><h2><span>Strength history</span><span class="badge">${pr.length} PRs</span></h2>${h.length ? h.slice(0, 12).map(x => `<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(x.n)}</div><div class="d">Best ${x.best.w > 0 || isBwEx(x.last.u) ? "est. 1RM " + dW(x.bv) + " " + wU() : x.bv + " reps"} · last ${x.last.w > 0 ? dW(x.last.w) + " " + wU() + " × " : ""}${x.last.r} on ${dateLabel(x.last.d, { month: "short", day: "numeric" })} · ${x.count} logged</div></div></div>`).join("") : '<div class="d">Log sets in Workout mode or on Today to build strength history.</div>'}</div>`;
}

/* ---------- Progress Photos (IndexedDB) ---------- */
const PH = { pose: "front", urls: [], cmp: false, msg: "" };
const phDB = () => new Promise((res, rej) => { const r = indexedDB.open("eliteos-photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("p", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function phTx(mode, fn) {
  const db = await phDB();
  return new Promise((res, rej) => { const t = db.transaction("p", mode), q = fn(t.objectStore("p")); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = () => { db.close(); rej(t.error); }; });
}
async function phShrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("encode failed")), "image/jpeg", 0.82));
}
async function phAdd(file, pose, date) {
  const blob = await phShrink(file);
  await phTx("readwrite", st => st.put({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date: date || TODAY, pose, blob }));
}
async function renderPhotos() {
  const b = $("photoBox"); if (!b) return;
  let all;
  try { all = await phTx("readonly", st => st.getAll()); } catch (e) { b.innerHTML = '<div class="d">Photos unavailable in this browser mode: ' + esc(e.message) + "</div>"; return; }
  PH.urls.forEach(u => URL.revokeObjectURL(u)); PH.urls = [];
  const mine = all.filter(p => p.pose === PH.pose).sort((a, c) => a.date < c.date ? 1 : a.date > c.date ? -1 : 0);
  const url = p => { const u = URL.createObjectURL(p.blob); PH.urls.push(u); return u; };
  const first = mine[mine.length - 1], last = mine[0];
  const shareBox = SY.sess && myCoaches().length
    ? (sharingPhotos() ? callout("coach", "users", "Shared with your coach", "On", `Your coach can view these photos. <button class="btn" id="phShareOff" style="margin-left:6px">Stop sharing</button>`)
      : callout("info", "lock", "Private to this device", "", `Want physique feedback? <button class="btn pri" id="phShareOn" style="margin-left:6px">Share with my coach</button>`))
    : "";
  b.innerHTML = `${shareBox}<div class="d">Saved locally on this device${SY.sess && sharingPhotos() ? " (plus encrypted private copies shared with your coach)" : ""}.</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"><select id="phPose">${["front", "side", "back"].map(x => `<option value="${x}"${PH.pose === x ? " selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}</select><button class="btn pri" id="phAdd">Add photo</button>${mine.length > 1 ? `<button class="btn" id="phCmp">${PH.cmp ? "Hide comparison" : "Compare first & latest"}</button>` : ""}</div>
  ${PH.msg ? `<div class="d" style="margin-top:8px">${esc(PH.msg)}</div>` : ""}
  ${PH.cmp && mine.length > 1 ? `<div class="fgrid" style="margin-top:10px">${[first, last].map((p, i) => `<figure style="margin:0"><img src="${url(p)}" alt="${esc(p.pose)} ${esc(p.date)}" style="width:100%;border-radius:10px"/><figcaption class="d">${i ? "Latest" : "First"} · ${esc(p.date)}</figcaption></figure>`).join("")}</div>` : ""}
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:10px">${mine.map(p => `<figure style="margin:0"><img src="${url(p)}" alt="${esc(p.pose)} ${esc(p.date)}" loading="lazy" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px"/><figcaption class="d">${esc(p.date)} <button class="rest" data-phdel="${esc(p.id)}">Delete</button></figcaption></figure>`).join("") || '<div class="d">No photos for this pose yet.</div>'}</div>`;
}

function renderProgress() {
  const l = S.log[logDate] || {};
  $("logDate").value = logDate;
  $("lw").value = l.w ? dW(l.w) : ""; $("lwa").value = l.wa ? dL(l.wa) : ""; $("ls").value = l.s ?? ""; $("le").value = l.e ?? ""; $("ln").value = l.n ?? "";
  $("lch").value = l.ch ? dL(l.ch) : ""; $("lar").value = l.ar ? dL(l.ar) : ""; $("lth").value = l.th ? dL(l.th) : "";
  $("lchL").textContent = `Chest (${lU()})`; $("larL").textContent = `Arm (${lU()})`; $("lthL").textContent = `Thigh (${lU()})`;
  $("lwl").textContent = `Morning weight (${wU()})`; $("lwal").textContent = `Waist at navel (${lU()})`;
  renderBio(); renderTrend(); renderCheckin(); renderMeasure(); renderWlog(); renderChart(); renderProgExtra(); renderHealthSync(); renderPhotos();
}

/* ---------- Profile (with Mode Card + Privacy & Data moved cleanly here) ---------- */
const OPT = {
  sex: [["m", "Male"], ["f", "Female"]],
  goal: [["cut", "Fat loss"], ["recomp", "Recomp / maintain"], ["bulk", "Lean muscle gain"], ["peak", "Event peak week"]],
  rate: [["cons", "Conservative"], ["std", "Standard"], ["agg", "Aggressive"]],
  act: [["low", "Low (desk job, mostly seated)"], ["mod", "Moderate (on feet some of the day)"], ["high", "High (active job / athlete)"]],
  exp: [["beg", "Beginner (under 1 yr)"], ["int", "Intermediate (1–3 yr)"], ["adv", "Advanced (3+ yr)"]],
  days: [[3, "3 days"], [4, "4 days"], [5, "5 days"], [6, "6 days"]],
  len: [[30, "30 min"], [45, "45 min"], [60, "60 min"], [75, "75 min"]],
  style: [["cal", "Calisthenics-first"], ["hyb", "Hybrid"], ["wt", "Weights-first"]],
  diet: [["omni", "Omnivore"], ["pesc", "Pescatarian"], ["veg", "Vegetarian"], ["vegan", "Vegan"]],
  meals: [[3, "3 meals"], [4, "4 meals"], [5, "5 meals"], [6, "6 meals"]],
  budget: [["std", "Standard (best quality)"], ["budget", "Budget (lowest cost)"]],
  mealRem: [["no", "Workouts only"], ["yes", "Workouts and meals"]],
  autoSS: [["off", "Off: straight sets"], ["acc", "Pair accessories (saves ~10 min)"]],
  units: [["imperial", "Imperial (lb, in)"], ["metric", "Metric (kg, cm)"]]
};
const NUMF = { age: [14, 90], cm: [120, 230], kg: [35, 200], bf: [0, 60], pullMax: [0, 60], pushMax: [0, 100], bagKg: [0, 60], priceF: [0.3, 5] };
const selHTML = (k, l) => `<div class="cg"><label>${l}</label><select data-p="${k}">${OPT[k].map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select></div>`;
const numHTML = (k, l, step) => `<div class="cg"><label id="lb_${k}">${l}</label><input type="number" data-p="${k}" step="${step || 1}"/></div>`;
const chkHTML = (name, list) => `<div class="chips" data-m="${name}">${list.map(([v, l]) => `<label class="chip"><input type="checkbox" value="${v}"/>${l}</label>`).join("")}</div>`;

function modeCardHTML() {
  const m = UX().mode;
  return `<div class="card" id="modeCard"><h2><span>Experience</span><span class="badge">${m === "guided" ? "Guided" : "Elite Pro"}</span></h2>
   <div class="modes"><button type="button" class="modeb ${m === "guided" ? "on" : ""}" data-mode="guided" aria-pressed="${m === "guided"}"><b>${ico("compass", 16)} Guided</b><span>Calm view: one next action at a time, essentials only.</span></button>
   <button type="button" class="modeb ${m === "pro" ? "on" : ""}" data-mode="pro" aria-pressed="${m === "pro"}"><b>${ico("bolt", 16)} Elite Pro</b><span>Full telemetry: readiness breakdowns, daily tables, micros, plate math.</span></button></div></div>`;
}
function buildProfile() {
  $("pane-profile").innerHTML = `${modeCardHTML()}
  <div id="confirmBar"></div>
  <div class="grid2">
   <div>
    <div class="card"><h2><span>Body</span><span class="badge">Live updates</span></h2>
     <div class="fgrid">${selHTML("units", "Units")}${selHTML("sex", "Sex (for BMR)")}${numHTML("age", "Age")}${numHTML("cm", "Height")}${numHTML("kg", "Bodyweight", 0.1)}${numHTML("bf", "Body fat % (0 = unknown)", 0.5)}${selHTML("act", "Daily activity")}</div></div>
    <div class="card"><h2><span>Goal</span></h2>
     <div class="fgrid">${selHTML("goal", "Primary goal")}${selHTML("rate", "Rate of change")}<div class="cg"><label>Event date (peak week)</label><input type="date" data-p="event"/></div></div>
     <h3>Priority muscles (max 2)</h3>${chkHTML("pri", [["chest", "Chest"], ["back", "Back / lats"], ["shoulders", "Shoulders"], ["arms", "Arms"], ["legs", "Legs"], ["abs", "Abs"]])}</div>
   </div>
   <div>
    <div class="card"><h2><span>Training</span></h2>
     <div class="fgrid">${selHTML("exp", "Experience")}${selHTML("days", "Days per week")}${selHTML("len", "Session length")}${selHTML("style", "Style")}${selHTML("autoSS", "Supersets (auto)")}${numHTML("pullMax", "Max pull-ups")}${numHTML("pushMax", "Max push-ups")}${numHTML("bagKg", "Weighted bag")}<div class="cg"><label>Usual workout time</label><input type="time" data-p="wtime"/></div>${selHTML("mealRem", "Calendar export")}</div>
     <h3>Equipment</h3>${chkHTML("eq", EQUIP)}<h3>Aches or injuries</h3>${chkHTML("inj", [["shoulder", "Shoulder"], ["elbow", "Elbow"], ["wrist", "Wrist"], ["back", "Lower back"], ["knee", "Knee"]])}</div>
    <div class="card"><h2><span>Nutrition</span></h2>
     <div class="fgrid">${selHTML("diet", "Diet")}${selHTML("meals", "Meals per day")}${selHTML("budget", "Food budget")}${numHTML("priceF", "Price factor (1 = US)", 0.1)}</div>
     <h3>Exclude</h3><div class="d" style="margin-bottom:6px">Lactose keeps whey isolate and swaps yogurt/cottage cheese to lactose-free.</div>${chkHTML("excl", [["dairy", "All dairy"], ["lactose", "Lactose (keeps whey)"], ["eggs", "Eggs"], ["fish", "Fish / shellfish"], ["gluten", "Gluten"], ["nuts", "Nuts / peanuts"], ["soy", "Soy"]])}</div>
   </div>
  </div>
  <div class="card"><h2><span>Sync phone ↔ desktop</span><span class="badge" id="syncMsg"></span></h2><div id="syncBox"></div></div>
  <div class="card"><h2><span>Coaching</span></h2><div id="coachProf"></div></div>
  <div class="card"><h2><span>Notifications</span></h2><div id="pushProf"></div></div>
  <div class="card"><h2><span>Data &amp; privacy</span></h2>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="btnExport">Export backup</button><button class="btn" id="btnImport">Import backup</button><button class="btn" onclick="window.print()">Print week</button><button class="btn danger" id="btnReset">Reset everything</button></div>
   <details class="rec" style="margin-top:12px"><summary>What is stored and where</summary><ol>
    <li><b>On this device:</b> profile, plans, logs, recipes, food entries and photos stay in this browser.</li>
    <li><b>Cloud sync (optional):</b> Supabase stores your account progress, Health sync metrics, push endpoint and opt-in coach photo copies under row-level security.</li>
    <li><b>Food search:</b> queries go to Open Food Facts. No ads, no analytics, no tracking scripts.</li>
    <li><b>Not medical advice:</b> plans are general estimates; consult a clinician for medical conditions.</li>
   </ol></details></div>`;
  fillProfile(); renderSync();
}
function fillProfile() {
  const p = S.prof;
  document.querySelectorAll("[data-p]").forEach(el => {
    const k = el.dataset.p; let v = p[k];
    if (k === "cm") v = dL(v); else if (k === "kg" || k === "bagKg") v = dW(v);
    el.value = v;
  });
  document.querySelectorAll("[data-m]").forEach(box => {
    const arr = p[box.dataset.m] || [];
    box.querySelectorAll("input").forEach(i => i.checked = arr.includes(i.value));
  });
  $("lb_cm").textContent = `Height (${lU()})`; $("lb_kg").textContent = `Bodyweight (${wU()})`; $("lb_bagKg").textContent = `Weighted bag (${wU()})`;
  $("confirmBar").innerHTML = S.confirmed
    ? callout("good", "check", "Profile saved", "", "Changes rebuild your training, meals and groceries instantly.")
    : callout("warn", "user", "Set up your profile first", "Step 1", `Running on defaults. Enter your stats and goal below, then <button class="btn pri" id="btnConfirm" style="margin-left:6px">Confirm profile</button>`);
}
function onField(el) {
  const k = el.dataset.p, p = S.prof;
  if (el.type === "number") {
    let v = parseFloat(el.value);
    if (isNaN(v)) { if (k === "bf") v = 0; else { el.classList.add("bad"); return; } }
    let st = v; if (k === "cm") st = fromL(v); else if (k === "kg" || k === "bagKg") st = fromW(v);
    const [lo, hi] = NUMF[k];
    if (st < lo - 1e-6 || st > hi + 1e-6) { el.classList.add("bad"); return; }
    el.classList.remove("bad"); p[k] = st;
  } else if (el.type === "date" || el.type === "time") p[k] = el.value;
  else { p[k] = isNaN(+el.value) ? el.value : +el.value; if (k === "units") fillProfile(); }
  S.weekOffset = 0; commit();
}
function onMulti(box, input) {
  const name = box.dataset.m; let arr = [...box.querySelectorAll("input:checked")].map(i => i.value);
  if (name === "pri" && arr.length > 2) { input.checked = false; arr = arr.filter(x => x !== input.value); }
  S.prof[name] = arr; commit();
}

/* ---------- Overall, Navigation, Mode, Theme, Calendar & System ---------- */
function renderOverall() {
  let n = 0, t = 0; W.days.forEach(d => { const p = dayProg(d); n += p.n; t += p.t; });
  const pct = t ? Math.round(n / t * 100) : 0;
  $("overallFill").style.width = pct + "%"; $("overallTxt").textContent = `${pct}% · ${n}/${t}`;
  $("sub").textContent = `${S.prof.goal === "cut" ? "Fat loss" : S.prof.goal === "bulk" ? "Lean gain" : S.prof.goal === "peak" ? "Peak week" : "Recomp"} · ${W.nTrain}d split${W.custom ? " (custom)" : ""} · ${S.prof.style === "cal" ? "calisthenics" : S.prof.style === "wt" ? "weights" : "hybrid"}${streak() ? ` · ${streak()}d streak` : ""}`;
}
function applyMode() {
  const m = UX().mode; document.documentElement.dataset.mode = m;
  const b = $("btnMode");
  if (b) { b.innerHTML = m === "guided" ? ico("compass", 16) + '<span class="hpl">Guided</span>' : ico("bolt", 16) + '<span class="hpl">Pro</span>'; b.title = b.ariaLabel = m === "guided" ? "Guided mode · tap for Elite Pro" : "Elite Pro mode · tap for Guided"; }
}
function setMode(m) { UX().mode = m === "guided" ? "guided" : "pro"; save(); applyMode(); renderAll(true); toast(m === "guided" ? "Guided mode: calm essentials" : "Elite Pro mode: full telemetry", "good"); }

function renderAll(skipProfile) {
  v4Norm();
  if (!skipProfile) buildProfile();
  else { const mc = $("modeCard"); if (mc) mc.outerHTML = modeCardHTML(); }
  renderOverview(); renderPlan(); renderGrocery(); renderProgress(); renderOverall(); renderKitchen(); renderTrain(); renderPill(); applyMode();
}

const TABK = "eliteTab";
let TAB = "plan", FOODSUB = "grocery", PSEG = "w";
const TAB_TITLES = { plan: "Today", train: "Train", food: "Fuel & Recipes", quality: "Food Quality", progress: "Biometrics", profile: "Profile & Settings", coach: "Clients" };
function showTab(n, sub) {
  if (n === "overview") { n = "food"; sub = "overview"; }
  if (sub) FOODSUB = sub;
  TAB = n; document.body.dataset.tab = n;
  const pane = n === "food" ? FOODSUB : n;
  document.querySelectorAll(".tab").forEach(x => { x.classList.toggle("active", x.dataset.tab === n); if (x.dataset.tab === n) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
  document.querySelectorAll(".pane").forEach(x => x.classList.toggle("active", x.id === "pane-" + pane));
  document.querySelectorAll("[data-food]").forEach(b => b.classList.toggle("on", b.dataset.food === FOODSUB));
  document.querySelectorAll(".hprof").forEach(b => b.classList.toggle("active", n === "profile"));
  const pt = $("pageTitle"); if (pt) pt.textContent = TAB_TITLES[n] || "Elite OS";
  lsSet(TABK, JSON.stringify([n, FOODSUB]));
  if (n === "coach") { renderCoach(); loadClients(); }
  if (n === "quality") renderQuality();
  window.scrollTo({ top: 0 });
}
function setPlanSeg(k) { PSEG = k; $("pane-plan").dataset.seg = k; document.querySelectorAll("[data-pseg]").forEach(b => b.classList.toggle("on", b.dataset.pseg === k)); lsSet(TABK + "Seg", k); }
function restoreNav() {
  try {
    const v = JSON.parse(lsGet(TABK) || "null");
    if (v && ["plan", "train", "food", "quality", "progress", "overview", "profile"].concat(coachOn() ? ["coach"] : []).includes(v[0])) showTab(v[0], ["grocery", "kitchen", "overview"].includes(v[1]) ? v[1] : "grocery");
    else showTab("plan");
    const sg = lsGet(TABK + "Seg"); if (sg === "w" || sg === "m") setPlanSeg(sg);
  } catch (e) { showTab("plan"); }
}

const THK = "elitePeakingTheme";
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const m = document.querySelector("meta[name=theme-color]"); if (m) m.content = t === "light" ? "#f5f6f8" : "#050608";
  const b = $("btnTheme"); if (b) { b.innerHTML = ico(t === "light" ? "moon" : "sun", 17); b.title = b.ariaLabel = t === "light" ? "Switch to dark theme" : "Switch to light theme"; }
}
function initTheme() { let t = "dark"; try { t = lsGet(THK) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); } catch (e) {} applyTheme(t); }
function toggleTheme() { const t = document.documentElement.dataset.theme === "light" ? "dark" : "light"; lsSet(THK, t); applyTheme(t); }

const icsEsc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsFold = l => { let o = ""; while (l.length > 73) { o += l.slice(0, 73) + "\r\n "; l = l.slice(73); } return o + l; };
const ymd = (d, t) => d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
const MEALT = { 3: ["08:00", "13:00", "19:00"], 4: ["08:00", "12:30", "16:00", "19:30"], 5: ["07:30", "11:00", "14:30", "18:00", "20:30"], 6: ["07:30", "10:30", "13:00", "16:00", "19:00", "21:00"] };
function addMin(t, m) { const [h, mi] = t.split(":").map(Number), x = h * 60 + mi + m; return pad(Math.floor(x / 60) % 24) + ":" + pad(x % 60); }
function icsDays(n) { const seen = new Set(), out = []; for (let k = 0; k < n; k++) buildWeek(S.prof, S, addD(weekMon(), 7 * k), TODAY).days.forEach(d => { if (!seen.has(d.date)) { seen.add(d.date); out.push(d); } }); return out; }
function weekICS(days) {
  const ev = [], stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), wt = S.prof.wtime || "17:30", len = S.prof.len || 60, withMeals = S.prof.mealRem === "yes";
  const evt = (uid, date, t, dur, sum, desc, alarm) => { ev.push("BEGIN:VEVENT", "UID:" + uid + "@elite-os", "DTSTAMP:" + stamp, "DTSTART:" + ymd(date, t), "DTEND:" + ymd(date, addMin(t, dur)), "SUMMARY:" + icsEsc(sum), "DESCRIPTION:" + icsEsc(desc), "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(sum), "TRIGGER:-PT" + alarm + "M", "END:VALARM", "END:VEVENT"); };
  (days || W.days).forEach(d => {
    if (d.session) evt(d.date + "-w", d.date, wt, len, "Workout: " + d.session.name, d.session.ex.map(e => `${e.name} ${e.sets} x ${e.reps} @ ${e.rir} RIR`).join("\n"), 30);
    if (withMeals) { const ts = MEALT[S.prof.meals] || MEALT[4]; d.meals.forEach((m, i) => evt(d.date + "-m" + i, d.date, ts[i] || "12:00", 20, "Meal: " + m.name, `${m.kcal} kcal, ${m.P}P ${m.C}C ${m.F}F`, 10)); }
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Elite OS//EN", "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR"].map(icsFold).join("\r\n") + "\r\n";
}
function downloadICS(weeks) { const n = weeks > 1 ? weeks : 1; dlFile(n > 1 ? `elite-os-${n}-weeks.ics` : "elite-os-week.ics", weekICS(n > 1 ? icsDays(n) : null), "text/calendar"); }

let wl = null, wlWant = false;
async function getWake() { try { wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); } catch (e) { wlWant = false; toast("Keep-screen-on is not supported here", "warn"); } }
async function toggleWake() { if (wlWant) { wlWant = false; if (wl) await wl.release(); wl = null; } else { wlWant = true; await getWake(); } renderPlan(); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && wlWant && !wl) getWake().then(renderPlan); });

function renderSys() {
  const u = $("updBar"), ib = $("installBox"); if (!u || !ib) return;
  u.innerHTML = UPD ? `<div class="sysbar upd" role="status"><span>${ico("spark", 16)} A new version of Elite OS is ready.</span><button class="btn pri" data-ui="update">Update now</button></div>` : "";
  const showI = !isStandalone() && !inFrame() && lsGet("eliteInstallX") !== "1" && (BIP || (isIOS() && location.protocol.startsWith("http")));
  ib.innerHTML = showI ? `<div class="sysbar"><span>${ico("plus", 16)} ${BIP ? "Install Elite OS as an app: full screen, works offline." : "Install on iPhone: tap Share → <b>Add to Home Screen</b>."}</span>${BIP ? '<button class="btn pri" data-ui="install">Install</button>' : ""}<button class="hthm" data-ui="install-x" aria-label="Dismiss">${ico("x", 16)}</button></div>` : "";
}
async function checkUpdate() {
  if (!location.protocol.startsWith("http") || UPD) return;
  try { const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return; const j = await r.json(); if (j && j.v && j.v !== APP_VER) { UPD = true; renderSys(); } } catch (e) {}
}
async function applyUpdate() {
  try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update().catch(() => {}))); } } catch (e) {}
  location.reload();
}
addEventListener("beforeinstallprompt", e => { e.preventDefault(); BIP = e; renderSys(); });
addEventListener("appinstalled", () => { BIP = null; lsSet("eliteInstallX", "1"); renderSys(); });
function navTo(h) { h = String(h || ""); if (h === "#coach" && coachOn()) showTab("coach"); else if (h === "#progress") showTab("progress"); else if (h === "#today" || h === "#wm") { showTab("plan"); S.sel = TODAY; regen(); renderAll(true); } }
function initSys() {
  renderSys(); checkUpdate();
  setInterval(checkUpdate, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
  if (navigator.serviceWorker) {
    if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener("controllerchange", () => { UPD = true; renderSys(); });
    navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.nav != null) navTo(e.data.nav); });
  }
  setTimeout(() => { if (/^#(coach|progress|today|wm)$/.test(location.hash)) { const h = location.hash; history.replaceState(null, "", location.pathname + location.search); navTo(h); } }, 0);
}

/* ---------- Unified Event Routing (Consolidated, clean) ---------- */
let deb = null, DRG = null;
document.addEventListener("pointerdown", e => {
  const h = e.target.closest && e.target.closest(".trdrag"); if (!h) return;
  const ex = h.closest(".trex"); if (!ex) return;
  DRG = { ex, d: +ex.dataset.d }; ex.classList.add("drag"); e.preventDefault();
});
document.addEventListener("pointermove", e => {
  if (!DRG) return;
  if (e.clientY < 90) window.scrollBy(0, -14); else if (e.clientY > innerHeight - 90) window.scrollBy(0, 14);
  const el = document.elementFromPoint(e.clientX, e.clientY), tg = el && el.closest(".trex");
  if (!tg || tg === DRG.ex || +tg.dataset.d !== DRG.d) return;
  const r = tg.getBoundingClientRect(); tg.parentNode.insertBefore(DRG.ex, e.clientY < r.top + r.height / 2 ? tg : tg.nextSibling);
});
function dragEnd(apply) {
  if (!DRG) return;
  const g = DRG; DRG = null; g.ex.classList.remove("drag");
  const d = PD()[g.d]; if (!d) return;
  const order = [...g.ex.parentNode.querySelectorAll(".trex")].map(x => +x.dataset.i);
  if (apply && order.some((v, i) => v !== i) && order.length === d.ex.length) { d.ex = order.map(i => d.ex[i]); d.ex.forEach((x, i) => { if (i === d.ex.length - 1) x.ss = false; }); touch(g.d); trCommit(true); }
  else renderTrain();
}
document.addEventListener("pointerup", () => dragEnd(true));
document.addEventListener("pointercancel", () => dragEnd(false));

document.addEventListener("input", e => {
  const t = e.target;
  if (t.id === "trQ") { TR.q = t.value; $("trRes").innerHTML = trResults(); return; }
  if (t.id === "kq") { KQ = t.value; renderKitchen(); return; }
  if (t.id === "fsQ") { FS.q = t.value; return; }
  if (t.id === "fsBc") { FS.bc = t.value; return; }
  if (t.id === "fsCc") { FS.cc = t.value; return; }
  if (t.id === "plT") { PL.t = t.value; plateOut(); return; }
  if (t.id === "plB") { PL.bar = t.value; plateOut(); return; }
  if (t.id === "wmPlT" || t.id === "wmPlB") {
    const out = $("wmPlOut"); if (out) out.innerHTML = plateSummaryHTML(($("wmPlT") || {}).value, ($("wmPlB") || {}).value);
    return;
  }
  if (/^ct[PCF]$/.test(t.id)) { const v = k => +($(k).value) || 0, k = Math.round(4 * v("ctP") + 4 * v("ctC") + 9 * v("ctF")); $("ctK").innerHTML = `= <b>${k} kcal</b> per day on average (training days +10% carbs)`; return; }
  if (t.matches("[data-p]")) { clearTimeout(deb); deb = setTimeout(() => onField(t), t.type === "number" ? 250 : 0); if (t.tagName === "SELECT" || t.type === "date") { clearTimeout(deb); onField(t); } return; }
  if (t.matches("[data-m] input")) { onMulti(t.closest("[data-m]"), t); return; }
  if (t.matches("[data-pw],[data-pr]")) { onPerfInput(t); return; }
  if (t.id === "logDate") { logDate = t.value || TODAY; renderProgress(); return; }
  if (["lw", "lwa", "ls", "le", "ln", "lch", "lar", "lth"].includes(t.id)) {
    const l = S.log[logDate] = S.log[logDate] || {};
    if (t.id === "lw") { l.w = t.value ? fromW(parseFloat(t.value)) : 0; delete l.wh; } /* manual beats Health */
    if (t.id === "lwa") l.wa = t.value ? fromL(parseFloat(t.value)) : 0;
    if (t.id === "lch") l.ch = t.value ? fromL(parseFloat(t.value)) : 0;
    if (t.id === "lar") l.ar = t.value ? fromL(parseFloat(t.value)) : 0;
    if (t.id === "lth") l.th = t.value ? fromL(parseFloat(t.value)) : 0;
    if (t.id === "ls") { l.s = t.value; delete l.sh; } /* manual beats Health */
    if (t.id === "le") l.e = t.value;
    if (t.id === "ln") l.n = t.value;
    save(); clearTimeout(deb); deb = setTimeout(() => { renderTrend(); renderBio(); }, 400);
  }
});

document.addEventListener("change", async e => {
  const t = e.target;
  if (t.id === "autoRest") { setAutoRest(t.checked); return; }
  if (t.id === "chSel") { CH.uid = t.value; renderChart(); return; }
  if (t.id === "cxOn") { lsSet(CXK, t.checked ? "1" : "0"); renderNavCoach(); if (t.checked) loadClients(); return; }
  if (t.id === "coFrom" && t.value && CO.edit) { coSnap(); const [pid, dw] = t.value.split("|"), p = coPlans().find(([k]) => k === pid), x = p && p[1].days[dw]; if (x) { CO.edit.name = x.name || "Workout"; CO.edit.ex = x.ex.map(e => Object.assign({}, e)); } renderCoach(); return; }
  if (t.id === "cdSteps") {
    const n = Math.round(+t.value || 0); S.stepsM = obj4(S.stepsM);
    if (n > 0) { S.steps[S.sel] = n; S.stepsM[S.sel] = 1; } else { delete S.steps[S.sel]; delete S.stepsM[S.sel]; }
    save(); renderCardio(); renderCommand(); return;
  }
  if (t.id === "phPose") { PH.pose = t.value; PH.cmp = false; renderPhotos(); return; }
  if (t.id === "phFile") {
    try { for (const f of t.files) await phAdd(f, PH.pose, logDate || TODAY); PH.msg = ""; } catch (err) { PH.msg = "Could not save photo: " + err.message; }
    t.value = ""; await renderPhotos();
    if (SY.sess && sharingPhotos()) phUploadAll().then(n => { if (n) { PH.msg = `Shared ${n} new photo${n === 1 ? "" : "s"} with coach.`; renderPhotos(); } }).catch(() => {});
    return;
  }
  if (t.id === "hsFile") { const f = t.files[0]; if (f) f.text().then(x => importHealth(x)).finally(() => { t.value = ""; }); return; }
  if (t.id === "rfFile") { const f = t.files[0]; if (f) f.text().then(txt => { $("rfPaste").value = txt; const r = parseRecipeText(txt); fillForm(Object.assign({ slots: [] }, r)); rfMsg(`Loaded ${f.name}: ${r.ing.length} ingredients, ${r.steps.length} steps.`); }).catch(err => rfMsg("Could not read file: " + err.message)).finally(() => { t.value = ""; }); return; }
  if (t.dataset && t.dataset.wmwu) { WM.wuDone[t.dataset.wmwu] = t.checked; wmDraw(); return; }
  if (t.dataset && t.dataset.pu) { pushSetPref(t.dataset.pu, t.checked); return; }
  if (t.dataset && t.dataset.coef && CO.edit) {
    const [k, i] = t.dataset.coef.split("|"), x = CO.edit.ex[+i]; if (!x) return;
    if (k === "ss") { x.ss = t.checked; coSnap(); renderCoach(); }
    else if (k === "sets") x.sets = Math.max(1, Math.min(10, Math.round(+t.value) || 3));
    else if (k === "rest") x.rest = Math.max(0, Math.min(600, Math.round(+t.value) || 0));
    else if (k === "reps") x.reps = cleanReps(t.value) || x.reps;
    else if (k === "demo") { const v = String(t.value || "").trim(); x.demo = /^https:\/\/\S{4,300}$/.test(v) ? v : ""; }
    return;
  }
  if (t.dataset && t.dataset.trf !== undefined) {
    const c = CP(), f = t.dataset.trf;
    if (f === "deload") { c.deload = t.checked; c.mt = NOW(); trCommit(false); return; }
    if (f === "plan") { if (c.plans[t.value] && !c.plans[t.value].deleted) { c.active = t.value; c.mt = NOW(); trCommit(true); } return; }
    const dd = +t.dataset.d, d = PD()[dd];
    if (f === "name") { if (d) { d.name = cleanName(t.value); touch(dd); trCommit(false); } return; }
    if (f === "copyto") {
      const to = +t.value; t.value = "";
      if (!d || isNaN(to) || to === dd) return;
      const tgt = PD()[to];
      if (tgt && tgt.ex && tgt.ex.length && !await uiConfirm(`Replace ${DAYN[to]} with a copy of ${DAYN[dd]}?`, { title: "Copy day", okText: "Replace" })) return;
      PD()[to] = JSON.parse(JSON.stringify(d)); touch(to); trCommit(true); return;
    }
    const x = d && d.ex[+t.dataset.i]; if (!x) return;
    if (f === "sets") { x.sets = Math.max(1, Math.min(10, Math.round(+t.value) || 3)); t.value = x.sets; }
    else if (f === "rest") { x.rest = Math.max(0, Math.min(600, Math.round(+t.value) || 0)); t.value = x.rest; }
    else if (f === "reps") { x.reps = cleanReps(t.value) || "8–12"; t.value = x.reps; }
    else if (f === "wu") x.wu = Math.max(0, Math.min(4, Math.round(+t.value) || 0));
    else if (f === "prog") x.prog = t.value === "reps" ? "reps" : "dbl";
    else if (f === "inc") { x.inc = Math.max(0, Math.min(100, parseFloat(t.value) || 0)); t.value = x.inc > 0 ? x.inc : ""; }
    else if (f === "ss") x.ss = !!t.checked;
    else if (f === "demo") { const v = String(t.value || "").trim(); x.demo = /^https:\/\/\S{4,300}$/.test(v) ? v : ""; t.value = x.demo; }
    touch(dd); trCommit(f === "wu" || f === "prog" || f === "ss" || f === "inc"); return;
  }
  if (t.dataset && t.dataset.ru) { const r = S.recipes.find(x => x.id === t.dataset.ru); if (r) { r.use = t.checked; save(); regen(); renderAll(true); } return; }
  if (t.dataset && t.dataset.gc) { const x = S.groc.find(y => y.id === t.dataset.gc); if (x) { x.done = t.checked; save(); renderCustomGrocery(); } return; }
  if (t.dataset && t.dataset.k) { S.checks[t.dataset.k] = t.checked; markDone(t.dataset.k); save(); renderPlan(); renderGrocery(); renderOverall(); renderProgExtra(); return; }
  if (t.dataset && t.dataset.rd) onReady(t);
});

document.addEventListener("click", async e => {
  const t = e.target;
  document.querySelectorAll("details.more[open]").forEach(d => { if (!d.contains(t) || t.closest(".menu button")) d.open = false; });

  /* Direct attribute routers */
  if (t.closest("[data-hxrun]")) { lsSet(HXRUNK, String(Date.now())); return; }
  if (t.closest("#hxPill")) { showTab("progress"); setTimeout(() => { const x = $("hxCard"); if (x) x.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); return; }
  if (t.closest("#btnMode")) { setMode(UX().mode === "guided" ? "pro" : "guided"); return; }
  let b;
  if ((b = t.closest("button[data-mode]"))) { setMode(b.dataset.mode); return; }
  if ((b = t.closest("button[data-tab]"))) { showTab(b.dataset.tab); return; }
  if ((b = t.closest("[data-goto]"))) { showTab(b.dataset.goto); return; }
  if ((b = t.closest("[data-food]"))) { showTab("food", b.dataset.food); return; }
  if ((b = t.closest("[data-pseg]"))) { setPlanSeg(b.dataset.pseg); return; }
  if ((b = t.closest("[data-day]"))) { S.sel = b.dataset.day; save(); renderPlan(); return; }
  if ((b = t.closest("[data-wk]"))) { const v = +b.dataset.wk; S.weekOffset = v === 0 ? 0 : S.weekOffset + v; save(); regen(); renderAll(true); return; }
  if ((b = t.closest("[data-t]"))) { e.preventDefault(); startTimer(+b.dataset.t); return; }
  if ((b = t.closest("[data-tadj]"))) { e.preventDefault(); adjustTimer(+b.dataset.tadj); return; }
  if ((b = t.closest("[data-wa]"))) { addWater(+b.dataset.wa); return; }
  if ((b = t.closest("[data-mmult]"))) {
    const [dt, i, v] = b.dataset.mmult.split("|");
    S.mealMult = obj4(S.mealMult);
    if (+v === 1) delete S.mealMult[`${dt}|${i}`]; else S.mealMult[`${dt}|${i}`] = +v;
    save(); renderPlan(); return;
  }
  if ((b = t.closest("[data-swap]"))) { const k = b.dataset.swap; S.swaps[k] = (S.swaps[k] || 0) + 1; save(); regen(); renderAll(true); return; }
  if ((b = t.closest("[data-mswap]"))) { const [date, i] = b.dataset.mswap.split("|"); const a = S.mswaps[date] = S.mswaps[date] || []; a[+i] = (a[+i] || 0) + 1; save(); regen(); renderAll(true); return; }
  if ((b = t.closest("[data-cook]"))) { const p = b.dataset.cook.split("|"); openCook(p[0], +p[1]); return; }
  if ((b = t.closest("[data-ckact]"))) { cookAct(b.dataset.ckact); return; }
  if ((b = t.closest("button[data-rd]"))) { toggleReady(); return; }
  if ((b = t.closest("[data-rt]"))) { const det = b.closest("details"), tab = b.dataset.rt; UIT[b.dataset.rk] = tab; det.querySelectorAll("[data-rt]").forEach(x => x.classList.toggle("on", x.dataset.rt === tab)); det.querySelectorAll("[data-rp]").forEach(p => p.hidden = p.dataset.rp !== tab); return; }
  if ((b = t.closest("[data-nba]"))) {
    const a = b.dataset.nba;
    if (a === "ready") { setPlanSeg("w"); const x = $("readyBox"); if (x) x.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (a === "food") { setPlanSeg("m"); const x = $("foodBox"); if (x) x.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (a === "meal") { const k = `${S.sel}|meal|${b.dataset.i}`; S.checks[k] = true; markDone(k); save(); renderPlan(); renderOverall(); renderProgExtra(); toast("Meal logged", "good"); }
    return;
  }
  if ((b = t.closest("[data-supp]"))) { const d = S.supp[S.sel] = S.supp[S.sel] || {}, k = b.dataset.supp; if (d[k]) delete d[k]; else d[k] = 1; if (!Object.keys(d).length) delete S.supp[S.sel]; save(); renderPlan(); return; }
  if ((b = t.closest("[data-supp-edit]"))) {
    const v = await uiPrompt("Supplements to track each day, separated by commas", UX().supps.join(", "), { title: "Edit supplement list" });
    if (v !== null) { UX().supps = [...new Set(v.split(",").map(x => x.trim().slice(0, 40)).filter(Boolean))].slice(0, 10); save(); renderPlan(); }
    return;
  }
  if ((b = t.closest("[data-qa]"))) { const x = QA[+b.dataset.qa]; if (x) { flogAdd(x); toast(`Logged ${x.n}`, "good"); } return; }
  if ((b = t.closest("[data-fsfav]"))) {
    const x = ((S.flog || {})[S.sel] || []).find(y => y.id === b.dataset.fsfav); if (!x) return;
    const i = S.favs.findIndex(f => f.n === x.n);
    if (i >= 0) { markDeleted(S.favs[i].id); S.favs.splice(i, 1); } else { if (S.favs.length >= 24) S.favs.shift(); S.favs.push(Object.assign({}, x)); }
    save(); renderPlan(); return;
  }
  if ((b = t.closest("[data-fsadd]"))) { fsAdd(+b.dataset.fsadd, $("fsG" + b.dataset.fsadd).value); toast("Logged to food log", "good"); return; }
  if ((b = t.closest("[data-fsdel]"))) {
    const id = b.dataset.fsdel, prev = (S.flog[S.sel] || []).find(x => x.id === id);
    S.flog[S.sel] = (S.flog[S.sel] || []).filter(x => x.id !== id); markDeleted(id); save(); renderPlan();
    if (prev) toast(`Removed ${prev.n}`, "info", () => { delete S.del[id]; (S.flog[S.sel] = S.flog[S.sel] || []).push(prev); save(); renderPlan(); });
    return;
  }
  if ((b = t.closest("[data-qtry]"))) { FS.q = b.dataset.qtry; fsSearch(); return; }
  if ((b = t.closest("[data-qadd]"))) { fsAdd(+b.dataset.qadd, $("qG" + b.dataset.qadd).value); toast("Logged", "good"); return; }
  if ((b = t.closest("[data-addset]"))) { addSet(b.dataset.addset); return; }
  if ((b = t.closest("[data-undoset]"))) { undoSet(b.dataset.undoset); return; }
  if ((b = t.closest("[data-cddel]"))) {
    const cid = b.dataset.cddel, a = (S.cardio || {})[S.sel] || [];
    const idx = cid.startsWith("idx:") ? +cid.slice(4) : a.findIndex(x => String(x.id) === cid);
    if (idx >= 0) { const rem = a.splice(idx, 1)[0]; if (!a.length) delete S.cardio[S.sel]; save(); renderCardio(); toast("Cardio entry removed", "info", () => { (S.cardio[S.sel] = S.cardio[S.sel] || []).push(rem); save(); renderCardio(); }); }
    return;
  }
  if ((b = t.closest("[data-fp]"))) { cycleFood(b.dataset.fp); return; }
  if ((b = t.closest("[data-mp]"))) { const p = b.dataset.mp.split("|"); setMealPref(p[1], +p[0]); return; }
  if ((b = t.closest("[data-mpclr]"))) { delete PRF().meals[b.dataset.mpclr]; afterPrefs(); return; }
  if ((b = t.closest("[data-rfv]"))) { const r = S.recipes.find(x => x.id === b.dataset.rfv); if (r) { r.fav = !r.fav; save(); regen(); renderAll(true); } return; }
  if ((b = t.closest("[data-rdel]"))) {
    if (await uiConfirm("Delete this recipe?", { title: "Delete recipe", danger: true, okText: "Delete" })) {
      markDeleted(b.dataset.rdel); S.recipes = S.recipes.filter(x => x.id !== b.dataset.rdel); save(); regen(); renderAll(true);
    }
    return;
  }
  if ((b = t.closest("[data-red]"))) { const r = S.recipes.find(x => x.id === b.dataset.red); if (r) { RFID = r.id; fillForm(r); rfMsg("Editing. Save to update."); $("rfName").scrollIntoView({ behavior: "smooth" }); } return; }
  if ((b = t.closest("[data-rsc]"))) { const [id, dv] = b.dataset.rsc.split("|"); RSC[id] = Math.max(1, Math.min(10, (RSC[id] || 1) + (+dv))); renderRecipeList(); return; }
  if ((b = t.closest("[data-rck]"))) { openCookRecipe(b.dataset.rck); return; }
  if ((b = t.closest("[data-rlog]"))) {
    const r = (S.recipes || []).find(x => x.id === b.dataset.rlog); if (!r) return;
    const m = +b.dataset.m || RSC[r.id] || 1, q = qRecipe(r);
    flogAdd(Object.assign({ n: r.name + (m > 1 ? ` ×${m}` : ""), g: 0, kcal: Math.round(r.kcal * m), p: r1(r.P * m), c: r1(r.C * m), f: r1(r.F * m), m: {} }, q ? { q: q.score, fl: q.fl } : {}));
    toast(`Logged ${m} serving${m === 1 ? "" : "s"} of ${r.name}`, "good"); return;
  }
  if ((b = t.closest("[data-rgl2]"))) {
    const r = (S.recipes || []).find(x => x.id === b.dataset.rgl2); if (!r) return;
    const m = RSC[r.id] || 1, res = addGroceryLines(r.ing.map(l => scaleLine(l, m)));
    toast(`Groceries: ${res.added} added${res.merged ? `, ${res.merged} combined` : ""}`, "good"); return;
  }
  if ((b = t.closest("[data-gcx]"))) { markDeleted(b.dataset.gcx); S.groc = S.groc.filter(x => x.id !== b.dataset.gcx); save(); renderCustomGrocery(); return; }
  if ((b = t.closest("[data-bior]"))) { BIO.range = +b.dataset.bior; lsSet("eliteBioRange", String(BIO.range)); renderBio(); return; }
  if ((b = t.closest("[data-biom]"))) { BIO.metric = b.dataset.biom; lsSet("eliteBioMetric", BIO.metric); renderBio(); return; }
  if ((b = t.closest("[data-bio]"))) { const a = b.dataset.bio; if (a === "csv") { dlFile("elite-os-daily.csv", bioCSV(), "text/csv"); toast("CSV downloaded", "good"); } else if (a === "json") $("btnExport").click(); else $("btnImport").click(); return; }
  if ((b = t.closest("[data-hx]"))) {
    const a = b.dataset.hx;
    if (a === "sync") hxSyncNow();
    else if (a === "focus") { const det = $("hxBox").querySelector('details[data-hk="setup"]'); if (det) det.open = true; const i = $("hxIn"); if (i) { i.scrollIntoView({ behavior: "smooth", block: "center" }); i.focus(); } }
    else if (a === "check") hxCheck(false);
    else if (a === "import") hxCheck(true);
    else if (a === "sample") { $("hxIn").value = HX_SAMPLE; hxCheck(false); }
    else if (a === "copylink") { const v = $("hxLink").value; if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => toast("Link copied", "good")); else await uiPrompt("Copy link", v); }
    else if (a === "scname") { const v = $("hxScName").value.trim(); if (v) lsSet(HXSCK, v); else try { localStorage.removeItem(HXSCK); } catch (x) {} toast("Run sync will open: " + hxShortcut(), "good"); renderHX(); renderPlan(); }
    else if (a === "feedsave") { const v = $("hxFeed").value.trim(); if (v && !/^https:\/\//.test(v)) return toast("Address must start with https://", "warn"); if (v) lsSet(HXFEEDK, v); else try { localStorage.removeItem(HXFEEDK); } catch (x) {} toast(v ? "Saved. Pulling now…" : "Turned off", "good"); if (v) hxFeedPull(true); }
    return;
  }
  if ((b = t.closest("[data-phdel]"))) {
    if (await uiConfirm("Delete this photo? It cannot be recovered.", { title: "Delete photo", danger: true, okText: "Delete" })) {
      const id = b.dataset.phdel;
      await phTx("readwrite", st => st.delete(id)); await renderPhotos();
      if (SY.sess && sharingPhotos()) try { const l = await phRemoteList(uidMe()); await phRemoteDelete(l.filter(o => o.name.startsWith(id + "_")).map(o => uidMe() + "/" + o.name)); const up = phUp(); delete up[id]; lsSet(PHUK, JSON.stringify(up)); } catch (err) {}
    }
    return;
  }
  if ((b = t.closest("[data-ui]"))) {
    const u = b.dataset.ui;
    if (u === "ics4") downloadICS(4);
    else if (u === "update") applyUpdate();
    else if (u === "install" && BIP) { const pr = BIP; BIP = null; pr.prompt(); pr.userChoice.finally(renderSys); }
    else if (u === "install-x") { lsSet("eliteInstallX", "1"); renderSys(); }
    return;
  }
  if (wmClick(t)) return;

  /* Train builder actions */
  if ((b = t.closest("[data-tr]"))) {
    const c = CP(), a = b.dataset.tr, v = b.dataset.v;
    if (a === "mode") { c.mode = v; c.mt = NOW(); if (v === "custom" && !Object.values(PD()).some(x => x && x.ex && x.ex.length)) seedFromAuto(); trCommit(true); }
    else if (a === "seed") { if (await uiConfirm("Replace everything in this plan with a fresh copy of the auto plan?", { title: "Reset plan", danger: true, okText: "Reset" })) { seedFromAuto(); TR.open = -1; trCommit(true); } }
    else if (a === "clearall") { if (await uiConfirm("Delete every exercise from this plan?", { title: "Clear plan", danger: true, okText: "Clear all" })) { const p = PLN(); for (let d = 0; d < 7; d++) p.days[d] = tomb(); touch(); TR.open = -1; trCommit(true); } }
    else if (a === "clearday") { if (await uiConfirm("Clear " + DAYN[+v] + "?", { title: "Clear day", danger: true, okText: "Clear" })) { PD()[+v] = tomb(); touch(); trCommit(true); } }
    else if (a === "newplan") { const n = cleanName(await uiPrompt("Starts as a copy of the current plan.", "", { title: "New training plan", placeholder: "e.g. Hypertrophy Block 2" }) || ""); if (n) { const id = "p" + NOW().toString(36), tm = NOW(); c.plans[id] = { name: n, mt: tm, days: JSON.parse(JSON.stringify(PD())) }; Object.values(c.plans[id].days).forEach(d => d.mt = tm); c.active = id; c.mt = tm; trCommit(true); } }
    else if (a === "renameplan") { const n = cleanName(await uiPrompt("Enter a new name for this plan.", PLN().name, { title: "Rename plan" }) || ""); if (n) { PLN().name = n; touch(); trCommit(true); } }
    else if (a === "delplan") { const live = Object.keys(c.plans).filter(k => !c.plans[k].deleted); if (live.length > 1 && await uiConfirm(`Delete plan "${PLN().name}"?`, { title: "Delete plan", danger: true, okText: "Delete" })) { const p = PLN(); p.deleted = true; p.mt = NOW(); c.mt = NOW(); c.active = live.find(k => k !== c.active); trCommit(true); } }
    else if (a === "open") { TR.open = +v; TR.q = ""; TR.mu = "all"; renderTrain(); const q = $("trQ"); if (q) q.focus(); }
    else if (a === "close") { TR.open = -1; renderTrain(); }
    else if (a === "mu") { TR.mu = v; renderTrain(); }
    else if (a === "add") { const ex = EX[+v]; if (ex && TR.open >= 0) { const d = PD()[TR.open] = PD()[TR.open] || { name: "", ex: [] }; d.ex.push(libToEx(ex)); touch(TR.open); trCommit(true); } }
    else if (a === "addc") { const n = cleanName($("trCn").value), mu = $("trCm").value; if (!n) { $("trCn").focus(); return; } const dd = +v, d = PD()[dd] = PD()[dd] || { name: "", ex: [] }; d.ex.push(mkEx({ uid: "cx:" + (n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom"), id: "custom", slot: "custom", name: n, mu: MUSCLES.some(m => m[0] === mu) ? mu : "chest", sets: 3, reps: "8–12", rest: 90 })); touch(dd); trCommit(true); }
    else if (a === "up" || a === "down" || a === "del") { const [dd, i] = v.split("|").map(Number), d = PD()[dd]; if (d) { if (a === "del") d.ex.splice(i, 1); else { const j = a === "up" ? i - 1 : i + 1; if (j >= 0 && j < d.ex.length) [d.ex[i], d.ex[j]] = [d.ex[j], d.ex[i]]; } if (d.ex.length) d.ex[d.ex.length - 1].ss = false; touch(dd); trCommit(true); } }
    return;
  }

  /* Coach actions */
  if ((b = t.closest("[data-co]"))) { CO.sel = b.dataset.co; CO.day = ""; CO.edit = null; CO.wk = 0; coMarkRead(CO.sel); renderCoach(); window.scrollTo({ top: 0 }); return; }
  if ((b = t.closest("[data-cowk]"))) { const v = +b.dataset.cowk; CO.wk = v === 0 ? 0 : CO.wk + v; CO.day = ""; CO.edit = null; renderCoach(); return; }
  if ((b = t.closest("[data-coday]"))) { coSnap(); CO.day = CO.day === b.dataset.coday ? "" : b.dataset.coday; CO.edit = null; renderCoach(); return; }
  if ((b = t.closest("[data-coex]")) && CO.edit) { coSnap(); const [op, i] = b.dataset.coex.split("|"), k = +i, a = CO.edit.ex; if (op === "del") a.splice(k, 1); else { const j = op === "up" ? k - 1 : k + 1; if (j >= 0 && j < a.length) [a[k], a[j]] = [a[j], a[k]]; } a.forEach((x, n) => { if (n === a.length - 1) x.ss = false; }); renderCoach(); return; }
  if ((b = t.closest("[data-cocmtgo]"))) { const d = b.dataset.cocmtgo, inp = document.querySelector(`[data-cocmt="${d}"]`); sendMsg(uidMe(), CO.sel, inp && inp.value, d, loadClients); return; }
  if ((b = t.closest("[data-coreplygo]"))) { const w = b.dataset.coreplygo, inp = document.querySelector(`[data-coreply="${w}"]`); sbRpc("coach_checkin_reply", { client: CO.sel, wk: w, txt: inp.value }).then(loadClients).catch(err => toast(v3Err(err), "warn")); return; }
  if ((b = t.closest("[data-cxstop]"))) { stopCoach(b.dataset.cxstop); return; }

  /* Button IDs */
  const btn = t.closest("button"); if (!btn) return;
  switch (btn.id) {
    case "btnTheme": toggleTheme(); break;
    case "btnIcs": downloadICS(); break;
    case "tStop": stopTimer(); break;
    case "btnWake": toggleWake(); break;
    case "btnOpenQuick": { const eb = $("exBox"); if (eb) { eb.hidden = !eb.hidden; if (!eb.hidden && $("exN")) $("exN").focus(); } break; }
    case "btnCopyRep": { const r = weekReport(), txt = "Last 7 days\n" + r.lines.join("\n") + "\n\nNext week\n" + r.focus.join("\n"); if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast("Report copied", "good")); else await uiAlert(txt, "Weekly report"); break; }
    case "btnAddEx": { const g = id => Math.max(0, parseFloat($(id).value) || 0), k = g("exK"), p = g("exP"), c = g("exC"), f = g("exF"); if (!k && !p && !c && !f) { $("exK").focus(); break; } flogAdd({ n: ($("exN").value || "").trim().slice(0, 60) || "Quick add", g: 0, kcal: Math.round(k || 4 * p + 4 * c + 9 * f), p, c, f, m: {} }); toast("Added to food log", "good"); break; }
    case "btnClrEx": delete S.extra[S.sel]; save(); renderPlan(); break;
    case "btnSbIn": case "btnSbUp": signIn(btn.id === "btnSbUp"); break;
    case "btnSbDel": delAccount(); break;
    case "btnSbForgot": forgotPw(); break;
    case "btnSyncNow": syncNow(); break;
    case "btnSyncOff": SY = {}; saveSY(); S.cx = {}; save(); setMsg("Signed out"); regen(); renderAll(); renderNavCoach(); break;
    case "btnSyncLink": shareLink(); break;
    case "btnInvite": inviteFriend(); break;
    case "btnConfirm": S.confirmed = true; save(); fillProfile(); toast("Profile saved", "good"); break;
    case "btnRotate": S.blockOffset++; S.blockStart = mondayOf(TODAY); S.swaps = {}; S.weekOffset = 0; save(); regen(); renderAll(true); toast("New block started", "good"); break;
    case "btnApply": S.prof.kcalAdj = Math.max(-500, Math.min(500, (S.prof.kcalAdj || 0) + (+btn.dataset.delta))); commit(); toast("Calories adjusted", "good"); break;
    case "btnClearAdj": S.prof.kcalAdj = 0; commit(); toast("Adjustment cleared", "good"); break;
    case "btnExport": dlFile("elite-peaking-backup.json", JSON.stringify(S, null, 2), "application/json"); toast("Backup exported", "good"); break;
    case "btnImport": $("fileIn").click(); break;
    case "btnReset": if (await uiConfirm("Reset the profile, logs and all checks on this device?", { title: "Reset everything", danger: true, okText: "Reset all" })) { S = freshState(); save(); regen(); renderAll(); toast("Reset complete"); } break;
    case "btnUseWt": { const tr = weightTrend(S.log, TODAY); if (tr) { S.prof.kg = tr.trendNow || tr.avg; commit(); fillProfile(); toast("Bodyweight updated to trend", "good"); } break; }
    case "fsGo": fsSearch(); break;
    case "fsBcGo": fsBarcode(FS.bc); break;
    case "fsScan": fsScan(); break;
    case "qGo": FS.q = $("qQ").value; fsSearch(); break;
    case "qBcGo": FS.bc = $("qBc").value; fsBarcode(FS.bc); break;
    case "qScan": fsScan(); break;
    case "btnRfParse": { const txt = $("rfPaste").value; if (!txt.trim()) { rfMsg("Paste a recipe first."); break; } const r = parseRecipeText(txt); fillForm(Object.assign({ slots: [] }, r)); rfMsg(`Filled ${r.ing.length} ingredients and ${r.steps.length} steps.`); break; }
    case "btnRfFile": $("rfFile").click(); break;
    case "btnRfEst": { const lines = $("rfIng").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); if (!lines.length) { rfMsg("Add ingredients first."); break; } const est = estimateMacros(lines), sv = Math.max(1, parseFloat($("rfServ").value) || 1); if (!est.hit) { rfMsg("Could not match ingredients. Enter macros manually."); break; } $("rfP").value = Math.round(est.P / sv); $("rfC").value = Math.round(est.C / sv); $("rfF").value = Math.round(est.F / sv); $("rfK").value = Math.round((4 * est.P + 4 * est.C + 9 * est.F) / sv); rfMsg(`Estimated from ${est.hit}/${est.total} lines (${sv} serving${sv === 1 ? "" : "s"}).`); break; }
    case "btnRfSave": saveRecipe(); break;
    case "btnRfClear": clearForm(); rfMsg(""); break;
    case "btnGcAdd": addGrocery($("gcIn").value); $("gcIn").value = ""; break;
    case "btnGcClear": (S.groc || []).filter(x => x.done).forEach(x => markDeleted(x.id)); S.groc = (S.groc || []).filter(x => !x.done); save(); renderCustomGrocery(); break;
    case "cdAdd": { const m = Math.round(+$("cdMin").value || 0); if (!(m > 0 && m <= 600)) { $("cdMin").focus(); break; } const hr = Math.round(+$("cdHr").value || 0); S.cardio = S.cardio || {}; (S.cardio[S.sel] = S.cardio[S.sel] || []).push(Object.assign({ id: Date.now(), type: $("cdType").value, min: m }, hr >= 40 && hr <= 230 ? { hr } : {})); save(); renderCardio(); toast("Cardio logged", "good"); break; }
    case "phAdd": $("phFile").click(); break;
    case "phCmp": PH.cmp = !PH.cmp; renderPhotos(); break;
    case "phShareOn": setPhotoShare(true); break;
    case "phShareOff": if (await uiConfirm("Stop sharing photos with your coach? Cloud copies are deleted; local photos stay.", { title: "Stop sharing photos", danger: true, okText: "Stop sharing" })) setPhotoShare(false); break;
    case "hsPick": $("hsFile").click(); break;
    case "puOn": pushEnable(); break;
    case "puOff": pushDisable(); break;
    case "puTest": pushTest(); break;
    case "coRefresh": loadClients(); break;
    case "coBack": CO.sel = ""; CO.day = ""; CO.edit = null; renderCoach(); break;
    case "coInvite": coInvite(); break;
    case "coShare": coShare(); break;
    case "coRestDay": if (CO.edit) { coSnap(); CO.edit.ex = []; CO.edit.name = "Rest"; renderCoach(); } break;
    case "coAddEx": { coSnap(); const q = ($("coAddQ").value || "").trim().toLowerCase(); if (!q) break; const ex = EX.find(x => x.n.toLowerCase() === q) || EX.find(x => x.n.toLowerCase().includes(q)); CO.edit.ex.push(ex ? libToEx(ex) : mkEx({ uid: "custom:" + q.replace(/[^a-z0-9]+/g, "-").slice(0, 30), id: q.replace(/[^a-z0-9]+/g, "-").slice(0, 30), slot: "custom", name: cleanName($("coAddQ").value), mu: "chest", sets: 3, reps: "8–12", rest: 90 })); renderCoach(); break; }
    case "coSaveDay": coSaveDay(false); break;
    case "coClearDay": if (await uiConfirm("Remove this assignment?", { title: "Remove assignment", danger: true, okText: "Remove" })) coSaveDay(true); break;
    case "coCloseDay": CO.day = ""; CO.edit = null; renderCoach(); break;
    case "coAssignProg": coAssignProgram(CO.sel); break;
    case "coHabSave": { const h = $("coHab").value.split(/\n+/).map(x => x.trim().slice(0, 80)).filter(Boolean).slice(0, 10); sbRpc("coach_set_habits", { client: CO.sel, h }).then(loadClients).then(() => toast("Habits saved", "good")).catch(err => toast(v3Err(err), "warn")); break; }
    case "coMsgSend": sendMsg(uidMe(), CO.sel, $("coMsgIn").value, null, loadClients); break;
    case "coRemove": if (await uiConfirm("Remove this client? You lose access to their data.", { title: "Remove client", danger: true, okText: "Remove" })) sbDel(`coach_links?coach_id=eq.${uidMe()}&client_id=eq.${CO.sel}`).then(() => { CO.sel = ""; return loadClients(); }).catch(err => toast(v3Err(err), "warn")); break;
    case "cxJoin": joinCoach(); break;
    case "cmSend": { const to = $("cmTo") ? $("cmTo").value : (myCoaches()[0] || {}).coach_id; sendMsg(to, uidMe(), $("cmIn").value, null, pullV3); break; }
    case "ciSend": sendCheckin(); break;
    case "ctSave": { const v = k => Math.round(+($(k).value) || 0); sbRpc("coach_set_targets", { client: CO.sel, t: { P: v("ctP"), C: v("ctC"), F: v("ctF"), note: $("ctN").value.slice(0, 300) } }).then(loadClients).then(() => toast("Targets saved", "good")).catch(err => toast(v3Err(err), "warn")); break; }
    case "ctClear": if (await uiConfirm("Remove your targets? The client returns to auto numbers.", { title: "Restore auto targets", okText: "Restore" })) sbRpc("coach_set_targets", { client: CO.sel, t: null }).then(loadClients).catch(err => toast(v3Err(err), "warn")); break;
    case "htNew": healthKey(true); break;
    case "htOff": healthKey(false); break;
    case "htTest": healthTest(); break;
    case "htCopy": { const v = hookURL(lsGet(HTK)); if (navigator.clipboard) navigator.clipboard.writeText(v).then(() => toast("Sync link copied", "good")); else await uiPrompt("Copy sync link", v); break; }
  }
});

$("fileIn").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => {
    const v = JSON.parse(txt);
    if (!v || typeof v !== "object" || !v.prof) throw new Error("not a backup file");
    const fr = freshState(); S = Object.assign(fr, v, { prof: Object.assign(fr.prof, v.prof) });
    v4Norm(); save(); regen(); renderAll(); toast("Backup imported", "good");
  }).catch(err => toast("Import failed: " + err.message, "warn")).finally(() => { e.target.value = ""; });
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && WM.on) { wmClose(); return; }
  if (e.key === "Enter") {
    const id = e.target && e.target.id;
    if (id === "gcIn") { addGrocery(e.target.value); e.target.value = ""; return; }
    if (id === "fsQ") { fsSearch(); return; }
    if (id === "fsBc") { fsBarcode(FS.bc); return; }
    if (id === "qQ") { FS.q = e.target.value; fsSearch(); return; }
    if (id === "qBc") { FS.bc = e.target.value; fsBarcode(FS.bc); return; }
    if (id === "cmIn") { $("cmSend").click(); return; }
    if (id === "coMsgIn") { $("coMsgSend").click(); return; }
    if (id === "cxCode") { joinCoach(); return; }
  }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !W || WM.on) return;
  const i = W.days.findIndex(d => d.date === S.sel);
  if (e.key === "ArrowRight" && i < 6) { S.sel = W.days[i + 1].date; save(); renderPlan(); }
  if (e.key === "ArrowLeft" && i > 0) { S.sel = W.days[i - 1].date; save(); renderPlan(); }
});
document.addEventListener("toggle", e => { const el = e.target; if (el.matches && el.matches("details.rec") && el.dataset.rk) UIR[el.dataset.rk] = el.open; }, true);

/* ---------- Boot ---------- */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
hydrateIcons();
(function () { const f = $("footVer"); if (f) f.textContent = APP_MAJOR + " (" + APP_VER + ")"; })();
initTheme(); regen(); renderAll(); restoreNav(); initSync(); initSys(); renderNavCoach();
setTimeout(hxFromURL, 0);
