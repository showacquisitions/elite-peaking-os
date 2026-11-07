// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// Turns a Health Auto Export body, a Shortcut body, or a list of days into health_ingest rows.
// Pure function, no I/O, shared by the edge function and the tests.
// Shortcuts hands over text, not numbers: "8,421", "72,5", "7 hr 12 min", "7:12:00", dates like 11/6/2026. Normalise before the database sees it.
const ALIAS = { step_count: "steps", stepcount: "steps", active_energy: "kcal", activeenergy: "kcal", calories: "kcal", resting_heart_rate: "rhr", restingheartrate: "rhr", heart_rate_variability: "hrv", heartratevariability: "hrv", weight_body_mass: "weight", bodyweight: "weight", body_weight: "weight", sleep_analysis: "sleep", sleephours: "sleep" };
export function cleanNum(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return t.replace(/,/g, "");
  if (/^-?\d+,\d{1,2}$/.test(t)) return t.replace(",", ".");
  return t;
}
export function cleanHours(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  let m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) return +m[1] + +m[2] / 60 + (+m[3] || 0) / 3600;
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(t), mi = /(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i.exec(t), se = /(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i.exec(t);
  if (h || mi || se) return (h ? parseFloat(h[1].replace(",", ".")) : 0) + (mi ? parseFloat(mi[1].replace(",", ".")) / 60 : 0) + (se ? parseFloat(se[1].replace(",", ".")) / 3600 : 0);
  return cleanNum(t);
}
export function cleanDate(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  let m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/.exec(t); // US order, as an iPhone set to the US writes it
  if (m && +m[1] <= 12) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(t);
  return isNaN(d) ? v : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function cleanRow(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return r;
  const o = {};
  const un = v => (v && typeof v === "object" && !Array.isArray(v) ? (v.value ?? v.qty ?? v.amount ?? v.quantity ?? v) : v); // a Shortcuts variable can arrive as a small dictionary
  for (const [k, v0] of Object.entries(r)) { const v = un(v0); const key = String(k).trim().toLowerCase().replace(/\s+/g, "_"); o[ALIAS[key] || key] = v; }
  if (o.date != null) o.date = cleanDate(o.date);
  for (const k of ["steps", "kcal", "rhr", "hrv", "weight"]) if (o[k] != null) o[k] = cleanNum(o[k]);
  if (o.sleep != null) o.sleep = cleanHours(o.sleep);
  return o;
}
export function toRows(body) {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body)) return body.map(cleanRow);
  if (Array.isArray(body.rows)) return body.rows.map(cleanRow);
  const data = body.data && typeof body.data === "object" ? body.data : body;
  if (!Array.isArray(data.metrics) && !Array.isArray(data.workouts)) {
    const p = body.payload && typeof body.payload === "object" ? body.payload : body;
    return (Array.isArray(p) ? p : [p]).map(cleanRow);
  }
  const day = v => String(v || "").slice(0, 10);
  const num = v => (v && typeof v === "object" ? num(v.qty ?? v.value) : (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""))));
  const D = {}, at = d => (D[d] = D[d] || { date: d, _n: {} });
  const add = (d, k, v, mode) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isFinite(v)) return;
    const r = at(d);
    if (mode === "sum") r[k] = (r[k] || 0) + v;
    else if (mode === "avg") { r._n[k] = (r._n[k] || 0) + 1; r[k] = ((r[k] || 0) * (r._n[k] - 1) + v) / r._n[k]; }
    else r[k] = v;
  };
  for (const m of data.metrics || []) {
    const name = String(m.name || "").toLowerCase(), units = String(m.units || "").toLowerCase(), pts = Array.isArray(m.data) ? m.data : [];
    for (const p of pts) {
      const d = day(p.date || p.startDate || p.sleepStart), q = num(p.qty ?? p.Avg ?? p.avg);
      if (name === "step_count") add(d, "steps", q, "sum");
      else if (name === "active_energy") add(d, "kcal", /kj/.test(units) ? q / 4.184 : q, "sum");
      else if (name === "resting_heart_rate") add(d, "rhr", q, "avg");
      else if (name === "heart_rate_variability") add(d, "hrv", q, "avg");
      else if (name === "weight_body_mass") { add(d, "weight", q, "last"); at(d).unit = /lb/.test(units) ? "lb" : "kg"; }
      else if (name === "sleep_analysis") {
        let h = num(p.totalSleep ?? p.asleep);
        if (!isFinite(h)) h = ["core", "deep", "rem"].reduce((a, k) => a + (num(p[k]) || 0), 0) || q;
        const sd = day(p.sleepEnd || p.date);
        if (/min/.test(units)) h = h / 60;
        add(sd, "sleep", h, "sum");
      }
    }
  }
  for (const w of data.workouts || []) {
    const d = day(w.start || w.startDate || w.date);
    let dur = num(w.duration);
    if (!isFinite(dur) && w.start && w.end) dur = (new Date(w.end.replace(" ", "T").replace(/ ([+-]\d\d)(\d\d)$/, "$1:$2")) - new Date(w.start.replace(" ", "T").replace(/ ([+-]\d\d)(\d\d)$/, "$1:$2"))) / 1000;
    const min = dur > 300 ? dur / 60 : dur;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(min > 0)) continue;
    const e = w.activeEnergyBurned || w.activeEnergy, dist = w.distance;
    const kcal = e ? (/kj/i.test(e.units || "") ? num(e) / 4.184 : num(e)) : undefined;
    const km = dist ? (/mi/i.test(dist.units || "") ? num(dist) * 1.60934 : /^m$/i.test(dist.units || "") ? num(dist) / 1000 : num(dist)) : undefined;
    const hr = num(w.avgHeartRate ?? (w.heartRate && w.heartRate.avg));
    (at(d).cardio = at(d).cardio || []).push({ type: String(w.name || "Workout").slice(0, 40), min: Math.round(min), kcal: isFinite(kcal) ? Math.round(kcal) : undefined, hr: isFinite(hr) ? Math.round(hr) : undefined, km: isFinite(km) ? Math.round(km * 100) / 100 : undefined });
  }
  return Object.values(D).map(r => { delete r._n; ["steps", "kcal"].forEach(k => { if (r[k] != null) r[k] = Math.round(r[k]) }); ["rhr", "hrv", "sleep", "weight"].forEach(k => { if (r[k] != null) r[k] = Math.round(r[k] * 100) / 100 }); return r });
}
