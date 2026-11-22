// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID), WebCrypto only.
// Runs unchanged in Deno (Supabase Edge Functions) and Node 20+. No dependencies.
const te = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length } return o };
async function hmac(key, data) { const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", k, data)) }

/* Derives the content key and nonce shared by both encrypt and decrypt (RFC 8291 §3.4, RFC 8188 §2.2). */
export async function deriveKeys(shared, authSecret, uaPub, asPub, salt) {
  const prkKey = await hmac(authSecret, shared);
  const ikm = (await hmac(prkKey, cat(te.encode("WebPush: info\0"), uaPub, asPub, new Uint8Array([1])))).slice(0, 32);
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  return { cek, nonce };
}

/* Encrypts payload for one subscription {keys:{p256dh, auth}}. Returns the request body. */
export async function encrypt(sub, payload) {
  const uaPub = unb64u(sub.keys.p256dh), authSecret = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await deriveKeys(shared, authSecret, uaPub, asPub, salt);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = cat(typeof payload === "string" ? te.encode(payload) : payload, new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/* VAPID JWT (ES256). privJwk: {kty,crv,x,y,d}. */
export async function vapidAuth(endpoint, privJwk, subject) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const h = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const c = b64u(te.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", privJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(h + "." + c));
  const pub = cat(new Uint8Array([4]), unb64u(privJwk.x), unb64u(privJwk.y));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${b64u(pub)}`;
}

/* RFC 8030 Topic: <= 32 base64url chars. Hash rather than truncate: "msg:<coach uuid><client uuid>" cut to 32
   chars keeps only the coach id, so one client's pending message would replace another's on the coach's device. */
export const topicOf = async tag => b64u(await crypto.subtle.digest("SHA-256", te.encode(String(tag || "")))).slice(0, 32);

/* True when a failed send points at this endpoint, so it may count toward pruning. 401/403/BadJwtToken = our VAPID
   key, 413 = our payload, 429/5xx = transient: those hit every subscription at once and must never delete them.
   404/410 are handled by the caller as already-dead. */
export const endpointFault = (status, reason) => status >= 400 && status < 500 && ![401, 403, 404, 410, 413, 429].includes(status) && !/jwt|vapid/i.test(reason || "");

/* Sends one push. Returns the HTTP status (201 ok; 404/410 means the subscription is gone). */
export async function sendPush(sub, data, privJwk, subject, opts = {}) {
  const body = await encrypt(sub, JSON.stringify(data));
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(opts.ttl ?? 3600), Urgency: opts.urgency || "high", ...(opts.topic ? { Topic: opts.topic } : {}), Authorization: await vapidAuth(sub.endpoint, privJwk, subject) },
    body,
  });
  /* push services explain a rejection in the body (Apple: {"reason":"BadJwtToken"}); hand it to the caller for the log */
  if (!r.ok && opts.detail) opts.detail.reason = (await r.text().catch(() => "")).slice(0, 200);
  return r.status;
}
