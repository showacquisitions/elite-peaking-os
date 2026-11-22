/* Elite OS v5.0 — State, Midnight Rollover, Tombstone Sync, Coaching, Push & Health Client */
const KEY = "elitePeakingState_v3";
let TODAY = todayISO();
const DEFP = { sex: "m", age: 30, cm: 175, kg: 75, bf: 0, units: "imperial", goal: "recomp", rate: "cons", act: "mod", exp: "int", days: 4, len: 60, style: "cal", pullMax: 5, pushMax: 15, bagKg: 0, eq: ["pullbar", "bands"], pri: [], diet: "omni", excl: [], meals: 4, event: "", kcalAdj: 0, inj: [], budget: "std", priceF: 1, wtime: "17:30", mealRem: "no", autoSS: "off" };
function freshState() {
  return { prof: JSON.parse(JSON.stringify(DEFP)), log: {}, checks: {}, perf: {}, extra: {}, hist: {}, done: {}, prefs: { foods: {}, meals: {} }, recipes: [], groc: [], water: {}, swaps: {}, mswaps: {}, mealMult: {}, blockStart: mondayOf(TODAY), blockOffset: 0, weekOffset: 0, sel: TODAY, confirmed: false, flog: {}, sets: {}, steps: {}, stepsM: {}, wlog: {}, cardio: {}, supp: {}, nut: {}, favs: [], ux: {}, del: {}, cx: {}, hd: {}, cplan: { mode: "auto", deload: true, active: "p1", mt: 0, plans: { p1: { name: "My plan", mt: 0, days: {} } } } };
}
function loadState() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && v.prof) { const f = freshState(); return Object.assign(f, v, { prof: Object.assign(f.prof, v.prof) }); }
  } catch (e) { console.warn("state load failed", e); }
  return freshState();
}
let S = loadState(), W = null;
const SYNCKEYS = ["prof", "log", "checks", "perf", "extra", "hist", "done", "prefs", "recipes", "groc", "water", "swaps", "mswaps", "mealMult", "blockStart", "blockOffset", "confirmed", "flog", "sets", "steps", "stepsM", "cplan", "wlog", "cardio", "supp", "nut", "favs", "ux", "del"];
const MAPK = ["log", "checks", "perf", "extra", "hist", "done", "water", "swaps", "mswaps", "mealMult", "sets", "steps", "stepsM", "wlog", "cardio", "supp", "nut", "del"];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const metric = () => S.prof.units === "metric";
const r1 = x => Math.round(x * 10) / 10;
const dW = kg => r1(metric() ? kg : kg * LB), fromW = v => metric() ? v : v / LB;
const dL = cm => r1(metric() ? cm : cm / IN), fromL = v => metric() ? v : v * IN;
const wU = () => metric() ? "kg" : "lb", lU = () => metric() ? "cm" : "in";
const dateLabel = (s, o) => parseISO(s).toLocaleDateString(undefined, o || { weekday: "short", month: "short", day: "numeric" });
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const inFrame = () => { try { return window.self !== window.top; } catch (e) { return true; } };
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const obj4 = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const clamp01 = x => Math.max(0, Math.min(1, x));
const posNum = v => { v = parseFloat(v); return isFinite(v) && v > 0 ? v : null; };
const avgOf = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const NOW = () => Date.now();

function v4Norm() {
  S.supp = obj4(S.supp); S.nut = obj4(S.nut); S.ux = obj4(S.ux); S.hd = obj4(S.hd);
  S.del = obj4(S.del); S.stepsM = obj4(S.stepsM); S.mealMult = obj4(S.mealMult);
  S.favs = Array.isArray(S.favs) ? S.favs : [];
  if (S.ux.mode !== "guided" && S.ux.mode !== "pro") {
    S.ux.mode = Object.keys(S.hist || {}).length || Object.keys(S.wlog || {}).length ? "pro" : "guided";
  }
  if (!Array.isArray(S.ux.supps)) S.ux.supps = ["Creatine 5 g", "Protein shake", "Electrolytes"];
  return S.ux;
}
v4Norm();
const UX = () => S.ux && S.ux.mode ? S.ux : v4Norm();

function markDeleted(id) {
  if (!id) return;
  S.del = obj4(S.del);
  S.del[String(id)] = NOW();
  /* Prune tombstones older than 90 days */
  const cut = NOW() - 90 * 864e5;
  Object.keys(S.del).forEach(k => { if (S.del[k] < cut) delete S.del[k]; });
}

const snapOf = () => JSON.stringify(SYNCKEYS.map(k => S[k]));
let lastSnap = snapOf();
const save = () => {
  const sn = snapOf();
  if (sn !== lastSnap) {
    lastSnap = sn;
    S.mtime = Math.max(Date.now(), (S.mtime || 0) + 1);
    if (typeof SY !== "undefined" && SY.sess) schedulePush();
  }
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn("state save failed", e); }
};

/* Midnight rollover guard: keeps PWA accurate if left open overnight */
function syncToday() {
  const now = todayISO();
  if (now === TODAY) return false;
  const old = TODAY;
  TODAY = now;
  if (S.sel === old) S.sel = now;
  if (typeof logDate !== "undefined" && logDate === old) logDate = now;
  if (typeof regen === "function") { regen(); renderAll(true); }
  return true;
}

/* ---------- Cloud Sync (Supabase + Tombstone-Aware Merge) ---------- */
const SB_URL = "https://yimjcsyhvoviliupwayl.supabase.co";
const SB_KEY = "sb_publishable_bw3A2LHIyEYbvsWSDPQm3g_8UKLz0Ig";
const OWNK = "elitePeakingOwner";
const APP_URL = "https://showacquisitions.github.io/elite-peaking-os/";
let SY = (() => { try { return JSON.parse(localStorage.getItem("elitePeakingSync_v2") || "{}"); } catch (e) { return {}; } })();
const saveSY = () => { try { localStorage.setItem("elitePeakingSync_v2", JSON.stringify(SY)); } catch (e) {} };
let syncMsg = SY.sess ? "Signed in" : "Not signed in", pushT = null, syncing = false;
function setMsg(m) { syncMsg = m; const el = $("syncMsg"); if (el) el.textContent = m; }
function syncData() { return { mtime: S.mtime || Date.now(), data: Object.fromEntries(SYNCKEYS.map(k => [k, S[k]])) }; }
function applyData(d, mtime) {
  SYNCKEYS.forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
  S.prof = Object.assign(JSON.parse(JSON.stringify(DEFP)), S.prof);
  S.cplan = normCP(S.cplan);
  v4Norm();
  lastSnap = snapOf(); S.mtime = mtime || Date.now(); save(); regen(); renderAll();
}

/* Merge two devices' states: honors deletion tombstones so removed items never resurrect */
function mergeData(older, newer) {
  const o = JSON.parse(JSON.stringify(newer));
  const del = Object.assign({}, older.del || {}, newer.del || {});
  o.del = del;
  const alive = x => x && !(x.id && del[String(x.id)]);
  MAPK.forEach(k => { if (k !== "del") o[k] = Object.assign({}, older[k], newer[k]); });
  /* Per-day sets merge: keep longer / non-empty set list per uid|date */
  if (older.sets || newer.sets) {
    const ms = Object.assign({}, older.sets || {}, newer.sets || {});
    Object.keys(older.sets || {}).forEach(k => {
      const a = older.sets[k], b = (newer.sets || {})[k];
      if (Array.isArray(a) && Array.isArray(b) && a.length > b.length) ms[k] = a;
    });
    o.sets = ms;
  }
  ["recipes", "groc", "favs"].forEach(k => {
    const nw = (newer[k] || []).filter(alive), ids = new Set(nw.map(x => x.id));
    o[k] = nw.concat((older[k] || []).filter(x => alive(x) && !ids.has(x.id)));
  });
  {
    const a = older.flog || {}, b = newer.flog || {}, m = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(d => {
      const nw = (b[d] || []).filter(alive), ids = new Set(nw.map(x => x.id));
      const merged = nw.concat((a[d] || []).filter(x => alive(x) && !ids.has(x.id)));
      if (merged.length) m[d] = merged;
    });
    o.flog = m;
  }
  if (older.cplan || newer.cplan) o.cplan = mergeCP(older.cplan, newer.cplan);
  const po = older.prefs || {}, pn = newer.prefs || {};
  o.prefs = Object.assign({}, pn, { foods: Object.assign({}, po.foods, pn.foods), meals: Object.assign({}, po.meals, pn.meals) });
  return o;
}

