// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// Turns a Health Auto Export body, a Shortcut body, or a list of days into health_ingest rows.
// Pure function, no I/O, shared by the edge function and the tests.
export function toRows(body) {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.rows)) return body.rows;
  const data = body.data && typeof body.data === "object" ? body.data : body;
  if (!Array.isArray(data.metrics) && !Array.isArray(data.workouts)) {
    const p = body.payload && typeof body.payload === "object" ? body.payload : body;
    return Array.isArray(p) ? p : [p];
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
