// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// Health payload normalizer. Pure, no I/O. Shared by the edge function, the app (index.html carries an identical
// copy of the HX block; tests/smoke.cjs fails if they drift; tools/inline-hx.cjs re-copies it) and the tests.
/*HX-BEGIN*/
/* Turns anything a phone automation sends (Health Auto Export JSON, an iPhone Shortcut body, a URL query, CSV lines,
   half-broken JSON) into clean day rows {date, steps, kcal, rhr, hrv, sleep (h), weight (kg), bf (%), cardio[]}.
   A row only carries the values that were really there: blanks, 0, "NaN" and out-of-range numbers are dropped and
   reported in `issues`, never stored. One bad field never rejects the rest of the row. */
const HX_FIELDS = ["steps", "kcal", "rhr", "hrv", "sleep", "weight", "bf"];
const HX_LABEL = { steps: "Steps", kcal: "Active energy", rhr: "Resting HR", hrv: "HRV", sleep: "Sleep", weight: "Weight", bf: "Body fat" };
const HX_SUM = { steps: 1, kcal: 1, sleep: 1 };
const HX_RANGE = { steps: [1, 150000], kcal: [1, 15000], rhr: [25, 220], hrv: [1, 400], sleep: [0.1, 24], weight: [20, 320], bf: [2, 70] };
const HX_ALIAS = {
  date: "date", d: "date", day: "date", datetime: "date", timestamp: "date",
  unit: "unit", u: "unit", units: "unit", weightunit: "unit",
  steps: "steps", step: "steps", stepcount: "steps", s: "steps", stepswatch: "steps_a", stepsphone: "steps_b", stepsiphone: "steps_b",
  kcal: "kcal", activeenergy: "kcal", activeenergyburned: "kcal", activecalories: "kcal", activekcal: "kcal", energy: "kcal", calories: "kcal",
  rhr: "rhr", restingheartrate: "rhr", restinghr: "rhr", resthr: "rhr",
  hrv: "hrv", heartratevariability: "hrv", hrvsdnn: "hrv", heartratevariabilitysdnn: "hrv",
  sleep: "sleep", sleeph: "sleep", sleephours: "sleep", sleepanalysis: "sleep", asleep: "sleep", timeasleep: "sleep", sleepduration: "sleep",
  weight: "weight", w: "weight", bodymass: "weight", weightbodymass: "weight", bodyweight: "weight", weightkg: "weight_kg", weightlb: "weight_lb", weightlbs: "weight_lb",
  bf: "bf", bodyfat: "bf", bodyfatpercentage: "bf", bodyfatpercent: "bf", bodyfatpct: "bf",
  cardio: "cardio"
};
const HX_EMPTY = /^(|nan|null|nil|none|undefined|n\/a|na|-+|—|no data|not set|\(null\))$/i;
const hxPad = n => String(n).padStart(2, "0");
const hxISO = d => d.getFullYear() + "-" + hxPad(d.getMonth() + 1) + "-" + hxPad(d.getDate());
const hxShift = (iso, n) => { const p = iso.split("-").map(Number), d = new Date(p[0], p[1] - 1, p[2] + n); return hxISO(d) };