async function sbFetch(path, opt, tok) {
  const o = opt || {};
  const r = await fetch(SB_URL + path, Object.assign({}, o, { headers: Object.assign({ apikey: SB_KEY, Authorization: "Bearer " + (tok || SB_KEY), "Content-Type": "application/json" }, o.headers) }));
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((j && (j.msg || j.error_description || j.message)) || "HTTP " + r.status); e.status = r.status; throw e; }
  return j;
}
function setSess(j) { SY.sess = { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, uid: j.user.id, email: j.user.email }; saveSY(); }
async function sbToken() {
  if (SY.sess.exp - 60000 < Date.now()) {
    try { setSess(await sbFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: SY.sess.rt }) })); }
    catch (e) { if (e.status) e.auth = true; throw e; }
  }
  return SY.sess.at;
}
async function startSession(j) {
  const own = localStorage.getItem(OWNK);
  if (own && own !== j.user.id) {
    const ok = await uiConfirm("This device holds another account's progress. Signing in replaces it on this device (that account's cloud copy is untouched). Continue?", { title: "Switch account", danger: true, okText: "Switch account" });
    if (!ok) { setMsg("Cancelled"); return false; }
    S = freshState(); S.mtime = 0; lastSnap = snapOf(); save(); regen(); renderAll();
  }
  localStorage.setItem(OWNK, j.user.id);
  setSess(j); SY.base = 0; saveSY(); renderSync(); syncNow();
  return true;
}
async function signIn(up) {
  const email = $("sbEmail").value.trim(), pw = $("sbPw").value;
  if (!email || pw.length < 6) { setMsg("Enter email and a password of 6+ characters"); return; }
  setMsg(up ? "Creating account…" : "Signing in…");
  try {
    const j = await sbFetch(up ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password: pw }) });
    if (!j.access_token) { setMsg("Check your email to confirm, then sign in"); return; }
    await startSession(j);
  } catch (e) { setMsg(e.status === 400 && !up ? "Wrong email or password" : e.message); }
}
async function delAccount() {
  const ok = await uiConfirm("Permanently delete your account and cloud data? Progress stored on this device is kept.", { title: "Delete account", danger: true, okText: "Delete cloud data" });
  if (!ok) return;
  try {
    if (typeof delPhotoCopies === "function") await delPhotoCopies();
    await sbFetch("/rest/v1/rpc/delete_me", { method: "POST", body: "{}" }, await sbToken());
    localStorage.removeItem(OWNK); SY = {}; saveSY(); renderSync(); setMsg("Account deleted");
  } catch (e) { setMsg(e.status === 404 ? "Delete is not set up. Run the setup SQL in Supabase" : e.message); }
}
async function findRemote(tok) { const rows = await sbFetch("/rest/v1/progress?select=data,mtime&user_id=eq." + SY.sess.uid, {}, tok); return rows[0] || null; }
async function pushNow(tok) {
  const d = syncData();
  await sbFetch("/rest/v1/progress?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: SY.sess.uid, mtime: d.mtime, data: d.data }) }, tok);
  if (!S.mtime) { S.mtime = d.mtime; save(); }
  return d.mtime;
}
function schedulePush() { clearTimeout(pushT); pushT = setTimeout(syncNow, 4000); }
async function syncNow() {
  if (!SY.sess || syncing) return;
  if (navigator.onLine === false) { setMsg("Offline. Changes are saved here and will sync when you reconnect"); return; }
  syncing = true; setMsg("Syncing…");
  try {
    const tok = await sbToken(), remote = await findRemote(tok), rm = remote ? +remote.mtime : 0, lm = S.mtime || 0, base = SY.base || 0, tm = new Date().toLocaleTimeString();
    if (remote && rm !== lm && rm > base && lm > base) {
      const mine = syncData().data, mt = Math.max(Date.now(), rm, lm) + 1;
      applyData(rm > lm ? mergeData(mine, remote.data) : mergeData(remote.data, mine), mt);
      SY.base = await pushNow(tok); setMsg("Merged edits from two devices " + tm);
    } else if (remote && rm > lm) { applyData(remote.data, rm); SY.base = rm; setMsg("Pulled newer data " + tm); }
    else if (!remote || rm < lm) { SY.base = await pushNow(tok); setMsg("Synced " + tm); }
    else { SY.base = rm; setMsg("Up to date " + tm); }
    saveSY();
    setTimeout(pullV3, 0);
  } catch (e) {
    if (e.auth || e.status === 401) { SY = {}; saveSY(); renderSync(); setMsg("Session expired, sign in again"); }
    else setMsg(e.status ? "Sync failed: " + e.message : "Can't reach the server. Will retry");
    console.warn("sync error", e);
  } finally { syncing = false; }
}
function renderSync() {
  const box = $("syncBox"); if (!box) return;
  setMsg(syncMsg);
  const row = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
  let h;
  if (SY.sess) {
    h = `<div class="d">Signed in as <b>${esc(SY.sess.email)}</b>. Your progress is private to this account and syncs automatically across devices.</div>
      <div style="${row}"><button class="btn pri" id="btnSyncNow">Sync now</button><button class="btn" id="btnSyncOff">Sign out</button></div>
      <h3>Danger zone</h3><div class="d">Deletes your account and the copy stored online. Progress already on this device stays.</div>
      <div style="${row}"><button class="btn danger" id="btnSbDel">Delete my account and cloud data</button></div>`;
  } else {
    h = `<div class="d">Create an account to sync your progress across phone and desktop.</div>
      <div style="${row}"><input type="email" id="sbEmail" placeholder="Email" autocomplete="email" style="flex:1;min-width:190px"/><input type="password" id="sbPw" placeholder="Password (6+ characters)" autocomplete="current-password" style="flex:1;min-width:190px"/></div>
      <div style="${row}"><button class="btn pri" id="btnSbIn">Sign in</button><button class="btn" id="btnSbUp">Create account</button><button class="btn" id="btnSbForgot">Forgot password?</button></div>`;
  }
  h += `<h3>Invite a friend</h3><div class="d">Shares the plain app link. Your friend starts with a fresh profile and never sees your data.</div><div style="margin-top:10px"><button class="btn pri" id="btnInvite">${ico("users", 15)} Invite a friend</button></div>`;
  h += `<h3>Move data without an account</h3><div class="d">Creates a private link containing <b>all your data</b>. Open only on your own devices.</div><div style="margin-top:10px"><button class="btn" id="btnSyncLink">${ico("link", 15)} Send my data to my other device</button></div>`;
  box.innerHTML = h;
  renderCoachProf(); renderPushProf();
}

async function toB64(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const buf = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let s = ""; buf.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function fromB64(t) {
  const s = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
  const buf = Uint8Array.from(s, c => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
}
const appURL = () => location.protocol.startsWith("http") ? location.origin + location.pathname : APP_URL;
async function inviteFriend() {
  const url = appURL(), text = "Training and nutrition planner I use. Free, no ads, works offline:";
  try {
    if (navigator.share) await navigator.share({ title: "Elite OS", text, url });
    else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast("App link copied (contains none of your data)", "good"); }
    else await uiPrompt("Copy this link", url, { title: "Invite a friend" });
  } catch (e) { if (e.name !== "AbortError") await uiPrompt("Copy this link", url, { title: "Invite a friend" }); }
}
async function shareLink() {
  const ok = await uiConfirm("This link contains ALL your data: weight, lifts, plans and notes.\n\nOnly use it to move your data to your own device. To invite a friend, use \"Invite a friend\" instead.", { title: "Create private data link", danger: true, okText: "Create link" });
  if (!ok) return;
  try {
    const url = location.href.split("#")[0] + "#s=" + await toB64(syncData());
    if (navigator.share) await navigator.share({ title: "My Elite OS data (private)", url });
    else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast("Private sync link copied", "good"); }
    else await uiPrompt("Copy this link", url, { title: "Private sync link" });
  } catch (e) { if (e.name !== "AbortError") toast("Could not make link: " + e.message, "warn"); }
}
async function importHash() {
  if (!location.hash.startsWith("#s=")) return;
  try {
    const r = await fromB64(location.hash.slice(3));
    history.replaceState(null, "", location.href.split("#")[0]);
    if (r && r.data && await uiConfirm("Replace this device's progress with the data from the link?", { title: "Import sync link", danger: true, okText: "Replace data" })) applyData(r.data);
  } catch (e) { toast("That sync link could not be read", "warn"); console.warn(e); }
}
async function forgotPw() {
  const email = ($("sbEmail") || {}).value ? $("sbEmail").value.trim() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) { setMsg("Type your email above, then tap Forgot password"); $("sbEmail") && $("sbEmail").focus(); return; }
  setMsg("Sending reset link…");
  try {
    await sbFetch("/auth/v1/recover?redirect_to=" + encodeURIComponent(appURL()), { method: "POST", body: JSON.stringify({ email }) });
    setMsg("If that email has an account, a reset link is on its way. Check spam too. Expires in 1 hour.");
  } catch (e) { setMsg(e.status === 429 ? "Too many emails sent. Wait a few minutes and try again." : "Could not send: " + e.message); }
}
function pwModal(j) {
  const m = document.createElement("div"); m.id = "pwModal"; m.className = "v3modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Set a new password");
  m.innerHTML = `<div class="v3card"><h2>Set a new password</h2><div class="d">For ${esc(j.user.email || "your account")}</div>
   <input type="password" id="pwNew" placeholder="New password (6+ characters)" autocomplete="new-password" style="width:100%;margin-top:10px"/>
   <input type="password" id="pwNew2" placeholder="Repeat it" autocomplete="new-password" style="width:100%;margin-top:8px"/>
   <div class="d" id="pwMsg" style="margin-top:8px"></div>
   <div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="pwSave">Save and sign in</button><button class="btn" id="pwCancel">Cancel</button></div></div>`;
  document.body.appendChild(m); $("pwNew").focus();
  const msg = t => { $("pwMsg").textContent = t; };
  $("pwCancel").onclick = () => m.remove();
  $("pwSave").onclick = async () => {
    const a = $("pwNew").value, b = $("pwNew2").value;
    if (a.length < 6) return msg("Use at least 6 characters.");
    if (a !== b) return msg("The two passwords do not match.");
    msg("Saving…");
    try {
      await sbFetch("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: a }) }, j.access_token);
      m.remove(); showTab("profile");
      if (await startSession(j)) setMsg("Password changed. You are signed in.");
    } catch (e) { msg(e.status === 422 ? "Pick a different password: " + e.message : "Could not save: " + e.message); }
  };
}
async function authHash() {
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|error_description|error)=/.test(h)) return false;
  const p = new URLSearchParams(h);
  history.replaceState(null, "", location.pathname + location.search);
  if (p.get("error") || p.get("error_description")) {
    showTab("profile");
    setMsg(/expired|invalid/i.test(p.get("error_description") || p.get("error_code") || "") ? "That email link has expired or was already used. Request a new one below." : "Email link failed: " + (p.get("error_description") || p.get("error")));
    return true;
  }
  const at = p.get("access_token"), type = p.get("type") || "";
  try {
    const user = await sbFetch("/auth/v1/user", {}, at);
    const j = { access_token: at, refresh_token: p.get("refresh_token"), expires_in: +p.get("expires_in") || 3600, user };
    if (type === "recovery") pwModal(j);
    else { showTab("profile"); if (await startSession(j)) setMsg(type === "signup" ? "Email confirmed. You are signed in." : "Signed in"); }
  } catch (e) { showTab("profile"); setMsg("That link could not be used: " + e.message); }
  return true;
}
function initSync() {
  authHash(); importHash();
  if (SY.sess) syncNow();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { syncToday(); if (SY.sess) syncNow(); } });
  setInterval(() => { syncToday(); if (document.visibilityState === "visible" && SY.sess) syncNow(); }, 60000);
  addEventListener("online", () => { if (SY.sess) syncNow(); });
  document.addEventListener("keydown", e => { if (e.key !== "Enter") return; const id = e.target.id; if (id === "sbPw" || id === "sbEmail") signIn(false); });
}

/* ---------- Coaching & Health Helpers ---------- */
const CXK = "eliteCoachOn", CNK = "eliteCoachName", HTK = "eliteHealthToken";
function cx() { const c = S.cx = obj4(S.cx); c.links = c.links || []; c.asg = c.asg || {}; c.msgs = c.msgs || []; c.ci = c.ci || {}; return c; }
const coachOn = () => lsGet(CXK) === "1";
const uidMe = () => SY.sess && SY.sess.uid;
const myCoaches = () => uidMe() ? cx().links.filter(l => l.client_id === uidMe()) : [];
const myClients = () => uidMe() ? cx().links.filter(l => l.coach_id === uidMe()) : [];
function cxHabits() { const o = []; myCoaches().forEach(l => (Array.isArray(l.habits) ? l.habits : []).forEach(h => { if (typeof h === "string" && h.trim() && o.length < 10) o.push({ t: h.trim().slice(0, 80), by: l.coach_name }); })); return o; }
const sbGet = async p => sbFetch(p, {}, await sbToken());
const sbRpc = async (fn, args) => sbFetch("/rest/v1/rpc/" + fn, { method: "POST", body: JSON.stringify(args || {}) }, await sbToken());
const sbUpsert = async (table, rows, onc) => sbFetch("/rest/v1/" + table + "?on_conflict=" + onc, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) }, await sbToken());
const sbDel = async p => sbFetch("/rest/v1/" + p, { method: "DELETE", headers: { Prefer: "return=minimal" } }, await sbToken());
const v3Err = e => e && (e.status === 404 || /relation|does not exist|schema cache/i.test(e.message)) ? "Coaching is not set up on the server yet. Run supabase/v3.sql." : (e && e.message) || "Failed";
const fmtTime = t => { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };

function healthParts(log, hd, date) {
  const h = hd && hd[date]; if (!h) return [];
  const base = k => { const v = []; for (let i = 1; i <= 14; i++) { const x = hd[addD(date, -i)]; if (x && +x[k] > 0) v.push(+x[k]); } return v.length >= 3 ? avgOf(v) : 0; };
  const out = [], bh = base("hrv"), br = base("rhr");
  if (+h.hrv > 0 && bh) out.push([0.3, clamp01((h.hrv / bh - 0.85) / 0.25)]);
  if (+h.rhr > 0 && br) out.push([0.15, clamp01(1 - (h.rhr - br) / 7)]);
  return out;
}

let cxPulling = false;
async function pullV3() {
  if (!SY.sess || cxPulling) return;
  cxPulling = true;
  try {
    S.hd = obj4(S.hd); const me = uidMe(), from = addD(TODAY, -21);
    const [links, asg, msgs, ci, hd] = await Promise.all([
      sbGet("/rest/v1/coach_links?select=coach_id,client_id,coach_name,client_name,habits,targets,client_read_at,share_photos"),
      sbGet(`/rest/v1/assignments?select=coach_id,date,session,note,updated_at&client_id=eq.${me}&date=gte.${from}`),
      sbGet(`/rest/v1/messages?select=id,coach_id,client_id,author,date,body,created_at&client_id=eq.${me}&order=created_at.desc&limit=60`),
      sbGet(`/rest/v1/checkins?select=week,data,reply,replied_at&client_id=eq.${me}&week=gte.${addD(TODAY, -70)}`),
      (q => sbGet(q("date,steps,weight_kg,sleep_h,rhr,hrv,kcal,cardio,updated_at,body_fat")).catch(e => e && e.status === 400 ? sbGet(q("date,steps,weight_kg,sleep_h,rhr,hrv,kcal,cardio,updated_at")) : Promise.reject(e)))(c => `/rest/v1/health_daily?select=${c}&user_id=eq.${me}&date=gte.${addD(TODAY, -90)}`)
    ]);
    const c = cx(), before = JSON.stringify([c.links, c.asg, c.msgs, c.ci, S.hd]);
    c.links = links || [];
    const tl = c.links.find(l => l.client_id === me && l.targets && l.targets.P > 0);
    c.targets = tl ? Object.assign({ by: tl.coach_name || "your coach" }, tl.targets) : null;
    const coachName = id => (c.links.find(l => l.coach_id === id) || {}).coach_name || "Coach";
    const A = {}; (asg || []).forEach(a => { if (!A[a.date] || A[a.date].mt < a.updated_at) A[a.date] = Object.assign({}, a.session, { note: a.note, coach: coachName(a.coach_id), mt: a.updated_at }); });
    c.asg = A; c.msgs = msgs || [];
    const C = {}; (ci || []).forEach(r => C[r.week] = r); c.ci = C;
    let dataChanged = false, newest = 0;
    const rows = (hd || []).map(r => {
      const o = { date: r.date };
      [["steps", "steps"], ["kcal", "kcal"], ["rhr", "rhr"], ["hrv", "hrv"], ["sleep_h", "sleep"], ["weight_kg", "weight"], ["body_fat", "bf"]].forEach(([a, b]) => { if (r[a] != null && +r[a] > 0) o[b] = +r[a]; });
      if (Array.isArray(r.cardio) && r.cardio.length) o.cardio = r.cardio;
      const t = Date.parse(r.updated_at || ""); if (t > newest) newest = t;
      return o;
    });
    if (hxUpsert(rows).changed) dataChanged = true;
    if (newest > (+lsGet(HXATK) || 0)) lsSet(HXATK, String(newest));
    const changed = dataChanged || before !== JSON.stringify([c.links, c.asg, c.msgs, c.ci, S.hd]);
    if (changed) { save(); regen(); renderAll(TAB === "profile" && document.activeElement && document.activeElement.closest && document.activeElement.closest("#pane-profile")); if (TAB !== "profile") renderCoachProf(); }
    renderNavCoach();
    pushReminders();
  } catch (e) { console.warn("v3 pull", e); }
  finally { cxPulling = false; }
}

