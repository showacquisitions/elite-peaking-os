// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// Push sender. Woken by pg_net (public.push_kick) every 5 s when a notification is due, and right after instant events.
// Auth: x-push-secret must match Vault 'push_cron_secret' (checked in SQL). VAPID private key also comes from Vault.
import { sendPush } from "./webpush.mjs";
const URL_ = Deno.env.get("SUPABASE_URL") ?? "https://yimjcsyhvoviliupwayl.supabase.co";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUBJECT = "https://showacquisitions.github.io/elite-peaking-os/";
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const rpc = async (fn: string, args: unknown) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SRK, Authorization: "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${fn}: ${(j && (j.message || j.msg)) || r.status}`);
  return j;
};
Deno.serve(async req => {
  if (req.method !== "POST") return out({ ok: false }, 405);
  if (!SRK) return out({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  try {
    const auth = await rpc("push_check", { s: req.headers.get("x-push-secret") || "" });
    if (!auth || !auth.ok) return out({ ok: false }, 401);
    if (!auth.vapid) return out({ ok: false, error: "push_vapid_private not set in Vault" }, 500);
    const jwk = JSON.parse(auth.vapid);
    let sent = 0, failed = 0;
    const ok: string[] = [], dead: string[] = [];
    for (let round = 0; round < 5; round++) {
      const items = await rpc("push_claim", { lim: 100 });
      if (!items || !items.length) break;
      await Promise.all(items.flatMap((it: any) => (it.subs || []).map(async (s: any) => {
        try {
          const st = await sendPush(s, { title: it.title, body: it.body, url: it.url || "./", tag: it.tag, cat: it.cat }, jwk, SUBJECT, { ttl: it.cat === "rest" ? 300 : 86400, urgency: it.cat === "rem" ? "normal" : "high", topic: it.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined });
          if (st >= 200 && st < 300) { sent++; ok.push(s.endpoint) }
          else { failed++; if (st === 404 || st === 410) dead.push(s.endpoint); console.warn("push status", st, new URL(s.endpoint).host) }
        } catch (e) { failed++; console.warn("push error", String(e)) }
      })));
    }
    if (ok.length || dead.length) await rpc("push_result", { ok_eps: ok, dead_eps: dead });
    return out({ ok: true, sent, failed, removed: dead.length });
  } catch (e) { console.error(String(e)); return out({ ok: false, error: String(e) }, 500) }
});