/* "8,421", "8.421", "165,4", "1,234.5" -> number. Whole-number fields read a 3-digit group as thousands. */
function hxNumStr(s, whole) {
  s = s.replace(/[\s'  ]/g, "");
  const c = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) && (whole || s.split(",").length > 2) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  else if (p >= 0 && whole && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
/* One sample -> {v, u}. Understands numbers, {qty}/{value} objects, "72 bpm", "150 lb", "7:30", "7 hr 30 min". */
function hxOne(t, whole) {
  if (typeof t === "number") return isFinite(t) ? { v: t, u: "" } : null;
  if (t && typeof t === "object") return hxOne(t.qty ?? t.value ?? t.Value ?? t.quantity ?? t.avg ?? t.Avg, whole);
  let s = String(t ?? "").trim();
  if (HX_EMPTY.test(s)) return null;
  if (whole) s = s.replace(/^(\d{1,3})((?: \d{3})+)(?!\d)/, (a, h, g) => h + g.replace(/ /g, "")); /* "1 850" */
  let m = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (m) return { v: +m[1] + m[2] / 60 + (m[3] || 0) / 3600, u: "h" };
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?)\b\.?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minutes?)\b)?/i);
  if (m) return { v: hxNumStr(m[1]) + (m[2] ? hxNumStr(m[2]) / 60 : 0), u: "h" };
  m = s.match(/(-?\d[\d.,'  ]*)\s*([a-zµ%/]*)/i);
  if (!m) return null;
  const v = hxNumStr(m[1].replace(/[.,]+$/, ""), whole);
  return v === null ? null : { v, u: (m[2] || "").toLowerCase() };
}
/* A field value -> one number. Lists (JSON arrays, or one sample per line as Shortcuts sends them) are summed
   for steps / energy / sleep, averaged for heart metrics, and the last one wins for weight. 0 means "no sample". */
function hxVal(raw, f) {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\r\n;]+/) : [raw];
  const xs = list.map(t => hxOne(t, f === "steps" || f === "kcal")).filter(x => x && x.v > 0);
  if (!xs.length) return null;
  const vs = xs.map(x => x.v), sum = vs.reduce((a, b) => a + b, 0);
  return { v: HX_SUM[f] ? sum : f === "weight" ? vs[vs.length - 1] : sum / vs.length, u: (xs.find(x => x.u) || {}).u || "", n: xs.length };
}
function hxDate(v, today) {
  const s = String(v ?? "").trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return { d: m[1] + "-" + hxPad(+m[2]) + "-" + hxPad(+m[3]) };
  if (!HX_EMPTY.test(s)) {
    const d = new Date(s.replace(/\bat\b/i, " ").replace(/[  ]/g, " "));
    if (!isNaN(d) && d.getFullYear() > 2000) return { d: hxISO(d) };
    return { d: today || null, bad: 1 };
  }
  return { d: today || null };
}
const hxIsEmpty = v => v == null || (typeof v === "string" && HX_EMPTY.test(v.trim())) || (Array.isArray(v) && !v.length);
/* One loose object -> one clean row, or null when nothing in it is usable. */
function hxRow(o, opt, issues) {
  if (!o || typeof o !== "object") return null;
  const c = {};
  for (const k in o) { const a = HX_ALIAS[String(k).toLowerCase().replace(/[^a-z]/g, "")]; if (a && c[a] === undefined) c[a] = o[k] }
  const today = opt.today || hxISO(new Date()), dt = hxDate(c.date, today), date = dt.d;
  const bad = (field, raw, why) => issues.push({ date, field, raw: String(typeof raw === "object" ? JSON.stringify(raw) : raw).slice(0, 60), why });
  if (!date) return null;
  if (dt.bad) bad("date", c.date, "date not understood, used today");
  if (date > hxShift(today, 1)) { bad("date", c.date, "date is in the future, row skipped"); return null }
  if (c.weight === undefined && c.weight_kg !== undefined) { c.weight = c.weight_kg; c.unit = "kg" }
  if (c.weight === undefined && c.weight_lb !== undefined) { c.weight = c.weight_lb; c.unit = "lb" }
  const r = { date }, unit = String(c.unit || opt.unit || "kg").toLowerCase();
  for (const f of HX_FIELDS) {
    let raw = c[f];
    if (f === "steps" && (c.steps_a !== undefined || c.steps_b !== undefined)) {
      /* watch and phone sent separately: Health's merged total is at least the larger one, and adding them double counts */
      const best = [raw, c.steps_a, c.steps_b].map(x => hxVal(x, f)).filter(Boolean).sort((a, b) => b.v - a.v)[0];
      raw = best ? best.v : raw;
    }
    if (hxIsEmpty(raw)) continue;
    const x = hxVal(raw, f);
    if (!x) { if (!/^[\s0.,]*$/.test(String(raw))) bad(f, raw, "not a number"); continue }
    let v = x.v;
    if (f === "kcal" && /kj/.test(x.u)) v /= 4.184;
    if (f === "sleep") v = /^(m|min|mins|minutes?)$/.test(x.u) ? v / 60 : /^(s|sec|secs|seconds?)$/.test(x.u) ? v / 3600 : x.u === "h" || /^(hr|hrs|hours?)$/.test(x.u) ? v : v > 1440 ? v / 3600 : v > 24 ? v / 60 : v;
    if (f === "weight") { const u = /lb|pound/.test(x.u) ? "lb" : /kg/.test(x.u) ? "kg" : /^st/.test(x.u) ? "st" : unit; v = u.startsWith("lb") ? v / 2.20462 : u === "st" ? v * 6.35029 : v }
    if (f === "bf" && v <= 1) v *= 100;
    const [lo, hi] = HX_RANGE[f];
    if (!(v >= lo && v <= hi)) { bad(f, raw, "outside the plausible range, ignored"); continue }
    r[f] = f === "steps" || f === "kcal" ? Math.round(v) : f === "bf" ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  }
  if (Array.isArray(c.cardio)) {
    const cd = c.cardio.slice(0, 20).map(w => {
      if (!w || typeof w !== "object") return null;
      const n = (k, lo, hi) => { const x = hxVal(w[k], k); return x && x.v >= lo && x.v <= hi ? x.v : undefined };
      const min = n("min", 1, 1440); if (!min) return null;
      const e = { type: String(w.type || w.name || "Workout").slice(0, 40), min: Math.round(min) }, kc = n("kcal", 1, 10000), hr = n("hr", 30, 230), km = n("km", 0.01, 500);
      if (kc) e.kcal = Math.round(kc); if (hr) e.hr = Math.round(hr); if (km) e.km = Math.round(km * 100) / 100;
      return e;
    }).filter(Boolean);
    if (cd.length) r.cardio = cd;
  }
  return Object.keys(r).length > 1 ? r : null;
}
/* Two rows for the same day. Within one payload (iPhone + Watch duplicates) totals keep the larger value;
   across syncs the newer value replaces the older one. A missing value never replaces a present one. */
