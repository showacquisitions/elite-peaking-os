// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// POST https://<project>.supabase.co/functions/v1/health?t=<sync key>
// Body: Health Auto Export JSON, a single day {date, steps, weight, unit, sleep, rhr, hrv, kcal}, or a list of days.
// The sync key is the only credential. It is checked inside health_ingest (hashed), never here.
import { toRows } from "./parse.mjs";
const URL_ = Deno.env.get("SUPABASE_URL") ?? "https://yimjcsyhvoviliupwayl.supabase.co";
const KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_bw3A2LHIyEYbvsWSDPQm3g_8UKLz0Ig";
const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-health-token" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: H });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  if (req.method !== "POST") return out({ ok: false, error: "POST only" }, 405);
  const u = new URL(req.url);
  let body: any;
  try { body = await req.json(); } catch { return out({ ok: false, error: "Body must be JSON" }, 400); }
  const token = u.searchParams.get("t") || req.headers.get("x-health-token") || (body && body.token) || "";
  if (!token) return out({ ok: false, error: "Missing sync key (?t=...)" }, 401);
  const rows = toRows(body);
  if (!rows.length) return out({ ok: true, days: 0 });
  const chunks = [];
  for (let i = 0; i < rows.length; i += 400) chunks.push(rows.slice(i, i + 400));
  let days = 0;
  for (const c of chunks) {
    const r = await fetch(URL_ + "/rest/v1/rpc/health_ingest", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ token, payload: c }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) return out({ ok: false, error: (j && (j.message || j.msg)) || "HTTP " + r.status }, r.status === 400 && /token/i.test(JSON.stringify(j)) ? 401 : r.status);
    days += (j && j.days) || 0;
  }
  return out({ ok: true, days });
});