function asgSession(a, dow, p, wk) {
  const s = customSessions({ cplan: { mode: "custom", deload: false, active: "c", plans: { c: { name: "c", days: { [dow]: { name: a.name, ex: a.ex || [] } } } } } }, p, wk);
  return s && s[0] ? Object.assign(s[0], { coach: a.coach || "Coach" }) : null;
}
function applyCoachTargets(T, st) {
  const t = st && st.cx && st.cx.targets; if (!t || !(t.P > 0)) return T;
  const kcal = 4 * t.P + 4 * t.C + 9 * t.F;
  return Object.assign({}, T, { P: +t.P, C: +t.C, F: +t.F, kcal, pct: T.tdee ? kcal / T.tdee - 1 : 0, fiber: 14 * kcal / 1000, coach: { name: t.by || "your coach", note: t.note || "" }, notes: T.notes.concat([`Calories and macros are set by ${t.by || "your coach"}${t.note ? ": " + t.note : ""}.`]) });
}
const msgHTML = (m, me) => `<div class="msg ${m.author === me ? "me" : ""}"><div>${esc(m.body)}</div><small>${m.date ? "About " + esc(dateLabel(m.date)) + " · " : ""}${esc(fmtTime(m.created_at))}</small></div>`;
async function sendMsg(coach_id, client_id, body, date, after) {
  body = String(body || "").trim().slice(0, 2000); if (!body) return;
  try {
    const o = { coach_id, client_id, body }; if (date) o.date = date;
    await sbFetch("/rest/v1/messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(o) }, await sbToken());
    if (after) await after();
  } catch (e) { toast("Message not sent: " + v3Err(e), "warn"); }
}
function clientUnread() {
  const me = uidMe(); if (!me) return 0;
  return cx().msgs.filter(m => m.author !== me && m.client_id === me && (() => { const l = cx().links.find(x => x.coach_id === m.coach_id && x.client_id === me); return !l || !l.client_read_at || m.created_at > l.client_read_at; })()).length;
}
function coachUnread() {
  return myClients().reduce((t, l) => t + (CO.msgs[l.client_id] || []).filter(m => m.author === l.client_id && (!l.coach_read_at || m.created_at > l.coach_read_at)).length, 0);
}
function setTabBadge(tab, n) {
  const b = document.querySelector(`.tab[data-tab="${tab}"]`); if (!b) return;
  let s = b.querySelector(".tbadge");
  if (n > 0) { if (!s) { s = document.createElement("span"); s.className = "tbadge"; b.appendChild(s); } s.textContent = n > 9 ? "9+" : n; }
  else if (s) s.remove();
}
function renderBadges() { setTabBadge("plan", SY.sess ? clientUnread() : 0); setTabBadge("coach", SY.sess && coachOn() ? coachUnread() : 0); }
let readBusy = false;
async function clientMarkRead() {
  if (readBusy || !SY.sess || document.visibilityState !== "visible" || TAB !== "plan" || !clientUnread()) return;
  readBusy = true; const now = new Date().toISOString();
  try { for (const l of myCoaches()) { await sbRpc("msg_read", { coach: l.coach_id, client: uidMe() }); l.client_read_at = now; } save(); } catch (e) {}
  readBusy = false; renderBadges();
}
async function coMarkRead(id) {
  const l = CO_link(id); if (!l) return;
  l.coach_read_at = new Date().toISOString(); renderBadges();
  try { await sbRpc("msg_read", { coach: uidMe(), client: id }); } catch (e) {}
}

function renderCoachToday() {
  const d = selDay(), a = cx().asg[d.date], box = $("coachBox");
  if (a && $("wList")) $("wList").insertAdjacentHTML("afterbegin", callout("coach", "target", (a.ex && a.ex.length ? "Assigned by " : "Rest day set by ") + esc(a.coach || "your coach"), "", a.note ? esc(a.note) : ""));
  const hs = cxHabits();
  if (hs.length && $("hList")) $("hList").insertAdjacentHTML("beforeend", hs.map((h, i) => row(`${d.date}|hab|c${i}`, esc(h.t), "From " + esc(h.by || "your coach"))).join(""));
  renderBadges();
  if (!box) return;
  const cs = myCoaches();
  if (!SY.sess || !cs.length) { box.innerHTML = ""; return; }
  const ms = cx().msgs.slice(0, 6).reverse(), nUnread = clientUnread();
  box.innerHTML = `<div class="card" data-s="w"><h2><span>${ico("msg", 17)} ${esc(cs.map(c => c.coach_name || "Coach").join(", "))}</span>${nUnread ? `<span class="badge rd">${nUnread} new</span>` : '<span class="badge">Coach</span>'}</h2>
   ${ms.length ? ms.map(m => msgHTML(m, uidMe())).join("") : '<div class="d">No messages yet. Ask your coach anything here.</div>'}
   <div style="display:flex;gap:8px;margin-top:8px">${cs.length > 1 ? `<select id="cmTo">${cs.map(c => `<option value="${esc(c.coach_id)}">${esc(c.coach_name || "Coach")}</option>`).join("")}</select>` : ""}<input id="cmIn" placeholder="Message your coach" maxlength="2000" style="flex:1;min-width:0"/><button class="btn pri" id="cmSend">Send</button></div></div>`;
  setTimeout(clientMarkRead, 2500);
}

function renderCoachCheckin() {
  const el = $("checkin"); if (!el || !SY.sess || !myCoaches().length) return;
  const wk = mondayOf(TODAY), cur = cx().ci[wk] || {}, dd = cur.data || {};
  const sel = (k, l) => `<div class="cg"><label>${l}</label><select data-ci="${k}"><option value="">–</option>${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${+dd[k] === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>`;
  el.insertAdjacentHTML("beforeend", `<h3>Send this week's check-in to your coach</h3>
   <div class="fgrid">${sel("energy", "Energy (1–5)")}${sel("hunger", "Hunger (1–5)")}${sel("stress", "Stress (1–5)")}${sel("sleepq", "Sleep quality (1–5)")}${sel("adh", "Stuck to the plan (1–5)")}</div>
   <textarea data-ci="wins" placeholder="Wins this week" maxlength="600" style="margin-top:8px">${esc(dd.wins || "")}</textarea>
   <textarea data-ci="hard" placeholder="What was hard, any pain or injury" maxlength="600" style="margin-top:8px">${esc(dd.hard || "")}</textarea>
   <textarea data-ci="ask" placeholder="Question for your coach" maxlength="600" style="margin-top:8px">${esc(dd.ask || "")}</textarea>
   <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="btn pri" id="ciSend">${cur.week ? "Update check-in" : "Send check-in"}</button><span class="d" id="ciMsg">${cur.week ? "Sent for the week of " + esc(dateLabel(wk)) : ""}</span></div>
   ${cur.reply ? `<div style="margin-top:10px">${callout("coach", "msg", "Coach reply", "", esc(cur.reply))}</div>` : ""}`);
}
function ciAuto() {
  const days = []; for (let i = 0; i < 7; i++) days.push(addD(TODAY, -i));
  const av = f => { const v = days.map(f).filter(x => x > 0); return v.length ? r1(avgOf(v)) : 0; };
  const wl = Object.entries(S.wlog || {}).filter(([d, l]) => l && l.end && d >= days[6]).length;
  return { kg: av(d => +(S.log[d] || {}).w || 0), sleep: av(d => parseFloat((S.log[d] || {}).s) || 0), steps: Math.round(av(d => S.steps[d] || 0)), workouts: wl, planned: W.nTrain };
}
async function sendCheckin() {
  const data = {}; document.querySelectorAll("[data-ci]").forEach(x => { if (x.value !== "") data[x.dataset.ci] = x.tagName === "SELECT" ? +x.value : x.value.slice(0, 600); });
  data.auto = ciAuto(); const wk = mondayOf(TODAY);
  $("ciMsg").textContent = "Sending…";
  try { await sbUpsert("checkins", [{ client_id: uidMe(), week: wk, data, updated_at: new Date().toISOString() }], "client_id,week"); $("ciMsg").textContent = "Sent"; cx().ci[wk] = Object.assign(cx().ci[wk] || {}, { week: wk, data }); save(); toast("Check-in sent", "good"); }
  catch (e) { $("ciMsg").textContent = v3Err(e); }
}

function renderCoachProf() {
  const el = $("coachProf"); if (!el) return;
  if (!SY.sess) { el.innerHTML = '<div class="d">Sign in above to work with a coach, or to coach other people.</div>'; return; }
  const cs = myCoaches();
  el.innerHTML = `<h3>My coach</h3>
   ${cs.length ? cs.map(c => `<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(c.coach_name || "Coach")}</div><div class="d">Can see your plan, logs, workouts, check-ins and Health data. Can assign workouts and habits. Cannot change your own data.</div></div><div class="btns"><button class="btn danger" data-cxstop="${esc(c.coach_id)}">Stop sharing</button></div></div>`).join("") : '<div class="d">Got an invite code from your coach? Enter it here.</div>'}
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="cxName" placeholder="Your name" maxlength="60" value="${esc(lsGet(CNK) || "")}" style="flex:1;min-width:160px"/><input id="cxCode" placeholder="Invite code" maxlength="12" style="width:140px;text-transform:uppercase"/><button class="btn pri" id="cxJoin">Join coach</button></div>
   <div class="d" id="cxMsg" style="margin-top:6px"></div>
   <h3>I coach other people</h3>
   <label class="trchk"><input type="checkbox" id="cxOn" ${coachOn() ? "checked" : ""}/> Show the Clients tab</label>`;
}
async function joinCoach() {
  const code = $("cxCode").value.trim(), name = cleanName($("cxName").value);
  if (!code) { $("cxCode").focus(); return; }
  if (!name) { $("cxMsg").textContent = "Add your name so your coach knows who joined."; $("cxName").focus(); return; }
  lsSet(CNK, name); $("cxMsg").textContent = "Joining…";
  try { const r = await sbRpc("coach_invite_accept", { invite: code, my_name: name }); $("cxMsg").textContent = "Connected to " + (r && r.coach_name || "your coach"); await pullV3(); renderCoachProf(); }
  catch (e) { $("cxMsg").textContent = v3Err(e); }
}
async function stopCoach(coach) {
  if (!await uiConfirm("Stop sharing your progress with this coach? Their assigned workouts and messages are removed too.", { title: "Stop sharing", danger: true, okText: "Stop sharing" })) return;
  try { await sbDel(`coach_links?coach_id=eq.${coach}&client_id=eq.${uidMe()}`); await pullV3(); regen(); renderAll(); } catch (e) { toast(v3Err(e), "warn"); }
}