function hxMerge(a, b, same) {
  if (!a) return b;
  const o = Object.assign({}, a);
  for (const f of HX_FIELDS) if (b[f] != null) o[f] = same && HX_SUM[f] && a[f] != null ? Math.max(a[f], b[f]) : b[f];
  if (b.cardio && b.cardio.length) { const seen = new Set(), k = x => x.type + "|" + x.min; o.cardio = (same ? (a.cardio || []).concat(b.cardio) : b.cardio).filter(x => !seen.has(k(x)) && seen.add(k(x))) }
  return o;
}
/* Health Auto Export {data:{metrics:[], workouts:[]}} -> loose day objects. */
function hxHAE(data) {
  const day = v => String(v || "").slice(0, 10), num = v => { const x = hxOne(v); return x ? x.v : NaN };
  const D = {}, at = d => (D[d] = D[d] || { date: d, _n: {} });
  const add = (d, k, v, mode) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isFinite(v)) return;
    const r = at(d);
    if (mode === "sum") r[k] = (r[k] || 0) + v;
    else if (mode === "avg") { r._n[k] = (r._n[k] || 0) + 1; r[k] = ((r[k] || 0) * (r._n[k] - 1) + v) / r._n[k] }
    else r[k] = v;
  };
  for (const m of data.metrics || []) {
    if (!m) continue;
    const name = String(m.name || "").toLowerCase(), units = String(m.units || "").toLowerCase(), pts = Array.isArray(m.data) ? m.data : [];
    for (const p of pts) {
      if (!p) continue;
      const d = day(p.date || p.startDate || p.sleepStart), q = num(p.qty ?? p.Avg ?? p.avg);
      if (name === "step_count") add(d, "steps", q, "sum");
      else if (name === "active_energy") add(d, "kcal", /kj/.test(units) ? q / 4.184 : q, "sum");
      else if (name === "resting_heart_rate") add(d, "rhr", q, "avg");
      else if (name === "heart_rate_variability") add(d, "hrv", q, "avg");
      else if (name === "body_fat_percentage") add(d, "bf", q, "last");
      else if (name === "weight_body_mass") { add(d, "weight", q, "last"); if (isFinite(q)) at(d).unit = /lb/.test(units) ? "lb" : "kg" }
      else if (name === "sleep_analysis") {
        let h = num(p.totalSleep ?? p.asleep);
        if (!isFinite(h)) h = ["core", "deep", "rem"].reduce((a, k) => a + (num(p[k]) || 0), 0) || q;
        if (/min/.test(units)) h = h / 60;
        add(day(p.sleepEnd || p.date), "sleep", h, "sum");
      }
    }
  }
  const T = s => new Date(String(s).replace(" ", "T").replace(/ ([+-]\d\d)(\d\d)$/, "$1:$2"));
  for (const w of data.workouts || []) {
    if (!w) continue;
    const d = day(w.start || w.startDate || w.date);
    let dur = num(w.duration);
    if (!isFinite(dur) && w.start && w.end) dur = (T(w.end) - T(w.start)) / 1000;
    const min = dur > 300 ? dur / 60 : dur;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(min > 0)) continue;
    const e = w.activeEnergyBurned || w.activeEnergy, dist = w.distance;
    const kcal = e ? (/kj/i.test(e.units || "") ? num(e) / 4.184 : num(e)) : undefined;
    const km = dist ? (/mi/i.test(dist.units || "") ? num(dist) * 1.60934 : /^m$/i.test(dist.units || "") ? num(dist) / 1000 : num(dist)) : undefined;
    (at(d).cardio = at(d).cardio || []).push({ type: w.name || "Workout", min, kcal, hr: num(w.avgHeartRate ?? (w.heartRate && w.heartRate.avg)), km });
  }
  return Object.values(D).map(r => { delete r._n; return r });
}
/* Text -> object. Tries JSON, then repaired JSON (Shortcuts leaves `"steps":,` when a value is empty),
   then a URL query, then CSV lines "date, weight, steps[, sleep, rhr, hrv, kcal]". */
