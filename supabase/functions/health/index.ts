// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// POST (or GET) https://<project>.supabase.co/functions/v1/health?t=<sync key>&tz=<IANA zone>&u=<kg|lb>
// Accepts, in the body and/or the query string: Health Auto Export JSON, one day
// {date, steps, weight, unit, sleep, rhr, hrv, kcal, bf}, a list of days, form fields, or plain "key=value" text.
// Every value may be blank, "NaN", a unit-suffixed string ("72 bpm") or a list with one sample per line.
// Missing or unreadable values are skipped and reported in `ignored`; they never fail the request and never
// overwrite a stored value. The sync key is the only credential; it is checked (hashed) inside health_ingest.
import { hxNormalize, hxMerge } from "./parse.mjs";
const URL_ = Deno.env.get("SUPABASE_URL") ?? "https://yimjcsyhvoviliupwayl.supabase.co";
const KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_bw3A2LHIyEYbvsWSDPQm3g_8UKLz0Ig";
const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-health-token", "Access-Control-Allow-Methods": "POST, GET, PUT, OPTIONS", "Cache-Control": "no-store" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
// "Today" where the phone is, not where the server is: 9 PM in Los Angeles is already tomorrow in UTC.
function todayIn(tz: string | null) {
  try { if (tz) return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { /* unknown zone: fall through */ }
  return new Date().toISOString().slice(0, 10);
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  if (!["POST", "GET", "PUT"].includes(req.method)) return out({ ok: false, error: "Use POST" }, 405);
  const u = new URL(req.url), q: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { if (q[k] === undefined) q[k] = v; });
  const text = req.method === "GET" ? "" : await req.text().catch(() => "");
  let bodyToken = "";
  try { const j = JSON.parse(text); if (j && typeof j.token === "string") bodyToken = j.token; } catch { /* not JSON: fine */ }
  const token = q.t || req.headers.get("x-health-token") || bodyToken || "";
  if (!token) return out({ ok: false, error: "Missing sync key (?t=...)" }, 401);
  const opt = { today: todayIn(q.tz || null), unit: /^lb/i.test(q.u || "") ? "lb" : /^kg/i.test(q.u || "") ? "kg" : undefined };
  delete q.t; delete q.tz; delete q.u;
  const a = hxNormalize(text, opt), b = Object.keys(q).length ? hxNormalize(q, opt) : { rows: [], issues: [] };
  const D: Record<string, any> = {};
  for (const r of a.rows.concat(b.rows)) D[r.date] = hxMerge(D[r.date], r, true);
  const rows = Object.values(D).map((r: any) => (r.weight != null ? { unit: "kg", ...r } : r));
  const ignored = a.issues.concat(b.issues).slice(0, 20);
  const fields = Object.fromEntries(rows.map((r: any) => [r.date, Object.keys(r).filter(k => k !== "date" && k !== "unit")]));
  if (!rows.length) return out({ ok: true, days: 0, fields, ignored, note: "Nothing usable in this request. Nothing was changed." });
  let days = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const r = await fetch(URL_ + "/rest/v1/rpc/health_ingest", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ token, payload: rows.slice(i, i + 400) }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) return out({ ok: false, error: (j && (j.message || j.msg)) || "HTTP " + r.status }, r.status === 400 && /token/i.test(JSON.stringify(j)) ? 401 : r.status);
    days += (j && j.days) || 0;
  }
  return out({ ok: true, days, fields, ignored });
});