/* ---------- Coach Clients Tab ---------- */
const CO = { sel: "", rows: {}, hd: {}, ci: {}, asg: {}, msgs: {}, loading: false, msg: "", code: "", wk: 0, day: "", edit: null };
function renderNavCoach() {
  const b = $("tabCoach"); if (!b) return;
  const show = coachOn() && !!SY.sess;
  b.hidden = !show; document.querySelector(".tabs").classList.toggle("six", show);
  if (!show && TAB === "coach") showTab("plan");
}
const CO_link = id => cx().links.find(l => l.coach_id === uidMe() && l.client_id === id);
async function loadClients() {
  if (!SY.sess) return;
  CO.loading = true; renderCoach();
  try {
    const links = await sbGet(`/rest/v1/coach_links?select=coach_id,client_id,coach_name,client_name,habits,targets,created_at,coach_read_at,share_photos&coach_id=eq.${uidMe()}`);
    cx().links = cx().links.filter(l => l.coach_id !== uidMe()).concat(links || []);
    const ids = (links || []).map(l => l.client_id);
    if (ids.length) {
      const inn = `in.(${ids.join(",")})`, from = addD(TODAY, -35);
      const [pr, hd, ci, asg, ms] = await Promise.all([
        sbGet(`/rest/v1/progress?select=user_id,data,mtime&user_id=${inn}`),
        sbGet(`/rest/v1/health_daily?select=user_id,date,steps,weight_kg,sleep_h,rhr,hrv,cardio&user_id=${inn}&date=gte.${from}`),
        sbGet(`/rest/v1/checkins?select=client_id,week,data,reply,replied_at,updated_at&client_id=${inn}&week=gte.${addD(TODAY, -63)}&order=week.desc`),
        sbGet(`/rest/v1/assignments?select=client_id,date,session,note,updated_at&coach_id=eq.${uidMe()}&date=gte.${addD(TODAY, -28)}`),
        sbGet(`/rest/v1/messages?select=id,client_id,author,date,body,created_at&coach_id=eq.${uidMe()}&order=created_at.desc&limit=300`)
      ]);
      CO.rows = {}; (pr || []).forEach(r => CO.rows[r.user_id] = r.data || {});
      CO.hd = {}; (hd || []).forEach(r => { (CO.hd[r.user_id] = CO.hd[r.user_id] || {})[r.date] = { steps: r.steps || 0, w: +r.weight_kg || 0, sleep: +r.sleep_h || 0, rhr: +r.rhr || 0, hrv: +r.hrv || 0, cardio: Array.isArray(r.cardio) ? r.cardio : [] }; });
      CO.ci = {}; (ci || []).forEach(r => (CO.ci[r.client_id] = CO.ci[r.client_id] || []).push(r));
      CO.asg = {}; (asg || []).forEach(r => { (CO.asg[r.client_id] = CO.asg[r.client_id] || {})[r.date] = Object.assign({}, r.session, { note: r.note, mt: r.updated_at }); });
      CO.msgs = {}; (ms || []).forEach(m => (CO.msgs[m.client_id] = CO.msgs[m.client_id] || []).push(m));
    }
    CO.msg = "";
  } catch (e) { CO.msg = v3Err(e); }
  CO.loading = false; renderCoach(); renderBadges();
}
function clientState(id) {
  const d = CO.rows[id] || {}, st = Object.assign(freshState(), JSON.parse(JSON.stringify(d)));
  st.prof = Object.assign(JSON.parse(JSON.stringify(DEFP)), d.prof || {}); st.cplan = normCP(st.cplan);
  const ln = CO_link(id); st.cx = { asg: CO.asg[id] || {}, targets: ln && ln.targets ? Object.assign({ by: ln.coach_name || "you" }, ln.targets) : null }; st.hd = CO.hd[id] || {};
  return st;
}
function clientStats(id) {
  const st = clientState(id), hd = st.hd, days = n => { const o = []; for (let i = 0; i < n; i++) o.push(addD(TODAY, -i)); return o; };
  const done = Object.entries(st.wlog || {}).filter(([, l]) => l && l.end).map(([d]) => d).sort();
  const last = done[done.length - 1] || "";
  const cp = st.cplan, custom = cp.mode === "custom", pd = custom ? (cp.plans[cp.active] || {}).days || {} : {};
  const perWk = Math.max(1, custom ? Object.values(pd).filter(x => x && x.ex && x.ex.length).length : +st.prof.days || 4);
  const d28 = days(28), d7 = days(7);
  const n28 = done.filter(d => d >= d28[27]).length, n7 = done.filter(d => d >= d7[6]).length;
  const adh = Math.min(1, n28 / (perWk * 4));
  const wv = d28.map(d => +((st.log[d] || {}).w) || (hd[d] && hd[d].w) || 0).reverse();
  const wNow = wv.filter(x => x > 0), avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const wA = avg(wv.slice(0, 7).filter(x => x > 0)), wB = avg(wv.slice(21).filter(x => x > 0)), wDelta = wA && wB ? (wB - wA) / 3 : 0;
  const steps = Math.round(avg(d7.map(d => (st.steps || {})[d] || (hd[d] && hd[d].steps) || 0).filter(x => x > 0)));
  const cardio7 = d7.reduce((t, d) => t + ((st.cardio || {})[d] || []).concat((hd[d] && hd[d].cardio) || []).reduce((u, c) => u + (+c.min || 0), 0), 0);
  const nh = 3 + ((CO_link(id) || {}).habits || []).length;
  let hk = 0; d7.forEach(d => Object.keys(st.checks || {}).forEach(k => { if (k.startsWith(d + "|hab|") && st.checks[k]) hk++; }));
  const habAdh = Math.min(1, hk / (7 * nh));
  let mk = 0, mt = 0; d7.forEach(d => { const n = +st.prof.meals || 4; mt += n; for (let i = 0; i < n; i++) if ((st.checks || {})[`${d}|meal|${i}`]) mk++; });
  const mealAdh = mt ? mk / mt : 0;
  const ci = (CO.ci[id] || [])[0], ciWeek = mondayOf(TODAY), ciThis = ci && ci.week >= addD(ciWeek, -7);
  const prs = []; { const m = {}; Object.values(st.hist || {}).forEach(h => (m[h.u] = m[h.u] || []).push(h)); Object.values(m).forEach(a => { a.sort((x, y) => x.d < y.d ? -1 : 1); let b = 0; a.forEach((h, i) => { const v = valOf(h); if (v > b) { if (i > 0 && h.d >= addD(TODAY, -14)) prs.push(h); b = v; } }); }); }
  const lr = d7.map(d => { const l = st.log[d] || {}, s = parseFloat(l.s), e = parseFloat(l.e), sr = parseFloat(l.sr), p = []; if (s > 0) p.push([0.4, clamp01((s - 5) / 3)]); if (e > 0) p.push([0.35, (e - 1) / 4]); if (sr > 0) p.push([0.25, (5 - sr) / 4]); healthParts(st.log, hd, d).forEach(x => p.push(x)); if (!p.length) return null; const ws = p.reduce((a, x) => a + x[0], 0), sc = p.reduce((a, x) => a + x[0] * x[1], 0) / ws; return { d, sc, lv: sc >= 0.7 ? "green" : sc >= 0.4 ? "yellow" : "red" }; }).find(Boolean);
  const score = Math.round((0.6 * adh + 0.25 * habAdh + 0.15 * (ciThis ? 1 : 0)) * 100);
  const flags = [];
  if (!CO.rows[id]) flags.push(["r", "No synced data yet"]);
  else if (!last || diffD(last, TODAY) >= 7) flags.push(["r", last ? "No workout in " + diffD(last, TODAY) + " days" : "No workouts logged"]);
  if (adh < 0.6 && CO.rows[id]) flags.push(["a", "Adherence " + Math.round(adh * 100) + "%"]);
  if (ci && !ci.reply) flags.push(["b", "Check-in to review"]);
  if (lr && lr.lv === "red") flags.push(["r", "Readiness red"]);
  const lk = CO_link(id), unread = (CO.msgs[id] || []).filter(m => m.author === id && (!lk || !lk.coach_read_at || m.created_at > lk.coach_read_at)).length;
  if (unread) flags.push(["b", unread + " new message" + (unread > 1 ? "s" : "")]);
  return { unread, st, last, n7, n28, perWk, adh, habAdh, mealAdh, cardio7, wNow: wNow[wNow.length - 1] || 0, wDelta, wv: wv.filter(x => x > 0), steps, ci, ciThis, prs, lr, score, flags };
}
const flagW = s => s.flags.reduce((t, f) => t + (f[0] === "r" ? 3 : f[0] === "a" ? 2 : 1), 0);
const flagHTML = f => `<span class="badge ${f[0] === "r" ? "rd" : f[0] === "a" ? "a" : "bl"}">${esc(f[1])}</span>`;