function hxText(txt, issues) {
  let s = String(txt ?? "").replace(/^﻿/, "").trim();
  if (!s) return null;
  if (s[0] === "{" || s[0] === "[") {
    try { return JSON.parse(s) } catch (e) { /* try to repair below */ }
    const fixed = s.replace(/:\s*(?=[,}\]])/g, ":null").replace(/:\s*(NaN|nan|undefined|-?Infinity)\s*(?=[,}\]])/g, ":null").replace(/,\s*(?=[}\]])/g, "").replace(/[“”]/g, '"');
    try { const j = JSON.parse(fixed); issues.push({ field: "body", raw: "", why: "JSON had empty values; repaired" }); return j } catch (e) { issues.push({ field: "body", raw: s.slice(0, 60), why: "not valid JSON" }); return null }
  }
  if (/^[#?]?[^\s=,]*=/.test(s) && !/\n/.test(s)) {
    const o = {};
    new URLSearchParams(s.replace(/^[#?]/, "")).forEach((v, k) => { if (o[k] === undefined) o[k] = v });
    for (const k of ["health", "payload", "json", "data"]) if (typeof o[k] === "string" && /^\s*[{[]/.test(o[k])) return hxText(o[k], issues);
    if (typeof o.h === "string") return hxCSV(o.h, o.u);
    return o;
  }
  return hxCSV(s);
}
function hxCSV(s, unit) {
  const lines = String(s).split(/[\r\n;]+/).map(l => l.split(/[,\t]/).map(x => x.trim())).filter(c => c.length >= 2);
  if (!lines.length) return null;
  let cols = ["date", "weight", "steps", "sleep", "rhr", "hrv", "kcal"];
  if (!/\d{4}/.test(lines[0][0]) && lines[0].some(x => HX_ALIAS[x.toLowerCase().replace(/[^a-z]/g, "")])) cols = lines.shift().map(x => x.toLowerCase());
  return lines.filter(c => /\d/.test(c[0])).map(c => { const o = unit ? { unit } : {}; cols.forEach((k, i) => { if (c[i] !== undefined) o[k] = c[i] }); return o });
}
/* Any supported shape -> list of loose day objects. */
function hxExpand(b) {
  if (typeof b === "string") return [];
  if (!b || typeof b !== "object") return [];
  if (Array.isArray(b)) return b.flatMap(x => (x && typeof x === "object" && !Array.isArray(x) && (Array.isArray(x.metrics) || Array.isArray(x.rows) || x.data) ? hxExpand(x) : [x]));
  const inherit = rows => rows.map(r => (r && typeof r === "object" && b.unit && r.unit === undefined ? Object.assign({ unit: b.unit }, r) : r));
  if (Array.isArray(b.rows)) return inherit(b.rows);
  const data = b.data && typeof b.data === "object" && !Array.isArray(b.data) ? b.data : b;
  if (Array.isArray(data.metrics) || Array.isArray(data.workouts)) return hxHAE(data);
  if (Array.isArray(b.data)) return inherit(b.data);
  if (b.payload && typeof b.payload === "object") return inherit(hxExpand(b.payload));
  const keys = Object.keys(b);
  if (keys.length && keys.every(k => /^\d{4}-\d{1,2}-\d{1,2}/.test(k))) return keys.map(k => (b[k] && typeof b[k] === "object" ? Object.assign({ date: k }, b[k]) : null));
  return [b];
}
/* The one entry point. input: string or object. opt: {today:"YYYY-MM-DD", unit:"kg"|"lb"}.
   Returns {rows, issues}. Never throws. */
function hxNormalize(input, opt) {
  opt = opt || {};
  const issues = [], out = {};
  try {
    const body = typeof input === "string" ? hxText(input, issues) : input;
    for (const o of hxExpand(body)) { const r = hxRow(o, opt, issues); if (r) out[r.date] = hxMerge(out[r.date], r, true) }
  } catch (e) { issues.push({ field: "body", raw: "", why: "could not read the payload: " + (e && e.message) }) }
  return { rows: Object.values(out).sort((a, b) => (a.date < b.date ? -1 : 1)), issues };
}
/*HX-END*/

// Rows for the health_ingest RPC. Weight is always kilograms here.
export function toRows(body, opt) {
  return hxNormalize(body, opt).rows.map(r => (r.weight != null ? Object.assign({ unit: "kg" }, r) : r));
}
export { hxNormalize, hxMerge, HX_FIELDS, HX_LABEL };