function renderCoach() {
  const el = $("pane-coach"); if (!el) return;
  if (!SY.sess) { el.innerHTML = '<div class="card"><h2><span>Clients</span></h2><div class="d">Sign in from Profile → Sync to coach clients.</div></div>'; return; }
  if (CO.sel && CO_link(CO.sel)) return renderClient(CO.sel);
  CO.sel = "";
  const cl = myClients(), stats = cl.map(l => [l, clientStats(l.client_id)]).sort((a, b) => flagW(b[1]) - flagW(a[1]) || a[1].score - b[1].score);
  el.innerHTML = `<div class="card"><h2><span>Clients</span><span style="display:flex;gap:8px;align-items:center"><span class="badge">${cl.length}</span><button class="btn" id="coRefresh">${ico("refresh", 15)} Refresh</button></span></h2>
   ${CO.loading ? '<div class="d">Loading…</div>' : ""}${CO.msg ? callout("red", "alert", "Couldn't load clients", "", esc(CO.msg)) : ""}
   ${stats.length ? `<div class="cogrid">${stats.map(([l, s]) => `<button type="button" class="cocard" data-co="${esc(l.client_id)}">
     <div class="coh"><b>${esc(l.client_name || "Client")}</b><span class="coscore ${s.score >= 80 ? "g" : s.score >= 55 ? "a" : "r"}">${s.score}</span></div>
     <div class="cokv"><span>Workouts 7 d</span><b>${s.n7} / ${s.perWk}</b></div>
     <div class="cokv"><span>Adherence 28 d</span><b>${Math.round(s.adh * 100)}%</b></div>
     <div class="cokv"><span>Last workout</span><b>${s.last ? esc(dateLabel(s.last, { month: "short", day: "numeric" })) : "–"}</b></div>
     <div class="cokv"><span>Weight</span><b>${s.wNow ? dW(s.wNow) + " " + wU() : "–"}${s.wDelta ? ` <small style="color:var(--muted)">${s.wDelta > 0 ? "+" : ""}${dW(s.wDelta)}/wk</small>` : ""}</b></div>
     <div class="cokv"><span>Steps 7 d</span><b>${s.steps ? s.steps.toLocaleString() : "–"}</b></div>
     <div class="cokv"><span>Meals ticked 7 d</span><b>${Math.round(s.mealAdh * 100)}%</b></div>
     <div class="cokv"><span>Cardio 7 d</span><b>${s.cardio7 ? s.cardio7 + " min" : "–"}</b></div>
     <div class="cokv"><span>Readiness</span><b>${s.lr ? `<span class="dot ${s.lr.lv}"></span>${s.lr.lv}` : "–"}</b></div>
     ${s.wv.length > 1 ? sparkline(s.wv, 220, 28) : ""}
     <div class="coflags">${s.flags.map(flagHTML).join("")}${s.prs.length ? `<span class="badge g">${s.prs.length} PR${s.prs.length > 1 ? "s" : ""} in 14 d</span>` : ""}</div>
   </button>`).join("")}</div>` : '<div class="d">No clients yet. Create an invite code below and send it to your client.</div>'}
   <div class="d" style="margin-top:10px">Score = 60% workouts (28 d) + 25% habits (7 d) + 15% check-in. Clients needing attention appear first.</div></div>
   <div class="card"><h2><span>Invite a client</span></h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="coName" placeholder="Your name as clients see it" maxlength="60" value="${esc(lsGet(CNK) || "")}" style="flex:1;min-width:180px"/><button class="btn pri" id="coInvite">Create invite code</button></div>
    ${CO.code ? `<div class="cocode">${esc(CO.code)}</div><div class="d">Valid for 7 days, for any number of clients. Creating a new code cancels this one.</div><div style="margin-top:8px"><button class="btn" id="coShare">Share code</button></div>` : ""}
   </div>`;
}
async function coInvite() {
  const n = cleanName($("coName").value); if (!n) { $("coName").focus(); return; }
  lsSet(CNK, n);
  try { CO.code = await sbRpc("coach_invite_new", { my_name: n }); renderCoach(); } catch (e) { CO.msg = v3Err(e); renderCoach(); }
}
async function coShare() {
  const text = `Join me as your coach on Elite OS. Open ${APP_URL}, create an account (Profile → Sync), then go to Profile → Coaching and enter code ${CO.code}`;
  try { if (navigator.share) await navigator.share({ title: "Coach invite", text }); else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast("Invite copied", "good"); } else await uiPrompt("Copy invite", text, { title: "Coach invite" }); } catch (e) {}
}
const coPlans = () => { const c = normCP(JSON.parse(JSON.stringify(S.cplan))); return Object.entries(c.plans).filter(([, p]) => !p.deleted); };
function coSetsOf(st, date) {
  const rows = []; Object.entries(st.sets || {}).forEach(([k, a]) => { const i = k.lastIndexOf("|"); if (k.slice(i + 1) !== date || !a.length) return; const uid = k.slice(0, i), nm = (EX.find(e => `${e.slot}:${e.id}` === uid) || {}).n || (Object.values(st.hist || {}).find(h => h.u === uid) || {}).n || uid.split(":").pop(); rows.push(`${esc(nm)}: ${a.map(x => (x.w > 0 ? dW(x.w) + "×" : "") + x.r).join(", ")}`); });
  return rows.length ? `<details class="rec"><summary>Sets</summary><div class="d">${rows.join("<br>")}</div></details>` : "";
}
function coTargetsCard(id, wk) {
  const l = CO_link(id), t = l && l.targets, T = wk && wk.T, cur = t || (T ? { P: Math.round(T.P), C: Math.round(T.C), F: Math.round(T.F) } : { P: 150, C: 200, F: 60 });
  const kc = x => Math.round(4 * x.P + 4 * x.C + 9 * x.F);
  return `<div class="card"><h2><span>${ico("utensils", 17)} Nutrition targets</span><span class="badge ${t ? "bl" : ""}">${t ? "Set by you" : "Client's own"}</span></h2>
   ${t ? callout("coach", "target", `${kc(t)} kcal · P ${t.P} · C ${t.C} · F ${t.F}`, "Active", t.note ? esc(t.note) : "Meals and groceries follow these numbers.") : callout("info", "sliders", `${T ? Math.round(T.kcal) : "–"} kcal from profile`, "Auto", `Calculated from stats and goal (P ${T ? Math.round(T.P) : "–"} · C ${T ? Math.round(T.C) : "–"} · F ${T ? Math.round(T.F) : "–"}).`)}
   <div class="fgrid"><div class="cg"><label>Protein (g)</label><input type="number" inputmode="numeric" id="ctP" value="${cur.P}"/></div><div class="cg"><label>Carbs (g)</label><input type="number" inputmode="numeric" id="ctC" value="${cur.C}"/></div><div class="cg"><label>Fat (g)</label><input type="number" inputmode="numeric" id="ctF" value="${cur.F}"/></div></div>
   <div class="d" id="ctK" style="margin-top:6px">= <b>${kc(cur)} kcal</b> per day on average (training days +10% carbs)</div>
   <input id="ctN" placeholder="Note for the client (optional)" maxlength="300" value="${esc((t && t.note) || "")}" style="width:100%;margin-top:8px"/>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn pri" id="ctSave">${t ? "Update targets" : "Set targets"}</button>${t ? '<button class="btn" id="ctClear">Restore auto numbers</button>' : ""}</div></div>`;
}
function coDayEditor(id, wk) {
  const d = CO.day, day = wk && wk.days.find(x => x.date === d), a = (CO.asg[id] || {})[d];
  if (!CO.edit || CO.edit.date !== d || CO.edit.id !== id) {
    const src = a ? { name: a.name || "", ex: (a.ex || []).map(x => Object.assign({}, x)), note: a.note || "" } : { name: day && day.session ? day.session.name : "", ex: day && day.session ? day.session.ex.map(x => mkEx({ uid: x.uid, id: x.id, slot: x.slot, name: x.name, mu: x.mu, mu2: x.mu2 || [], sets: x.sets, reps: x.reps, rest: x.rest, cue: x.cue, load: x.load, ss: !!x.ss, wu: x.wu || 0 })) : [], note: "" };
    CO.edit = Object.assign(src, { date: d, id, dirty: false });
  }
  const E = CO.edit, G = ssGroups(E.ex), opts = coPlans().flatMap(([pid, p]) => Object.entries(p.days).filter(([, x]) => x && x.ex && x.ex.length).map(([dw, x]) => `<option value="${esc(pid)}|${dw}">${esc(p.name)} · ${DAYN[dw]}: ${esc(x.name || "Workout")}</option>`));
  return `<div class="coed"><h3 style="margin-top:0">${esc(dateLabel(d))} ${a ? '<span class="badge bl">Assigned</span>' : '<span class="badge">Client\'s own plan</span>'}</h3>
   <div style="display:flex;gap:8px;flex-wrap:wrap"><select id="coFrom"><option value="">Load from my plans…</option>${opts.join("")}</select><button class="btn" id="coRestDay">Make it a rest day</button></div>
   <input id="coSesName" placeholder="Session name" maxlength="40" value="${esc(E.name)}" style="width:100%;margin-top:8px"/>
   ${E.ex.map((x, i) => { const gi = G[i]; return `<div class="trex ${gi ? "ssin" : ""} ${gi && gi.k < gi.n ? "ssnext" : ""} ${gi && gi.k > 1 ? "ssprev" : ""}"><div class="trh"><span class="${gi ? "ssl" : "trnum"}">${gi ? gi.g + gi.k : i + 1}</span><div><b>${esc(x.name)}</b><small>${esc(muLabel(x.mu))}</small></div><div class="trbtn"><button type="button" class="rest" data-coex="up|${i}" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" class="rest" data-coex="down|${i}" ${i === E.ex.length - 1 ? "disabled" : ""}>▼</button><button type="button" class="rest" data-coex="del|${i}">✕</button></div></div>
     <div class="trf"><label>Sets<input type="number" min="1" max="10" data-coef="sets|${i}" value="${esc(x.sets)}"/></label><label>Reps<input data-coef="reps|${i}" value="${esc(x.reps)}" maxlength="12"/></label><label>Rest (s)<input type="number" min="0" max="600" step="15" data-coef="rest|${i}" value="${esc(x.rest)}"/></label></div>
     <input type="url" data-coef="demo|${i}" value="${esc(x.demo || "")}" placeholder="Demo video link (https://…)" maxlength="300" style="width:100%;margin-top:8px"/>
     ${i < E.ex.length - 1 ? `<label class="trss"><input type="checkbox" data-coef="ss|${i}" ${x.ss ? "checked" : ""}/> Superset with next</label>` : ""}</div>`; }).join("")}
   <div style="display:flex;gap:8px;margin-top:6px"><input id="coAddQ" list="coExList" placeholder="Add exercise (type to search)" style="flex:1;min-width:0"/><datalist id="coExList">${EX.map(e => `<option value="${esc(e.n)}">`).join("")}</datalist><button class="btn" id="coAddEx">Add</button></div>
   <textarea id="coNote" placeholder="Note for the client" maxlength="500" style="margin-top:8px">${esc(E.note)}</textarea>
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn pri" id="coSaveDay">${a ? "Update" : "Assign"} ${esc(dateLabel(d, { weekday: "short" }))}</button>${a ? '<button class="btn danger" id="coClearDay">Remove assignment</button>' : ""}<button class="btn" id="coCloseDay">Close</button></div></div>`;
}
const coSnap = () => { const E = CO.edit; if (!E) return; const n = $("coSesName"), t = $("coNote"); if (n) E.name = cleanName(n.value); if (t) E.note = t.value.slice(0, 500); };
async function coSaveDay(clear) {
  const E = CO.edit; if (!E) return; coSnap();
  try {
    if (clear) await sbDel(`assignments?coach_id=eq.${uidMe()}&client_id=eq.${E.id}&date=eq.${E.date}`);
    else { const ex = E.ex.map((x, i, a) => Object.assign({}, x, { ss: !!x.ss && i < a.length - 1 })); await sbUpsert("assignments", [{ coach_id: uidMe(), client_id: E.id, date: E.date, session: { name: E.name || (ex.length ? "Workout" : "Rest"), ex }, note: E.note || "", updated_at: new Date().toISOString() }], "coach_id,client_id,date"); }
    CO.edit = null; await loadClients();
  } catch (e) { toast(v3Err(e), "warn"); }
}
async function coAssignProgram(id) {
  const pid = $("coProg").value, start = mondayOf($("coStart").value || TODAY), weeks = +$("coWeeks").value || 4, rest = $("coRest").checked, pr = ($("coProgP") || {}).value || "same";
  const wkEx = (ex, w) => { const cyc = w % 4, dl = pr === "wave" && cyc === 3, add = pr === "sets" ? Math.min(2, w) : pr === "wave" && !dl ? Math.min(2, cyc) : 0; return ex.map((e, i, a) => Object.assign({}, e, { ss: !!e.ss && i < a.length - 1, sets: dl ? Math.max(2, Math.ceil((+e.sets || 3) * 0.6)) : Math.min(10, (+e.sets || 3) + add) })); };
  const wkNote = w => pr === "wave" ? (w % 4 === 3 ? `Week ${w + 1} of ${weeks} · deload: lighter, leave 3–4 reps in reserve` : `Week ${w + 1} of ${weeks} · build`) : pr === "sets" ? `Week ${w + 1} of ${weeks}` : "";
  const p = coPlans().find(([k]) => k === pid); if (!p) return toast("Make a plan in your Train tab first", "warn");
  const rows = [];
  for (let w = 0; w < weeks; w++) for (let dw = 0; dw < 7; dw++) {
    const x = p[1].days[dw], date = addD(start, w * 7 + dw);
    if (x && x.ex && x.ex.length) rows.push({ coach_id: uidMe(), client_id: id, date, session: { name: x.name || "Workout", ex: wkEx(x.ex, w) }, note: wkNote(w), updated_at: new Date().toISOString() });
    else if (rest) rows.push({ coach_id: uidMe(), client_id: id, date, session: { name: "Rest", ex: [] }, note: "", updated_at: new Date().toISOString() });
  }
  const ok = await uiConfirm(`Assign "${p[1].name}" for ${weeks} week${weeks > 1 ? "s" : ""} from ${dateLabel(start)}? This replaces your assignments on those ${rows.length} days.`, { title: "Assign program", okText: "Assign" });
  if (!ok) return;
  try { await sbUpsert("assignments", rows, "coach_id,client_id,date"); await loadClients(); toast("Program assigned", "good"); } catch (e) { toast(v3Err(e), "warn"); }
}
function renderClient(id) {
  const el = $("pane-coach"), l = CO_link(id), s = clientStats(id), st = s.st, mon = addD(mondayOf(TODAY), CO.wk * 7);
  let wk = null; try { wk = buildWeek(st.prof, st, mon, TODAY); } catch (e) {}
  const ms = (CO.msgs[id] || []).filter(m => !m.date).slice(0, 12).reverse(), cis = (CO.ci[id] || []).slice(0, 4);
  const hist = Object.entries(st.wlog || {}).filter(([, x]) => x && x.end).sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 8);
  const cmt = d => (CO.msgs[id] || []).filter(m => m.date === d);
  el.innerHTML = `<div class="card"><h2><span><button class="btn" id="coBack">‹ Clients</button> ${esc(l.client_name || "Client")}</span><span class="coscore ${s.score >= 80 ? "g" : s.score >= 55 ? "a" : "r"}">${s.score}</span></h2>
    <div class="coflags">${s.flags.map(flagHTML).join("")}</div>
    <div class="kpis" style="margin-top:10px">
      <div class="kpi"><div class="l">Workouts 7 / 28 d</div><div class="v">${s.n7} / ${s.n28}</div><div class="s">Plans ${s.perWk}/wk · ${Math.round(s.adh * 100)}%</div></div>
      <div class="kpi"><div class="l">Weight</div><div class="v">${s.wNow ? dW(s.wNow) + " " + wU() : "–"}</div><div class="s">${s.wDelta ? (s.wDelta > 0 ? "+" : "") + dW(s.wDelta) + " " + wU() + "/wk" : "Not enough weigh-ins"}</div>${s.wv.length > 1 ? sparkline(s.wv, 180, 26) : ""}</div>
      <div class="kpi"><div class="l">Meals 7 d</div><div class="v">${Math.round(s.mealAdh * 100)}%</div><div class="s">Cardio ${s.cardio7} min</div></div>
      <div class="kpi"><div class="l">Habits 7 d · steps</div><div class="v">${Math.round(s.habAdh * 100)}%</div><div class="s">${s.steps ? s.steps.toLocaleString() + " steps/day" : "No steps"}</div></div>
    </div></div>
   <div class="card"><h2><span>${ico("calendar", 17)} Calendar</span><span style="display:flex;gap:6px;align-items:center"><button class="btn" data-cowk="-1">‹</button><b>${esc(dateLabel(mon, { month: "short", day: "numeric" }))}</b><button class="btn" data-cowk="1">›</button>${CO.wk ? '<button class="btn" data-cowk="0">This week</button>' : ""}</span></h2>
    <div class="cocal">${wk ? wk.days.map(d => { const a = (CO.asg[id] || {})[d.date], lg = (st.wlog || {})[d.date], done = lg && lg.end; return `<button type="button" class="coday ${CO.day === d.date ? "on" : ""} ${d.date === TODAY ? "today" : ""}" data-coday="${d.date}"><small>${esc(dateLabel(d.date, { weekday: "short", day: "numeric" }))}</small><b>${esc(d.session ? d.session.name : d.label)}</b>${a ? '<span class="badge bl">Assigned</span>' : ""}${done ? `<span class="badge g">${lg.sets} sets</span>` : d.date < TODAY && d.session ? '<span class="badge rd">Missed</span>' : ""}</button>`; }).join("") : '<div class="d">Could not build week.</div>'}</div>
    ${CO.day ? coDayEditor(id, wk) : '<div class="d" style="margin-top:8px">Tap a day to assign or change the workout.</div>'}
    <h3>Assign a program</h3>
    <div class="fgrid" style="margin-top:6px"><div class="cg"><label>Your plan</label><select id="coProg">${coPlans().map(([pid, p]) => `<option value="${esc(pid)}">${esc(p.name)} (${Object.values(p.days).filter(x => x && x.ex && x.ex.length).length} days)</option>`).join("")}</select></div>
     <div class="cg"><label>Start (Monday)</label><input type="date" id="coStart" value="${esc(addD(mondayOf(TODAY), 7))}"/></div>
     <div class="cg"><label>Weeks</label><select id="coWeeks">${[1, 2, 3, 4, 6, 8, 12].map(n => `<option ${n === 4 ? "selected" : ""}>${n}</option>`).join("")}</select></div>
     <div class="cg"><label>Progression</label><select id="coProgP"><option value="same">Same every week</option><option value="sets">Build: +1 set/wk (max +2)</option><option value="wave" selected>4-week wave (build 3, deload 4)</option></select></div></div>
    <label class="trchk"><input type="checkbox" id="coRest" checked/> Make other days rest days</label>
    <button class="btn pri" id="coAssignProg" style="margin-top:8px">Assign program</button></div>
   ${coTargetsCard(id, wk)}
   <div class="grid2"><div>
    <div class="card"><h2><span>Workouts</span></h2>${hist.length ? hist.map(([d, x]) => `<div class="row" style="cursor:default"><div class="body"><div class="t">${esc(x.name)} <span class="ims">${esc(dateLabel(d))}</span></div><div class="d">${x.mins} min · ${x.sets} sets · ${x.reps} reps${x.vol ? ` · ${Math.round(dW(x.vol)).toLocaleString()} ${wU()}` : ""}</div>${x.note ? `<div class="cue">${esc(x.note)}</div>` : ""}${coSetsOf(st, d)}${cmt(d).map(m => `<div class="note">${esc(m.body)}</div>`).join("")}<div style="display:flex;gap:6px;margin-top:6px"><input data-cocmt="${d}" placeholder="Comment on this workout" maxlength="2000" style="flex:1;min-width:0"/><button class="btn" data-cocmtgo="${d}">Send</button></div></div></div>`).join("") : '<div class="d">No finished workouts yet.</div>'}</div>
    <div class="card"><h2><span>Habits for this client</span></h2><textarea id="coHab" maxlength="900" placeholder="10k steps&#10;Protein at every meal">${esc((l.habits || []).join("\n"))}</textarea><button class="btn" id="coHabSave" style="margin-top:8px">Save habits</button></div>
   </div><div>
    <div class="card"><h2><span>Check-ins</span></h2>${cis.length ? cis.map(c => { const d = c.data || {}, a = d.auto || {}; return `<div class="coci"><b>Week of ${esc(dateLabel(c.week))}</b><div class="d">${a.workouts != null ? `Workouts ${a.workouts}/${a.planned || "?"} · ` : ""}${a.kg ? `Avg weight ${dW(a.kg)} ${wU()} · ` : ""}${a.sleep ? `Sleep ${a.sleep} h · ` : ""}${a.steps ? `Steps ${a.steps.toLocaleString()}` : ""}</div><div class="d">${["energy", "hunger", "stress", "sleepq", "adh"].filter(k => d[k]).map(k => ({ energy: "Energy", hunger: "Hunger", stress: "Stress", sleepq: "Sleep quality", adh: "Adherence" })[k] + " " + d[k] + "/5").join(" · ")}</div>${d.wins ? `<div class="cue">Wins: ${esc(d.wins)}</div>` : ""}${d.hard ? `<div class="cue">Friction: ${esc(d.hard)}</div>` : ""}${d.ask ? `<div class="cue">Question: ${esc(d.ask)}</div>` : ""}<textarea data-coreply="${esc(c.week)}" placeholder="Reply to this check-in" maxlength="2000">${esc(c.reply || "")}</textarea><button class="btn" data-coreplygo="${esc(c.week)}" style="margin-top:6px">${c.reply ? "Update reply" : "Send reply"}</button></div>`; }).join("") : '<div class="d">No check-ins yet.</div>'}</div>
    <div class="card"><h2><span>${ico("camera", 17)} Progress photos</span></h2><div id="coPhotos"></div></div>
    <div class="card"><h2><span>${ico("msg", 17)} Messages</span></h2>${ms.length ? ms.map(m => msgHTML(m, uidMe())).join("") : '<div class="d">No messages yet.</div>'}
     <div style="display:flex;gap:8px;margin-top:8px"><input id="coMsgIn" placeholder="Message ${esc(l.client_name || "client")}" maxlength="2000" style="flex:1;min-width:0"/><button class="btn pri" id="coMsgSend">Send</button></div></div>
    <div class="card"><h2><span>Remove client</span></h2><div class="d">Ends access to their data and deletes your assignments and messages.</div><button class="btn danger" id="coRemove" style="margin-top:8px">Remove ${esc(l.client_name || "client")}</button></div>
   </div></div>`;
  setTimeout(() => coPhotos(id), 0);
}

/* ---------- Photo Sharing (Opt-in) ---------- */
const PHB = "progress-photos", PHUK = "elitePhotoUp", COPH = {};
const phUp = () => { try { return JSON.parse(lsGet(PHUK) || "{}"); } catch (e) { return {}; } };
const sharingPhotos = () => myCoaches().some(l => l.share_photos);
async function stFetch(path, opt) {
  const r = await fetch(SB_URL + "/storage/v1/" + path, Object.assign({}, opt, { headers: Object.assign({ apikey: SB_KEY, Authorization: "Bearer " + await sbToken() }, (opt || {}).headers) }));
  if (!r.ok) { let m = "HTTP " + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch (e) {} const e = new Error(m); e.status = r.status; throw e; }
  return r;
}
const phName = p => `${uidMe()}/${p.id}_${p.pose}_${p.date}.jpg`;
async function phUploadAll() {
  const all = await phTx("readonly", st => st.getAll()), up = phUp(); let n = 0;
  for (const p of all) { if (up[p.id]) continue; await stFetch(`object/${PHB}/${phName(p)}`, { method: "POST", headers: { "Content-Type": "image/jpeg", "x-upsert": "true" }, body: p.blob }); up[p.id] = 1; n++; lsSet(PHUK, JSON.stringify(up)); }
  return n;
}
async function phRemoteList(owner) { const r = await stFetch(`object/list/${PHB}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: owner + "/", limit: 1000, sortBy: { column: "name", order: "desc" } }) }); return (await r.json()).filter(o => /\.jpg$/.test(o.name)); }
async function phRemoteDelete(names) { if (!names.length) return; await stFetch(`object/${PHB}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: names }) }); }
async function setPhotoShare(on) {
  PH.msg = on ? "Sharing photos…" : "Removing shared copies…"; renderPhotos();
  try {
    await sbRpc("set_photo_share", { on_: on }); myCoaches().forEach(l => l.share_photos = on); save();
    if (on) { const n = await phUploadAll(); PH.msg = `Shared with your coach · ${n} photo${n === 1 ? "" : "s"} uploaded.`; }
    else { const l = await phRemoteList(uidMe()); await phRemoteDelete(l.map(o => uidMe() + "/" + o.name)); lsSet(PHUK, "{}"); PH.msg = "Sharing is off. Cloud copies deleted; local photos stay."; }
  } catch (e) { PH.msg = v3Err(e); }
  renderPhotos();
}
async function delPhotoCopies() { try { if (SY.sess) { const l = await phRemoteList(uidMe()); await phRemoteDelete(l.map(o => uidMe() + "/" + o.name)); } } catch (e) {} }
async function coPhotos(id) {
  const box = $("coPhotos"); if (!box) return;
  const l = CO_link(id); if (!l || !l.share_photos) { box.innerHTML = callout("info", "lock", "Not shared", "", "The client hasn't shared progress photos."); return; }
  box.innerHTML = '<div class="d">Loading photos…</div>';
  try {
    const list = (await phRemoteList(id)).map(o => { const m = o.name.match(/^([^_]+)_(front|side|back)_(\d{4}-\d{2}-\d{2})\.jpg$/); return m ? { name: o.name, pose: m[2], date: m[3] } : null; }).filter(Boolean).sort((a, b) => a.date < b.date ? 1 : -1);
    if (!list.length) { box.innerHTML = '<div class="d">Sharing is on, but no photos yet.</div>'; return; }
    const url = async p => { const k = id + "/" + p.name; if (COPH[k]) return COPH[k]; const r = await stFetch(`object/authenticated/${PHB}/${k}`); return COPH[k] = URL.createObjectURL(await r.blob()); };
    const poses = ["front", "side", "back"].filter(x => list.some(p => p.pose === x));
    let h = "";
    for (const pose of poses) {
      const ps = list.filter(p => p.pose === pose), first = ps[ps.length - 1], last = ps[0];
      h += `<div class="sechl" style="margin-top:8px">${pose} · ${ps.length} photo${ps.length > 1 ? "s" : ""}</div><div class="cophg">${(ps.length > 1 ? [first, last] : [last]).map((p, i) => `<figure><img data-cop="${esc(p.name)}" alt="${esc(pose)} ${esc(p.date)}"/><figcaption>${ps.length > 1 ? (i ? "Latest" : "First") + " · " : ""}${esc(dateLabel(p.date))}</figcaption></figure>`).join("")}</div>`;
    }
    box.innerHTML = h;
    for (const img of box.querySelectorAll("img[data-cop]")) { const p = list.find(x => x.name === img.dataset.cop); url(p).then(u => img.src = u).catch(() => img.alt = "Could not load"); }
  } catch (e) { box.innerHTML = callout("red", "alert", "Couldn't load photos", "", esc(v3Err(e))); }
}

/* ---------- Push Notifications (Client) ---------- */
const VAPID_PUB = "BP4vRjVSPcPndu29L3UQ_eGkxcCbSt2CxwC1iJP9PBzkmM8PLdBflk7i3ULnSOEHnmtG6O4XoM9_4RzYBYPIMko";
const PEK = "elitePushEp", PPK = "elitePushPrefs", PRK = "elitePushRemHash";
const PU = { msg: "", busy: false, timer: false };
const pushPrefs = () => { try { return Object.assign({ rest: true, rem: true, coach: true }, JSON.parse(lsGet(PPK) || "{}")); } catch (e) { return { rest: true, rem: true, coach: true }; } };
const pushOn = () => !!lsGet(PEK) && typeof Notification !== "undefined" && Notification.permission === "granted";
function pushSupport() {
  if (!location.protocol.startsWith("http")) return "file";
  if (inFrame()) return "frame";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return isIOS() && !isStandalone() ? "ios-install" : "none";
  return "ok";
}
const keyBytes = b => Uint8Array.from(atob(b.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b.length + 3) % 4)), c => c.charCodeAt(0));
async function pushEnable() {
  if (!SY.sess) { PU.msg = "Sign in first (Sync, above)."; return renderPushProf(); }
  PU.busy = true; PU.msg = "Asking for permission…"; renderPushProf();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked. Enable them in Settings → Notifications." : "Permission was not granted.");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUB) });
    const j = sub.toJSON();
    await sbRpc("push_subscribe", { ep: j.endpoint, k: j.keys.p256dh, a: j.keys.auth, pr: pushPrefs() });
    lsSet(PEK, j.endpoint); lsSet(PRK, ""); PU.msg = "Notifications are on for this device.";
    pushReminders(true);
  } catch (e) { PU.msg = v3Err(e); }
  PU.busy = false; renderPushProf();
}
async function pushDisable() {
  const ep = lsGet(PEK);
  try { if (ep && SY.sess) await sbRpc("push_unsubscribe", { ep }); const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
  try { localStorage.removeItem(PEK); } catch (e) {} PU.msg = "Notifications are off for this device."; renderPushProf();
}
async function pushSetPref(k, v) {
  const p = pushPrefs(); p[k] = v; lsSet(PPK, JSON.stringify(p));
  try { if (lsGet(PEK)) await sbRpc("push_set_prefs", { ep: lsGet(PEK), pr: p }); if (k === "rem") { lsSet(PRK, ""); pushReminders(true); } } catch (e) { PU.msg = v3Err(e); renderPushProf(); }
}
async function pushTest() {
  PU.msg = "Sending…"; renderPushProf();
  try { await sbRpc("push_test", { ep: lsGet(PEK) }); PU.msg = "Sent. Lock your phone to see the banner."; } catch (e) { PU.msg = v3Err(e); }
  renderPushProf();
}
function upcomingSessions() {
  const out = [], mon = mondayOf(TODAY);
  [0, 7].forEach(off => { try { const w = buildWeek(S.prof, S, addD(mon, off), TODAY); w.days.forEach(d => { if (d.session && d.session.ex && d.session.ex.length && d.date >= TODAY) out.push(d); }); } catch (e) {} });
  return out;
}
function reminderRows() {
  const wt = S.prof.wtime || "17:30", [hh, mm] = wt.split(":").map(Number);
  return upcomingSessions().map(d => { const [y, m, dd] = d.date.split("-").map(Number), at = new Date(y, m - 1, dd, hh || 17, mm || 0); return { key: d.date, at: at.toISOString(), title: `${d.session.name} at ${wt}`, body: `${d.session.ex.length} exercises · ~${Math.round(d.session.ex.reduce((a, x) => a + x.sets * (x.rest + 40), 0) / 60)} min. Tap to start.` }; }).filter(r => new Date(r.at) > new Date());
}
async function pushReminders(force) {
  if (!SY.sess || !pushOn()) return;
  const rows = pushPrefs().rem ? reminderRows() : [], h = JSON.stringify(rows);
  if (!force && lsGet(PRK) === h) return;
  try { await sbRpc("push_schedule", { rows }); lsSet(PRK, h); } catch (e) {}
}
const restPushOK = () => SY.sess && pushOn() && pushPrefs().rest;
async function restPush(on) {
  try {
    if (on) { const secs = Math.round((tmrEnd - Date.now()) / 1000); if (secs < 3) return; PU.timer = true; await sbFetch("/rest/v1/rpc/push_timer", { method: "POST", keepalive: true, body: JSON.stringify({ ep: lsGet(PEK), secs }) }, await sbToken()); }
    else if (PU.timer) { PU.timer = false; await sbFetch("/rest/v1/rpc/push_timer_cancel", { method: "POST", keepalive: true, body: "{}" }, await sbToken()); }
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => {
  if (!restPushOK()) return;
  if (document.visibilityState === "hidden" && tmrEnd > Date.now() + 3000) restPush(true);
  else if (document.visibilityState === "visible") restPush(false);
});
function renderPushProf() {
  const el = $("pushProf"); if (!el) return;
  const sup = pushSupport(), p = pushPrefs(), on = pushOn(), perm = typeof Notification !== "undefined" ? Notification.permission : "default";
  let h = "";
  if (sup === "file" || sup === "frame") h = callout("info", "bell", "Open the app directly", "", "Notifications only work in the standalone app, not inside Obsidian or a file preview.");
  else if (sup === "ios-install") h = callout("warn", "bell", "Add to Home Screen first", "iPhone", "In Safari tap <b>Share</b> → <b>Add to Home Screen</b>, open Elite OS from there, then come back here.");
  else if (sup === "none") h = callout("info", "bell", "Not supported here", "", "Use Safari on iPhone (Home Screen) or Chrome.");
  else if (!SY.sess) h = callout("info", "lock", "Sign in first", "", "Sign in above, then turn on notifications.");
  else if (perm === "denied") h = callout("red", "alert", "Notifications are blocked", "", "Turn them on in Settings → Notifications → Elite OS, then reload.");
  else if (!on) h = `<div class="d">Rest timer alerts (even with the screen locked), workout reminders, and coach updates.</div><button class="btn pri" id="puOn" style="margin-top:10px" ${PU.busy ? "disabled" : ""}>${ico("bell", 15)} Turn on notifications</button>`;
  else h = callout("good", "bell", "Notifications are on", "This device", "") + [["rest", "clock", "Rest timer", "When rest ends while you're out of the app"], ["rem", "dumbbell", "Workout reminders", `Training days at ${esc(S.prof.wtime || "17:30")}`], ["coach", "msg", "Coach", "Messages, assignments, targets and check-in replies"]].map(([k, ic, t, d]) => `<label class="putog"><input type="checkbox" data-pu="${k}" ${p[k] ? "checked" : ""}/><span><b>${ico(ic, 14)} ${t}</b><small>${d}</small></span></label>`).join("") + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="puTest">Send a test</button><button class="btn danger" id="puOff">Turn off on this device</button></div>`;
  el.innerHTML = h + (PU.msg ? `<div class="d" style="margin-top:8px">${esc(PU.msg)}</div>` : "");
}

/* ---------- Health Sync Engine (Client) — Fixed Manual Override Protection ---------- */
const HXLOGK = "eliteHealthLog", HXATK = "eliteHealthAt", HXFEEDK = "eliteHealthFeed", HXSCK = "eliteShortcut", HXRUNK = "eliteHxRun";
const hxShortcut = () => lsGet(HXSCK) || "Elite Health Sync";
const hxRunURL = () => "shortcuts://run-shortcut?name=" + encodeURIComponent(hxShortcut());
const hxRunBtn = (cls, label) => `<a class="btn ${cls || ""}" href="${esc(hxRunURL())}" data-hxrun="1">${ico("play", 14)} ${label || "Run sync on this iPhone"}</a>`;
const HX_SAMPLE = '{"date":"","steps":"4,210\\n4,211","weight":"165.4 lb","sleep":"7 hr 30 min","rhr":"58 bpm","hrv":"","kcal":"NaN","bf":null}';
const HXT = { out: "", open: false };

function hxLog() { try { const a = JSON.parse(lsGet(HXLOGK) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function hxLogAdd(e) { const a = hxLog(); a.unshift(Object.assign({ t: Date.now() }, e)); lsSet(HXLOGK, JSON.stringify(a.slice(0, 25))); }

/* Health fills manual logs ONLY where user has NOT typed a manual value (stepsM / !wh / !sh respected!) */
function hxProject(d) {
  const h = S.hd[d]; if (!h) return false; let ch = false;
  if (h.steps > 0 && !(S.stepsM && S.stepsM[d]) && S.steps[d] !== h.steps) { S.steps[d] = h.steps; ch = true; }
  const l = S.log[d] = S.log[d] || {};
  if (h.w > 0 && (!l.w || l.wh) && Math.abs((+l.w || 0) - h.w) > 0.01) { l.w = +h.w; l.wh = 1; ch = true; }
  if (h.sleep > 0 && (!l.s || l.sh) && String(l.s) !== String(+h.sleep)) { l.s = String(+h.sleep); l.sh = 1; ch = true; }
  if (!Object.keys(l).length) delete S.log[d];
  return ch;
}
function hxUpsert(rows) {
  v4Norm(); let changed = 0; const fields = new Set();
  (rows || []).forEach(r => {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
    const nx = Object.assign({}, S.hd[r.date]);
    HX_FIELDS.forEach(f => { const k = f === "weight" ? "w" : f, v = +r[f]; if (isFinite(v) && v > 0) { fields.add(f); if (nx[k] !== v) { nx[k] = v; changed++; } } });
    if (Array.isArray(r.cardio) && r.cardio.length) {
      fields.add("cardio");
      const seen = new Set(), merged = (nx.cardio || []).concat(r.cardio).filter(x => { const key = x.type + "|" + x.min; if (seen.has(key)) return false; seen.add(key); return true; });
      if (JSON.stringify(nx.cardio || []) !== JSON.stringify(merged)) { nx.cardio = merged; changed++; }
    }
    if (Object.keys(nx).length) { S.hd[r.date] = nx; if (hxProject(r.date)) changed++; }
  });
  return { changed, fields: [...fields] };
}
function hookURL(t) {
  let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  return SB_URL + "/functions/v1/health?t=" + encodeURIComponent(t || "") + (tz ? "&tz=" + encodeURIComponent(tz) : "") + "&u=" + (metric() ? "kg" : "lb");
}
function hxForward(rows) {
  if (!SY.sess || !lsGet(HTK) || !location.protocol.startsWith("http")) return;
  fetch(hookURL(lsGet(HTK)), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows.map(r => r.weight != null ? Object.assign({ unit: "kg" }, r) : r)) }).catch(() => {});
}
function hxIngest(input, src, opt) {
  opt = opt || {};
  const res = hxNormalize(input, { today: TODAY, unit: opt.unit || (metric() ? "kg" : "lb") });
  if (!res.rows.length && !res.issues.length && String(typeof input === "string" ? input : JSON.stringify(input || "")).trim().length > 2) res.issues.push({ field: "body", raw: "", why: "no health values recognised" });
  const up = res.rows.length ? hxUpsert(res.rows) : { changed: 0, fields: [] };
  if (res.rows.length) lsSet(HXATK, String(Date.now()));
  hxLogAdd({ src, days: res.rows.length, fields: up.fields, changed: up.changed, issues: res.issues.slice(0, 6), dates: res.rows.map(r => r.date).slice(-3) });
  if (up.changed) { save(); regen(); renderAll(true); } else { renderHX(); renderPill(); }
  if (res.rows.length && opt.forward !== false) hxForward(res.rows);
  return { rows: res.rows, issues: res.issues, up };
}
function hxSummary(r) {
  if (!r.rows.length) return r.issues.length ? "Health sync: nothing usable (" + r.issues[0].why + "). Nothing was changed." : "Health sync: no data in that link.";
  const names = r.up.fields.filter(f => HX_LABEL[f]).map(f => HX_LABEL[f].toLowerCase());
  return `Health synced · ${r.rows.length} day${r.rows.length === 1 ? "" : "s"}${names.length ? " · " + names.join(", ") : ""}${r.up.changed ? "" : " · already up to date"}${r.issues.length ? ` · ${r.issues.length} skipped` : ""}`;
}
const HX_URL = /^(h=|health=|sync(&|$)|hs(&|$))/;
function hxFromURL() {
  let raw = "", at = "";
  const h = location.hash.slice(1), q = location.search.slice(1);
  if (h && HX_URL.test(h)) { raw = h; at = "h"; } else if (q && HX_URL.test(q)) { raw = q; at = "q"; } else return false;
  try { history.replaceState(null, "", location.pathname + (at === "h" ? location.search : "") + (at === "q" ? location.hash : "")); } catch (e) {}
  const r = hxIngest(raw.replace(/^(sync|hs)(&|$)/, ""), "link");
  toast(hxSummary(r), r.rows.length ? "good" : "warn");
  return true;
}
function healthHash() { return hxFromURL(); }
let hxFeedAt = 0;
async function hxFeedPull(force) {
  const u = lsGet(HXFEEDK); if (!u || !/^https:\/\//.test(u)) return null;
  if (!force && Date.now() - hxFeedAt < 6e5) return null;
  hxFeedAt = Date.now();
  try { const r = await fetch(u, { cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return hxIngest(await r.text(), "feed", { forward: false }); }
  catch (e) { hxLogAdd({ src: "feed", days: 0, fields: [], changed: 0, issues: [{ field: "feed", raw: "", why: "could not load: " + e.message }] }); renderHX(); return null; }
}
function hxAuto() {
  syncToday(); hxFromURL(); hxFeedPull(false);
  const t = +lsGet(HXRUNK) || 0;
  if (t && Date.now() - t < 6e5 && document.visibilityState === "visible") { try { localStorage.removeItem(HXRUNK); } catch (e) {} setTimeout(hxSyncNow, 1800); }
}
window.addEventListener("hashchange", hxFromURL);
window.addEventListener("pageshow", hxAuto);
window.addEventListener("focus", hxAuto);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") hxAuto(); });
async function hxSyncNow() {
  toast("Syncing Health…");
  hxFromURL();
  const before = JSON.stringify(S.hd);
  try { if (SY.sess) await pullV3(); } catch (e) {}
  await hxFeedPull(true);
  const ch = before !== JSON.stringify(S.hd);
  toast(!SY.sess && !lsGet(HXFEEDK) ? "Nothing to pull yet. Connect Health below or paste data." : ch ? "Health synced · new data" : "Health checked · up to date", !SY.sess && !lsGet(HXFEEDK) ? "warn" : "good");
  renderHX(); renderPill();
}
function hxState() {
  const hd = S.hd || {}, days = Object.keys(hd).filter(d => HX_FIELDS.some(f => hd[d][f === "weight" ? "w" : f] > 0)).sort(), last = days[days.length - 1] || null;
  const t = hd[TODAY] || {}, have = HX_FIELDS.filter(f => t[f === "weight" ? "w" : f] > 0), miss = HX_FIELDS.filter(f => !have.includes(f));
  const at = +lsGet(HXATK) || 0, age = last ? diffD(last, TODAY) : null;
  const cov = {}; let synced = 0;
  for (let i = 0; i < 14; i++) { const x = hd[addD(TODAY, -i)]; if (!x) continue; let any = false; HX_FIELDS.forEach(f => { if (x[f === "weight" ? "w" : f] > 0) { cov[f] = (cov[f] || 0) + 1; any = true; } }); if (any) synced++; }
  return { last, age, at, have, miss, cov, synced, never: HX_FIELDS.filter(f => !cov[f]), state: !last ? "off" : age <= 1 ? "ok" : "stale" };
}
const agoTxt = t => { if (!t) return ""; const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
function renderPill() {
  const b = $("hxPill"); if (!b) return;
  const s = hxState();
  b.className = "hxpill s-" + s.state;
  b.title = b.ariaLabel = s.state === "off" ? "Health sync is not connected. Tap to set it up." : `Health sync. Last data ${s.last}. Today: ${s.have.length} of ${HX_FIELDS.length}.`;
  b.innerHTML = `<span class="hxdot" aria-hidden="true"></span><span class="hxl">${s.state === "off" ? 'Connect<span class="hxl-f"> Health</span>' : '<span class="hxl-f">Health · </span>' + (s.state === "stale" ? s.age + " d old" : s.at ? agoTxt(s.at) : "synced")}</span>${s.state === "off" ? "" : `<span class="hxn">${s.have.length}/${HX_FIELDS.length}</span>`}`;
}
function hxRowsTable(rows) {
  return `<div class="tblw"><table class="tele"><thead><tr><th>Date</th>${HX_FIELDS.map(f => `<th>${HX_LABEL[f]}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.date)}</td>${HX_FIELDS.map(f => `<td>${r[f] != null ? (f === "weight" ? dW(r[f]) + " " + wU() : f === "sleep" ? r[f] + " h" : f === "bf" ? r[f] + "%" : Number(r[f]).toLocaleString()) : '<span class="na">–</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function hxCheck(commit) {
  const txt = ($("hxIn") || {}).value || "";
  if (!txt.trim()) { HXT.out = callout("info", "edit", "Paste something first", "", "A Shortcut body, link, Health Auto Export JSON or CSV all work."); return renderHX(); }
  const cleaned = txt.replace(/^[^#?]*[#?](?=(h=|health=|sync|hs))/, "").replace(/^(sync|hs)(&|$)/, "");
  const res = commit ? hxIngest(cleaned, "paste") : hxNormalize(cleaned, { today: TODAY, unit: metric() ? "kg" : "lb" });
  const iss = res.issues.map(i => `<li><b>${esc(i.field)}</b>${i.raw ? ` <code>${esc(i.raw)}</code>` : ""} · ${esc(i.why)}</li>`).join("");
  HXT.out = (res.rows.length ? callout("good", "check", commit ? `Imported ${res.rows.length} day${res.rows.length === 1 ? "" : "s"}` : `Readable: ${res.rows.length} day${res.rows.length === 1 ? "" : "s"}`, commit ? (res.up.changed ? res.up.changed + " updated" : "already up to date") : "preview only", hxRowsTable(res.rows))
    : callout("warn", "alert", "Nothing usable in that payload", "", "No valid health value was found, so nothing changed.")) + (iss ? callout("info", "info", "Skipped values", "", `<ul class="cl">${iss}</ul>`) : "");
  renderHX();
}
function renderHX() {
  const b = $("hxBox"); if (!b) return;
  const s = hxState(), tok = lsGet(HTK), log = hxLog(), u = metric() ? "kg" : "lb", keep = $("hxIn") ? $("hxIn").value : "", feed = lsGet(HXFEEDK) || "";
  const openSet = new Set([...b.querySelectorAll("details[open][data-hk]")].map(d => d.dataset.hk)), op = k => openSet.has(k) ? " open" : "";
  const chip = (f, on) => `<span class="hxf ${on ? "on" : ""}">${on ? "✓" : "○"} ${HX_LABEL[f]}</span>`;
  const status = s.state === "off" ? callout("info", "watch", "Health is not connected yet", "", "Connect Apple Health via Shortcuts or Health Auto Export below.")
    : s.state === "ok" ? callout("good", "check", "Health sync is working", `Last data ${esc(dateLabel(s.last, { month: "short", day: "numeric" }))}${s.at ? " · " + agoTxt(s.at) : ""}`, "Missing values are fine: the app keeps what it has and scores around gaps.")
    : callout("warn", "alert", `No Health data for ${s.age} days`, `Last data ${esc(dateLabel(s.last, { month: "short", day: "numeric" }))}`, (isIOS() ? "Tap <b>Run sync</b> below to bring today in now. " : "On your iPhone, open this app and tap <b>Run sync</b>. ") + "Then open Setup & diagnostics to check Allow Running When Locked.");
  const link = `${appURL()}#sync&steps=…&weight=…&sleep=…&rhr=…&hrv=…&kcal=…&u=${u}`;
  b.innerHTML = `${status}
   <div class="hxtoday"><div class="sechl">Today from Health <b>${s.have.length} / ${HX_FIELDS.length}</b></div><div class="hxfs">${HX_FIELDS.map(f => chip(f, s.have.includes(f))).join("")}</div></div>
   ${s.state !== "off" ? `<div class="hxtoday"><div class="sechl">Last 14 days <b>synced on ${s.synced} of 14</b></div><div class="hxfs">${HX_FIELDS.map(f => `<span class="hxf ${s.cov[f] ? "on" : ""}">${HX_LABEL[f]} ${s.cov[f] || 0}/14</span>`).join("")}</div></div>
    ${s.synced < 12 ? callout("warn", "calendar", `Your phone skipped ${14 - s.synced} of the last 14 days`, "", "iOS hides Health data while locked. Add Trigger 2 (App: Is Opened) and turn on <b>Allow Running When Locked</b>.") : ""}
    ${s.never.length && s.never.length < HX_FIELDS.length ? callout("info", "plus", "Never received: " + esc(s.never.map(f => HX_LABEL[f]).join(", ")), "", `Add a <b>Find Health Samples</b> step for each one.${s.never.some(f => f === "hrv" || f === "rhr") ? " HRV and resting HR require a wearable." : ""}${s.never.includes("sleep") ? " On iPhone alone, send <code>inbed</code>." : ""}`) : ""}` : ""}
   <div class="hurlbtns">${isIOS() ? hxRunBtn("pri") : ""}<button class="btn ${isIOS() ? "" : "pri"}" data-hx="sync">${ico("refresh", 15)} ${isIOS() ? "Check for new data" : "Sync now"}</button><button class="btn" data-hx="focus">Diagnostics &amp; tester</button></div>

   <details class="rec" data-hk="setup" style="margin-top:14px"${op("setup") || (tok && s.state !== "ok" ? " open" : "")}><summary>Setup guides, Repair &amp; Diagnostics</summary>
     <details class="rec" data-hk="bg"${op("bg") || (tok && s.state !== "ok" ? " open" : "")}><summary>Background sync (recommended · needs an account)</summary>
      ${!SY.sess ? callout("info", "lock", "Sign in first", "", 'Create an account in Profile → Sync to generate your personal sync link. <button class="btn" data-goto="profile" style="margin-left:6px">Open Profile</button>')
      : tok ? `<div class="hurl"><label>Your personal sync link · treat it like a password</label><div class="hurlrow"><input readonly id="htUrl" value="${esc(hookURL(tok))}" onclick="this.select()"/><button class="btn pri" id="htCopy">Copy</button></div>
        <div class="hurlbtns"><button class="btn" id="htTest">Send a test</button><button class="btn" id="htNew">New link</button><button class="btn danger" id="htOff">Turn off</button></div><div class="d" id="htMsg" style="margin-top:6px"></div></div>
        <h3>Option A · Health Auto Export (most reliable)</h3><ol class="hsteps">
         <li>Install <b>Health Auto Export – JSON+CSV</b> → Automations → <b>+</b> → <b>REST API</b> → paste URL, format <b>JSON</b>.</li>
         <li>Select Step Count, Weight, Body Fat, Sleep, Resting HR, HRV, Active Energy aggregated by <b>Day</b>, plus a second <b>Workouts</b> automation.</li></ol>
        <h3>Option B · Apple Shortcuts (free) · iOS 27</h3><ol class="hsteps">
         <li>Shortcuts → <b>+</b>, name it <b>Elite Health Sync</b>. Add <b>Find Health Samples</b> (Start Date is today) for Steps, Active Energy, Resting HR, HRV, Weight, Body Fat.</li>
         <li><b>Sleep:</b> Find Health Samples → Sleep → Start Date in last 36h, End Date is today, Value is not In Bed &amp; not Awake → Sum as <code>sleep</code>. Duplicate with Value is In Bed as <code>inbed</code>.</li>
         <li>Add <b>Get Contents of URL</b> (POST, JSON). Set every field type to <b>Text</b>: <code>steps</code>, <code>kcal</code>, <code>rhr</code>, <code>hrv</code>, <code>weight</code>, <code>bf</code>, <code>sleep</code>, <code>inbed</code>, plus <code>unit</code> = <b>${u}</b>.</li>
         <li><b>Edit → ⓘ → Privacy → Allow Running When Locked</b>.</li>
         <li><b>Trigger 1:</b> Edit → Automation → Time of Day (pick Time of Day on the Time of Day / Sunrise or Sunset screen), 9:30 PM Daily. <b>Trigger 2:</b> App → Is Opened (safety net while unlocked).</li></ol>
        <div class="cg" style="margin-top:10px;max-width:420px"><label for="hxScName">Shortcut name (used by Run sync)</label><div class="hurlrow"><input id="hxScName" value="${esc(hxShortcut())}" maxlength="80"/><button class="btn" data-hx="scname">Save</button></div></div>`
      : `<div class="d" style="margin-top:6px">Syncs steps, weight, body fat, sleep, HRV, resting HR and workouts automatically.</div><button class="btn pri" id="htNew" style="margin-top:10px">Create my sync link</button><div class="d" id="htMsg" style="margin-top:6px"></div>`}</details>
     <details class="rec" data-hk="url"${op("url")}><summary>No account · open app with URL parameters</summary>
      <div class="hurlrow" style="margin-top:8px"><input readonly id="hxLink" value="${esc(link)}" onclick="this.select()"/><button class="btn" data-hx="copylink">Copy</button></div></details>
     <details class="rec" data-hk="fix"${op("fix") || (s.state === "stale" ? " open" : "")}><summary>Repair checklist</summary><ol class="hsteps">
      <li>Turn on <b>Allow Running When Locked</b> and add an unlocked <b>App: Is Opened</b> trigger.</li>
      <li>Set every Shortcut JSON field type to <b>Text</b> (never Number).</li>
      <li>For iPhone without Watch, send <code>inbed</code> for sleep and enable a Sleep schedule in Apple Health.</li>
      <li>If you only see Time of Day / Sunrise or Sunset, go back one step to the full trigger list.</li></ol></details>
     <details class="rec" data-hk="feed"${op("feed")}><summary>Advanced · pull from private https JSON/CSV URL</summary>
      <div class="hurlrow" style="margin-top:8px"><input id="hxFeed" placeholder="https://…" value="${esc(feed)}"/><button class="btn" data-hx="feedsave">Save</button></div></details>
     <div class="sechl" style="margin-top:14px">Payload tester</div>
     <textarea id="hxIn" spellcheck="false" placeholder='{"steps":"8421","weight":"165.4 lb","sleep":"","hrv":"NaN"}' style="margin-top:6px;font-family:var(--mono);font-size:.78rem">${esc(keep)}</textarea>
     <div class="hurlbtns"><button class="btn pri" data-hx="check">Check</button><button class="btn" data-hx="import">Import</button><button class="btn" data-hx="sample">Load sample</button><button class="btn" id="hsPick">Upload file</button></div>
     <div id="hxOut" style="margin-top:10px">${HXT.out}</div>
     <div class="sechl" style="margin-top:14px">Sync log</div>
     ${log.length ? `<div class="itab">${log.slice(0, 8).map(e => `<div class="irow"><span>${esc(fmtTime(e.t))} · ${esc(({ link: "Link", paste: "Pasted", file: "File", feed: "URL", cloud: "Cloud", test: "Test" })[e.src] || e.src)}</span><span class="ims">${e.days ? `${e.days}d · ${e.changed || 0} upd` : "nothing usable"}${(e.issues || []).length ? ` · ${e.issues.length} skipped` : ""}</span></div>`).join("")}</div>` : '<div class="d">No syncs recorded on this device yet.</div>'}
   </details>`;
}
function importHealth(txt, unit) { const r = hxIngest(txt, "file", { unit: unit || undefined }); toast(hxSummary(r), r.rows.length ? "good" : "warn"); }
function renderHealthSync() { renderHX(); renderPill(); }
async function healthKey(on) {
  try {
    if (on) {
      if (lsGet(HTK) && !await uiConfirm("Make a new link? The old one stops working, so paste the new one into your exporter app or Shortcut.", { title: "Rotate sync link", danger: true, okText: "Create new link" })) return;
      const t = await sbRpc("health_token_new"); lsSet(HTK, t);
    } else {
      if (!await uiConfirm("Turn off automatic Health sync? Your Shortcut will stop working. Data already synced stays.", { title: "Disable Health sync", danger: true, okText: "Turn off" })) return;
      await sbRpc("health_token_revoke"); try { localStorage.removeItem(HTK); } catch (e) {}
    }
    renderProgress();
  } catch (e) { const m = $("htMsg"); if (m) m.textContent = v3Err(e); }
}
async function healthTest() {
  const m = $("htMsg"); if (m) m.textContent = "Sending a test…";
  try {
    const body = { date: TODAY, test: 1 }; if (S.steps[TODAY] > 0) body.steps = S.steps[TODAY];
    const r = await fetch(hookURL(lsGet(HTK)), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), j = await r.json().catch(() => null);
    const ok = r.ok && j && j.ok;
    hxLogAdd({ src: "test", days: ok ? (j.days || 0) : 0, fields: [], changed: 0, issues: ok ? [] : [{ field: "link", raw: "", why: (j && j.error) || "HTTP " + r.status }] });
    if ($("htMsg")) $("htMsg").textContent = ok ? "Your link works. The server accepted the test." : "Test failed: " + ((j && j.error) || "HTTP " + r.status);
  } catch (e) { if ($("htMsg")) $("htMsg").textContent = "Test failed: " + v3Err(e); }
}
