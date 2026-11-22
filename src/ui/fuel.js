/* Elite OS v5.0 — Nutrition, Food Quality, Planned-Meal Micros, Barcode Scanner, Recipes & Groceries */
const itemMac = it => { const f = FOODS[it.id], k = it.g / 100; return { kc: Math.round((4 * f.p + 4 * f.c + 9 * f.f) * k), P: Math.round(f.p * k), C: Math.round(f.c * k), F: Math.round(f.f * k) }; };
const BARE2 = ["banana", "egg", "apple", "avocado"];
const itemLabel = it => { const f = FOODS[it.id]; return qtyText(it.id, Math.round(it.g), S.prof.units, false) + (f.u && BARE2.includes(f.u[0]) ? "" : " " + f.n.toLowerCase()); };

function macroChips(mm, label) {
  return `<div class="macros"><span class="mk">${mm.kcal} kcal</span><span><i class="mdot p"></i>${mm.P}P</span><span><i class="mdot c"></i>${mm.C}C</span><span><i class="mdot f"></i>${mm.F}F</span>${label ? `<span class="mk">· ${esc(label)}</span>` : ""}</div>`;
}
function ingredientTable(mm) {
  return `<div class="d"><b>Ingredients and macros</b></div><div class="itab">${mm.items.map(it => { const m = itemMac(it); return `<div class="irow"><span>${esc(itemLabel(it))}</span><span class="ims">${m.kc} kcal · ${m.P}P · ${m.C}C · ${m.F}F</span></div>`; }).join("")}<div class="irow itot"><span>Total</span><span class="ims">${mm.kcal} kcal · ${mm.P}P · ${mm.C}C · ${mm.F}F</span></div></div>`;
}

/* Portion multiplier for planned meals (0.5x / 1x / 1.5x) */
const mealMultOf = (date, i) => +((S.mealMult || {})[`${date}|${i}`]) || 1;
function eatenOn(d) {
  const xt = S.extra[d.date] || {}, fl = (S.flog && S.flog[d.date]) || [], fs = k => fl.reduce((a, x) => a + (+x[k] || 0), 0);
  return d.meals.reduce((q, mm, i) => {
    if (!S.checks[`${d.date}|meal|${i}`]) return q;
    const m = mealMultOf(d.date, i);
    return { kcal: q.kcal + mm.kcal * m, P: q.P + mm.P * m, C: q.C + mm.C * m, F: q.F + mm.F * m };
  }, { kcal: (+xt.kcal || 0) + fs("kcal"), P: (+xt.p || 0) + fs("p"), C: fs("c"), F: fs("f") });
}
function snapNut() {
  if (!W) return; v4Norm(); let ch = false;
  W.days.forEach(d => {
    if (d.date > TODAY) return;
    const e = eatenOn(d), v = e.kcal > 0 ? { k: Math.round(e.kcal), p: Math.round(e.P), c: Math.round(e.C), f: Math.round(e.F), t: Math.round(d.macros.kcal), tp: Math.round(d.macros.P) } : null;
    if (JSON.stringify(S.nut[d.date] || null) !== JSON.stringify(v)) { if (v) S.nut[d.date] = v; else delete S.nut[d.date]; ch = true; }
  });
  if (ch) save();
}

/* Micronutrients across BOTH planned checked meals AND logged foods */
function dayMicros(d) {
  const tot = { fiber: 0, sodium: 0, k: 0, ca: 0, mg: 0, iron: 0, vd: 0, vc: 0 };
  let count = 0;
  d.meals.forEach((mm, i) => {
    if (!S.checks[`${d.date}|meal|${i}`] || !mm.items || !mm.items.length) return;
    const mult = mealMultOf(d.date, i);
    count++;
    mm.items.forEach(it => {
      const mi = FOODS[it.id] && FOODS[it.id].mi; if (!mi) return;
      const sc = it.g * mult / 100;
      Object.keys(tot).forEach(k => { if (mi[k]) tot[k] += mi[k] * sc; });
    });
  });
  ((S.flog && S.flog[d.date]) || []).forEach(x => {
    count++;
    Object.keys(tot).forEach(k => { tot[k] += (x.m && +x.m[k]) || 0; });
  });
  return { tot, count };
}

/* ---------- Food Quality (0–100) ---------- */
const QGRADE = s => s >= 75 ? ["Excellent", "good"] : s >= 50 ? ["Good", "info"] : s >= 25 ? ["Mediocre", "warn"] : ["Poor", "red"];
function qScore(per, meta) {
  per = per || {}; meta = meta || {};
  const has = k => per[k] != null && isFinite(per[k]), cap = (v, m) => Math.max(0, Math.min(m, v));
  let neg = cap((+per.kcal || 0) / 80, 10), negMax = 10, est = false;
  if (has("sugar")) { neg += cap(per.sugar / 4.5, 10); negMax += 10; } else est = true;
  if (has("sat")) { neg += cap(per.sat / 1, 10); negMax += 10; } else est = true;
  if (has("sodium")) { neg += cap(per.sodium / 90, 10); negMax += 10; } else est = true;
  const negN = neg / negMax * 40, pos = cap((+per.fiber || 0) / 0.9, 5) + (negN >= 11 ? 0 : cap((+per.p || 0) / 1.6, 5));
  const nutr = clamp01(1 - (negN - pos + 10) / 50) * 100;
  const parts = [[0.6, nutr]];
  if (meta.nova >= 1 && meta.nova <= 4) parts.push([0.25, [100, 85, 60, 25][meta.nova - 1]]); else est = true;
  if (meta.add != null && isFinite(meta.add)) parts.push([0.15, Math.max(0, 100 - 12 * meta.add)]); else est = true;
  const ws = parts.reduce((a, p) => a + p[0], 0); let score = Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / ws);
  if (meta.org) score = Math.min(100, score + 3);
  const fl = [];
  if (meta.nova === 4) fl.push(["red", "Ultra-processed"]);
  if (has("sugar") && per.sugar >= 22.5) fl.push(["red", "High sugar · " + r1(per.sugar) + " g/100 g"]);
  else if (has("sugar") && per.sugar >= 10) fl.push(["warn", "Moderate sugar · " + r1(per.sugar) + " g/100 g"]);
  if (has("sodium") && per.sodium >= 600) fl.push(["red", "High sodium · " + Math.round(per.sodium) + " mg/100 g"]);
  if (has("sat") && per.sat >= 5) fl.push(["warn", "High saturated fat · " + r1(per.sat) + " g/100 g"]);
  if (meta.add >= 3) fl.push(["warn", meta.add + " additives"]); else if (meta.add > 0) fl.push(["info", meta.add + " additive" + (meta.add === 1 ? "" : "s")]);
  if ((+per.fiber || 0) >= 6) fl.push(["good", "High fiber"]);
  if ((+per.p || 0) >= 15) fl.push(["good", "High protein"]);
  if (meta.nova === 1) fl.push(["good", "Whole food"]);
  return { score: isFinite(score) ? score : 50, est, fl };
}
const QSWAP = [
  [/cereal|granola|muesli/i, "Rolled oats with blueberries and a spoon of honey"],
  [/bar\b|cookie|biscuit|candy|chocolate|brownie|donut|pastry|cake/i, "Greek yogurt with berries, or an apple with almond butter"],
  [/soda|cola|juice|energy drink|lemonade|sweet tea/i, "Sparkling water with lemon or lime"],
  [/chips|crisps|cracker|pretzel|puffs/i, "Rice cakes with almond butter, or a handful of almonds"],
  [/sausage|bacon|salami|ham\b|hot dog|nugget|deli/i, "Chicken breast, turkey or eggs you cook yourself"],
  [/yogurt|yoghurt|pudding/i, "Plain Greek yogurt with fruit you add yourself"],
  [/bread|bun\b|wrap|tortilla|bagel/i, "Whole-wheat bread, or rice or potatoes as the carb"],
  [/sauce|dressing|ketchup|mayo/i, "Olive oil, lemon, herbs and spices"],
  [/noodle|ramen|instant|frozen meal|pizza/i, "Batch-cooked rice or pasta with chicken and vegetables"],
  [/ice cream|gelato/i, "Frozen banana blended with Greek yogurt"]
];
function qSwap(name, q) {
  if (q.score >= 60) return "";
  const m = QSWAP.find(([re]) => re.test(name || ""));
  if (m) return m[1];
  const bad = q.fl.map(f => f[1]).join(" ");
  return /sugar/i.test(bad) ? "Fruit plus a protein source, such as an apple with Greek yogurt" : /sodium/i.test(bad) ? "A home-cooked version seasoned with herbs, garlic and lemon" : /Ultra/.test(bad) ? "The closest single-ingredient food: meat, fish, eggs, oats, rice, potatoes, fruit, vegetables" : "";
}
const QNOVA3 = ["whey", "pea", "ricecake", "bread", "pasta", "cheddar", "seitan", "tofu", "tempeh", "pnb", "almb", "honey"];
function qFood(id) {
  const f = FOODS[id]; if (!f) return null;
  return qScore({ kcal: 4 * f.p + 4 * f.c + 9 * f.f, p: f.p, fiber: (f.mi && f.mi.fiber) || 0, sodium: f.mi && f.mi.sodium }, { nova: QNOVA3.includes(id) ? 3 : 1, add: 0 });
}
function qMeal(mm) {
  if (mm.user || !mm.items || !mm.items.length) { const r = (S.recipes || []).find(x => "u" + x.id === mm.tid); return r ? qRecipe(r) : null; }
  let w = 0, s = 0; mm.items.forEach(it => { const q = qFood(it.id), k = itemMac(it).kc || 1; if (q) { w += k; s += q.score * k; } });
  return w ? { score: Math.round(s / w), est: true, fl: [] } : null;
}
function qRecipe(r) {
  let w = 0, s = 0, hit = 0;
  (r.ing || []).forEach(l => { const low = l.toLowerCase(), k = KW.find(([id, ws]) => ws.some(x => low.includes(x))); if (!k) return; const q = qFood(k[0]), g = lineGrams(l, k[0]) || 50; if (q) { w += g; s += q.score * g; hit++; } });
  const junk = (r.ing || []).filter(l => /sugar|syrup|cream\b|butter|bacon|sausage|mayo|fried/i.test(l)).length;
  if (!hit) return null;
  return { score: Math.max(5, Math.round(s / w) - junk * 6), est: true, fl: junk ? [["warn", junk + " rich ingredient" + (junk === 1 ? "" : "s")]] : [] };
}
function qEntry(x) {
  if (x.q != null) return { score: x.q, est: false, fl: (x.fl || []).map(f => Array.isArray(f) ? f : ["info", f]) };
  if (!(x.kcal > 0)) return null;
  const g = x.g > 0 ? x.g : null, per = g ? { kcal: x.kcal / g * 100, p: x.p / g * 100, fiber: ((x.m || {}).fiber || 0) / g * 100, sodium: x.m && x.m.sodium != null ? x.m.sodium / g * 100 : undefined } : { kcal: 200, p: x.p / x.kcal * 200 };
  return Object.assign(qScore(per, {}), { est: true });
}
function qDay(d) {
  let w = 0, s = 0; const items = [];
  d.meals.forEach((mm, i) => { if (!S.checks[`${d.date}|meal|${i}`]) return; const q = qMeal(mm), k = mm.kcal * mealMultOf(d.date, i); if (q) { w += k; s += q.score * k; items.push({ n: mm.name, kcal: k, q }); } });
  ((S.flog || {})[d.date] || []).forEach(x => { const q = qEntry(x); if (q) { w += x.kcal; s += q.score * x.kcal; items.push({ n: x.n, kcal: x.kcal, q }); } });
  return { score: w ? Math.round(s / w) : null, items: items.sort((a, b) => a.q.score - b.q.score) };
}
const qPill = q => q ? `<span class="qpill q-${QGRADE(q.score)[1]}" title="Quality score ${q.score}/100${q.est ? " (estimate)" : ""}">${q.est ? "~" : ""}${q.score}</span>` : "";
const qFlags = q => q && q.fl.length ? `<div class="qflags">${q.fl.map(f => `<span class="qf q-${f[0]}">${esc(f[1])}</span>`).join("")}</div>` : "";

/* ---------- Food Search, iOS-Capable Barcode Scanner & Food Log ---------- */
const FSF = "code,product_name,brands,nutriments,serving_quantity,nova_group,additives_n,labels_tags";
let FS = { q: "", bc: "", cc: "united-states", res: [], msg: "" };
const nz = v => { v = parseFloat(v); return isFinite(v) ? v : 0; };
function offNorm(p) {
  const n = p.nutriments || {}, kcal = nz(n["energy-kcal_100g"]) || nz(n.energy_100g) / 4.184;
  if (!p.product_name || !(kcal > 0)) return null;
  const opt = k => n[k] != null && n[k] !== "" && isFinite(+n[k]) ? +n[k] : undefined, nova = +p.nova_group, add = p.additives_n;
  return {
    n: p.product_name + (p.brands ? " (" + p.brands.split(",")[0].trim() + ")" : ""),
    srv: Math.round(nz(p.serving_quantity)) || 100,
    meta: { nova: nova >= 1 && nova <= 4 ? nova : undefined, add: add != null && add !== "" && isFinite(+add) ? +add : undefined, org: Array.isArray(p.labels_tags) && p.labels_tags.some(t => /organic/.test(t)) },
    per: {
      kcal, p: nz(n.proteins_100g), c: nz(n.carbohydrates_100g), f: nz(n.fat_100g), fiber: nz(n.fiber_100g),
      sugar: opt("sugars_100g"), sat: opt("saturated-fat_100g"),
      sodium: n.sodium_100g != null ? nz(n.sodium_100g) * 1000 : n.salt_100g != null ? nz(n.salt_100g) * 400 : 0,
      iron: nz(n.iron_100g) * 1000, ca: nz(n.calcium_100g) * 1000, mg: nz(n.magnesium_100g) * 1000,
      k: nz(n.potassium_100g) * 1000, vd: nz(n["vitamin-d_100g"]) * 1e6, vc: nz(n["vitamin-c_100g"]) * 1000
    }
  };
}
async function fsSearch() {
  const q = FS.q.trim();
  if (q.length < 2) { FS.msg = "Type at least 2 letters"; renderFood(); renderQuality(); return; }
  FS.msg = "Searching…"; FS.res = []; renderFood(); renderQuality();
  try {
    const url = "https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=15&fields=" + FSF + "&search_terms=" + encodeURIComponent(q) + (FS.cc ? "&tagtype_0=countries&tag_contains_0=contains&tag_0=" + FS.cc : "");
    let r;
    try { r = await fetch(url); } catch (e) { await new Promise(t => setTimeout(t, 1200)); r = await fetch(url); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    FS.res = ((await r.json()).products || []).map(offNorm).filter(Boolean);
    FS.msg = FS.res.length ? "" : "No matches. Try fewer words or a barcode";
  } catch (e) { FS.msg = "Food database unreachable: " + e.message; FS.res = []; }
  renderFood(); renderQuality();
}
async function fsBarcode(code) {
  code = String(code || "").replace(/\D/g, "");
  if (code.length < 8) { FS.msg = "Enter the 8 to 14 digit barcode"; renderFood(); renderQuality(); return; }
  FS.msg = "Looking up " + code + "…"; renderFood(); renderQuality();
  try {
    const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + code + ".json?fields=" + FSF);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json(), it = j.status === 1 ? offNorm(j.product) : null;
    FS.res = it ? [it] : []; FS.msg = it ? "" : "Not in the database. Use Quick macros instead";
  } catch (e) { FS.msg = "Food database unreachable: " + e.message; FS.res = []; }
  renderFood(); renderQuality();
}
function flogAdd(e) {
  const x = Object.assign({}, e, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) });
  (S.flog[S.sel] = S.flog[S.sel] || []).push(x); save(); renderPlan(); return x;
}
function fsAdd(i, g) {
  const it = FS.res[i]; g = nz(g); if (!it || g <= 0) return;
  const k = g / 100, s = x => Math.round(x * k * 10) / 10;
  const e = { id: Date.now().toString(36) + i, n: it.n, g: Math.round(g), kcal: Math.round(it.per.kcal * k), p: s(it.per.p), c: s(it.per.c), f: s(it.per.f), m: {} };
  ["fiber", "sodium", "iron", "ca", "mg", "k", "vd", "vc"].forEach(x => { e.m[x] = s(it.per[x]); });
  const q = qScore(it.per, it.meta); e.q = q.score; e.fl = q.fl.filter(f => f[0] !== "good").slice(0, 3);
  (S.flog[S.sel] = S.flog[S.sel] || []).push(e); save(); renderPlan();
}
/* Supports native BarcodeDetector AND lazy-loaded ZXing CDN fallback on iOS Safari */
async function fsScan() {
  let stream, iv, zxingReader = null;
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:260;background:#050608;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px";
  ov.innerHTML = `<div class="sechl">Point camera at barcode</div><video playsinline muted style="max-width:100%;max-height:66vh;border-radius:16px;border:1px solid var(--border-strong)"></video><div class="d" id="scanStatus">Initializing camera…</div><button class="btn pri">Cancel</button>`;
  document.body.appendChild(ov);
  const done = c => {
    clearInterval(iv);
    if (zxingReader && zxingReader.reset) try { zxingReader.reset(); } catch (e) {}
    if (stream) stream.getTracks().forEach(t => t.stop());
    ov.remove();
    if (c) { FS.bc = c; fsBarcode(c); }
  };
  ov.querySelector("button").onclick = () => done();
  try {
    const v = ov.querySelector("video");
    if ("BarcodeDetector" in window) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      v.srcObject = stream; await v.play();
      const st = ov.querySelector("#scanStatus"); if (st) st.textContent = "Scanning…";
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      iv = setInterval(async () => { try { const b = await det.detect(v); if (b.length) done(b[0].rawValue); } catch (e) {} }, 300);
    } else {
      const st = ov.querySelector("#scanStatus"); if (st) st.textContent = "Loading scanner for Safari…";
      if (!window.ZXingBrowser) {
        await new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js"; sc.onload = res; sc.onerror = () => rej(new Error("Offline — type barcode number instead")); document.head.appendChild(sc); });
      }
      zxingReader = new window.ZXingBrowser.BrowserMultiFormatReader();
      if (st) st.textContent = "Scanning…";
      const controls = await zxingReader.decodeFromConstraints({ video: { facingMode: "environment" } }, v, (result) => {
        if (result && result.getText) { controls && controls.stop && controls.stop(); done(result.getText()); }
      });
      ov.querySelector("button").onclick = () => { controls && controls.stop && controls.stop(); done(); };
    }
  } catch (e) { done(); FS.msg = "Scanner unavailable: " + e.message; renderFood(); renderQuality(); }
}

const QA = [];
function recentFoods() {
  const seen = new Set(S.favs.map(f => f.n)), out = [];
  Object.keys(S.flog || {}).sort().reverse().slice(0, 21).forEach(d => (S.flog[d] || []).slice().reverse().forEach(x => { if (x && x.n && !seen.has(x.n) && out.length < 8) { seen.add(x.n); out.push(x); } }));
  return out;
}
function renderFood() {
  const b = $("foodBox"); if (!b) return;
  v4Norm(); QA.length = 0;
  const chip = (x, fav) => { QA.push(x); return `<button type="button" class="fchip ${fav ? "s1" : "s0"}" data-qa="${QA.length - 1}" title="${Math.round(x.kcal)} kcal · P ${x.p} · C ${x.c} · F ${x.f}">${fav ? "★ " : ""}${esc(x.n.length > 26 ? x.n.slice(0, 25) + "…" : x.n)} <small>${Math.round(x.kcal)}</small></button>`; };
  const rec = recentFoods();
  const quickH = `<div class="qadd">${S.favs.length || rec.length ? `${S.favs.length ? `<div class="sechl">Favorites · tap to log</div><div class="fchips">${S.favs.map(x => chip(x, true)).join("")}</div>` : ""}${rec.length ? `<div class="sechl" style="margin-top:8px">Recent</div><div class="fchips">${rec.map(x => chip(x, false)).join("")}</div>` : ""}`
    : callout("info", "zap", "Log faster next time", "", "Foods you log appear here as one-tap buttons. Star any logged item to save it as a favorite.")}</div>`;
  const list = (S.flog && S.flog[S.sel]) || [], t = k => list.reduce((a, x) => a + (x[k] || 0), 0);
  const canCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  b.innerHTML = `${quickH}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="fsQ" placeholder="Search Open Food Facts…" value="${esc(FS.q)}" style="flex:1;min-width:160px"/><select id="fsCc" style="min-width:110px">${[["united-states", "US"], ["canada", "CA"], ["united-kingdom", "UK"], ["australia", "AU"], ["", "All"]].map(([v, l]) => `<option value="${v}"${FS.cc === v ? " selected" : ""}>${l}</option>`).join("")}</select><button class="btn pri" id="fsGo">Search</button></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="fsBc" inputmode="numeric" placeholder="Barcode number" value="${esc(FS.bc)}" style="flex:1;min-width:140px"/><button class="btn" id="fsBcGo">Look up</button>${canCam ? `<button class="btn" id="fsScan">${ico("scan", 15)} Scan</button>` : ""}</div>
  ${FS.msg ? `<div class="d" style="margin-top:8px">${esc(FS.msg)}</div>` : ""}
  ${FS.res.map((it, i) => `<div class="row"><div class="body"><div class="t">${qPill(qScore(it.per, it.meta))}${esc(it.n)}</div><div class="d">per 100 g: ${Math.round(it.per.kcal)} kcal · ${r1(it.per.p)}P · ${r1(it.per.c)}C · ${r1(it.per.f)}F</div><div class="perfrow"><input class="perf" type="number" inputmode="decimal" id="fsG${i}" value="${it.srv}"/><span>g</span><button class="btn pri" data-fsadd="${i}">Add</button></div></div></div>`).join("")}
  <h3>Logged ${S.sel === TODAY ? "today" : esc(S.sel)}</h3>
  ${list.length ? list.map(x => `<div class="irow"><span>${qPill(qEntry(x))}${esc(x.n)}${x.g ? ` · ${x.g} g` : ""}</span><span class="ims">${x.kcal} kcal · ${x.p}P · ${x.c}C · ${x.f}F <button class="rest ${S.favs.some(f => f.n === x.n) ? "on" : ""}" data-fsfav="${esc(x.id)}" aria-label="Favorite">${S.favs.some(f => f.n === x.n) ? "★" : "☆"}</button><button class="rest" data-fsdel="${esc(x.id)}">Remove</button></span></div>`).join("") + `<div class="irow itot"><span>Total</span><span class="ims">${Math.round(t("kcal"))} kcal · ${Math.round(t("p"))}P · ${Math.round(t("c"))}C · ${Math.round(t("f"))}F</span></div>` : '<div class="d">Nothing logged yet.</div>'}`;
}

function renderMicro() {
  const b = $("microBox"); if (!b || !W) return;
  const d = selDay(), f = S.prof.sex === "f", dm = dayMicros(d);
  if (!dm.count) { b.innerHTML = '<div class="d">Tick planned meals or log foods to see fiber, sodium, potassium, calcium, magnesium, iron, vitamin D and vitamin C.</div>'; return; }
  const kc = d.macros.kcal || 2000;
  const R = [["fiber", "Fiber", "g", Math.round(14 * kc / 1000), 0], ["sodium", "Sodium (limit)", "mg", 2300, 1], ["k", "Potassium", "mg", f ? 2600 : 3400, 0], ["ca", "Calcium", "mg", 1000, 0], ["mg", "Magnesium", "mg", f ? 310 : 400, 0], ["iron", "Iron", "mg", f ? 18 : 8, 0], ["vd", "Vitamin D", "µg", 15, 0], ["vc", "Vitamin C", "mg", f ? 75 : 90, 0]];
  b.innerHTML = R.map(([k, l, u, ref, lim]) => {
    const v = dm.tot[k] || 0, pct = v / ref * 100;
    return `<div class="vrow"><span>${l}</span><div class="vbar"><i style="width:${Math.min(100, pct)}%;background:${lim && pct > 100 ? "var(--red)" : "var(--green)"}"></i></div><small>${Math.round(pct)}%</small><span>${r1(v)} ${u}</span></div>`;
  }).join("") + '<div class="d" style="margin-top:8px">Includes ticked planned meals (USDA reference values) plus logged packaged foods.</div>';
}

function renderQuality() {
  const el = $("pane-quality"); if (!el || !W) return;
  const d = selDay(), qd = qDay(d), low = qd.items.filter(x => x.q.score < 50).slice(0, 3);
  const keepQ = $("qQ") ? $("qQ").value : FS.q, keepB = $("qBc") ? $("qBc").value : FS.bc;
  const canCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const res = FS.res.map((it, i) => {
    const q = it.q || qScore(it.per, it.meta), sw = qSwap(it.n, q);
    return `<div class="qcard"><div class="qc-h">${qPill(q)}<div><b>${esc(it.n)}</b><small>${QGRADE(q.score)[0]}${q.est ? " · estimate, label data incomplete" : ""}</small></div></div>${qFlags(q)}
     <div class="d">per 100 g: ${Math.round(it.per.kcal)} kcal · ${r1(it.per.p)}P · ${r1(it.per.c)}C · ${r1(it.per.f)}F${it.per.sugar != null ? " · Sugar " + r1(it.per.sugar) + "g" : ""}${it.per.sodium ? " · Sodium " + Math.round(it.per.sodium) + " mg" : ""}</div>
     ${sw ? `<div class="qswap">${ico("swap", 15)}<span><b>Cleaner swap:</b> ${esc(sw)}</span></div>` : ""}
     <div class="perfrow"><input class="perf" type="number" inputmode="decimal" id="qG${i}" value="${it.srv}" aria-label="Grams"/><span>g</span><button class="btn pri" data-qadd="${i}">Log to ${S.sel === TODAY ? "today" : esc(dateLabel(S.sel, { weekday: "short" }))}</button></div></div>`;
  }).join("");
  const loading = /^(Searching|Looking)/.test(FS.msg);
  el.innerHTML = `<div class="grid2"><div>
    <div class="card"><h2><span>Food quality · ${S.sel === TODAY ? "today" : esc(dateLabel(S.sel))}</span><span class="badge">0–100</span></h2>
     <div class="qtop">${qGauge(qd.score)}<div class="qtop-t">${qd.score == null ? callout("info", "utensils", "Nothing eaten yet on this day", "", "Tick a meal on Today or log a food to compute your calorie-weighted quality score.")
       : `<div class="d">Weighted by calories across ${qd.items.length} item${qd.items.length === 1 ? "" : "s"}. Whole foods score high; added sugar, sodium, saturated fat, additives and ultra-processing pull it down.</div>${low.length ? callout("warn", "alert", "What pulled the score down", "", `<ul class="cl">${low.map(x => { const sw = qSwap(x.n, x.q); return `<li><b>${esc(x.n)}</b> · ${x.q.score}/100${sw ? `<br><small>Swap: ${esc(sw)}</small>` : ""}</li>`; }).join("")}</ul>`) : callout("good", "leaf", "Clean day so far", "", "Nothing logged scores under 50.")}`}</div></div>
     ${qd.items.length ? `<div class="itab pro-only" style="margin-top:10px">${qd.items.map(x => `<div class="irow"><span>${qPill(x.q)} ${esc(x.n)}</span><span class="ims">${Math.round(x.kcal)} kcal</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="card"><h2><span>Planned meals</span><span class="badge">estimates</span></h2>${d.meals.map(mm => { const q = qMeal(mm); return `<div class="irow"><span>${qPill(q)} ${esc(mm.name)}</span><span class="ims">${mm.kcal} kcal</span></div>`; }).join("")}</div>
    ${(S.recipes || []).length ? `<div class="card"><h2><span>My recipes</span></h2>${S.recipes.map(r => { const q = qRecipe(r); return `<div class="irow"><span>${q ? qPill(q) : '<span class="qpill">?</span>'} ${esc(r.name)}</span><span class="ims">${q ? QGRADE(q.score)[0] : "unrecognised"}</span></div>`; }).join("")}</div>` : ""}
   </div><div>
    <div class="card"><h2><span>Check a product</span></h2>
     <div class="d">Search a packaged food or scan its barcode for a 0–100 score, flags, and a cleaner swap.</div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="qQ" placeholder="Search, e.g. granola bar" value="${esc(keepQ)}" style="flex:1;min-width:160px"/><button class="btn pri" id="qGo">Search</button></div>
     <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="qBc" inputmode="numeric" placeholder="Barcode number" value="${esc(keepB)}" style="flex:1;min-width:140px"/><button class="btn" id="qBcGo">Look up</button>${canCam ? `<button class="btn" id="qScan">${ico("scan", 15)} Scan</button>` : ""}</div>
     ${loading ? '<div class="skelw" aria-label="Loading"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>' : FS.msg ? `<div class="d" style="margin-top:8px">${esc(FS.msg)}</div>` : ""}
     ${res || (loading ? "" : `<div class="empty"><div class="empty-i">${ico("scan", 20)}</div><b>Scan your first product</b><p>Try one of these to see how scoring works:</p><div class="fchips">${["greek yogurt", "granola bar", "cola", "protein bar", "instant noodles"].map(x => `<button type="button" class="fchip s0" data-qtry="${x}">${x}</button>`).join("")}</div></div>`)}
    </div>
    <div class="card"><h2><span>How the score works</span></h2><div class="d" style="line-height:1.6"><b>60% nutrient balance</b> per 100 g · <b>25% processing</b> (NOVA 1–4) · <b>15% additives</b>. Missing label data is re-weighted and marked with ~.</div></div>
   </div></div>`;
}

/* ---------- Cook Mode ---------- */
let CK = null;
function openCook(date, i) {
  const d = W.days.find(x => x.date === date), mm = d && d.meals[i];
  if (!mm || !mm.rec) return;
  const key = date + "|" + i, v = mm.var, tab = UIT[key] || (S.prof.budget === "budget" && v ? "bud" : "std");
  const steps = tab === "bud" && v ? v.b[1] : tab === "gour" && v ? v.g[1] : mm.rec.slice(1);
  CK = { mm, steps, step: -1, mult: 1, tab, lock: null };
  $("cook").hidden = false; document.body.style.overflow = "hidden"; drawCook();
  try { navigator.wakeLock.request("screen").then(l => { if (CK) CK.lock = l; else l.release(); }).catch(() => {}); } catch (e) {}
}
function openCookRecipe(id) {
  const r = (S.recipes || []).find(x => x.id === id); if (!r) return;
  const m = RSC[id] || 1;
  CK = { mm: { name: r.name, rec: [r.time && r.time !== "your recipe" ? r.time : "Your recipe"], user: true, ing: r.ing.map(l => scaleLine(l, m)), kcal: Math.round(r.kcal * m), P: Math.round(r.P * m), C: Math.round(r.C * m), F: Math.round(r.F * m) }, steps: r.steps || [], step: -1, mult: m, tab: "std", lock: null, rid: id };
  $("cook").hidden = false; document.body.style.overflow = "hidden"; drawCook();
  try { navigator.wakeLock.request("screen").then(l => { if (CK) CK.lock = l; else l.release(); }).catch(() => {}); } catch (e) {}
}
function closeCook() {
  if (CK && CK.lock) CK.lock.release().catch(() => {});
  CK = null; $("cook").hidden = true; document.body.style.overflow = "";
}
function drawCook() {
  const c = CK; if (!c) return;
  if (c.rid) {
    const r = (S.recipes || []).find(x => x.id === c.rid);
    if (r) { const m = c.mult; Object.assign(c.mm, { ing: r.ing.map(l => scaleLine(l, m)), kcal: Math.round(r.kcal * m), P: Math.round(r.P * m), C: Math.round(r.C * m), F: Math.round(r.F * m) }); }
  }
  const m = c.mm, n = c.steps.length, tabName = { std: "Standard", bud: "Budget", gour: "Gourmet" }[c.tab];
  let body;
  if (c.step < 0) {
    const multRow = c.rid
      ? `<div class="ck-mult">Batch: ${[1, 2, 3, 4, 5, 6, 8, 10].map(x => `<button type="button" class="rtab ${x === c.mult ? "on" : ""}" data-ckact="m${x}">×${x}</button>`).join("")}</div>`
      : m.user ? "" : `<div class="ck-mult">Servings: ${[1, 2, 3, 4].map(x => `<button type="button" class="rtab ${x === c.mult ? "on" : ""}" data-ckact="m${x}">×${x}</button>`).join("")}</div>`;
    body = `<div class="ck-sub">${tabName} · ${esc(m.rec[0])}</div>${multRow}
      <div class="ck-list">${m.user ? m.ing.map(l => `<div>${esc(l)}</div>`).join("") : m.items.map(it => { const im = itemMac({ id: it.id, g: it.g * c.mult }); return `<div>${esc(qtyText(it.id, Math.round(it.g * c.mult), S.prof.units, false))}${FOODS[it.id].u && BARE2.includes(FOODS[it.id].u[0]) ? "" : " " + esc(FOODS[it.id].n.toLowerCase())} <small class="ims">${im.kc} kcal · ${im.P}P</small></div>`; }).join("")}</div>
      <div class="d" style="max-width:680px;width:100%;margin:0 auto">${m.user ? "Planned portion" : "Per serving"}: ${m.kcal} kcal · ${m.P}P · ${m.C}C · ${m.F}F</div>
      ${c.rid ? `<button type="button" class="btn" data-rlog="${c.rid}" data-m="${c.mult}" style="max-width:680px;width:100%;margin:0 auto">+ Log ${c.mult} serving${c.mult === 1 ? "" : "s"} to food log</button>` : ""}
      <button type="button" class="btn ck-go" data-ckact="next">${!n ? "Close" : "Start cooking ›"}</button>`;
  } else {
    body = `<div class="ck-sub">Step ${c.step + 1} of ${n}</div><div class="ck-step">${esc(c.steps[c.step])}</div><div class="ck-nav"><button type="button" class="btn" data-ckact="prev">‹ Back</button><button type="button" class="btn ck-go" data-ckact="next">${c.step === n - 1 ? "Done" : "Next ›"}</button></div>`;
  }
  $("cook").innerHTML = `<div class="ck-head"><b>${esc(m.name)}</b><button type="button" class="btn" data-ckact="close">${ico("x", 15)} Close</button></div>${body}`;
}
function cookAct(a) {
  if (!CK) return;
  if (a === "close") { closeCook(); return; }
  if (a === "next") { if (CK.step >= CK.steps.length - 1) { closeCook(); return; } CK.step++; }
  else if (a === "prev") CK.step = Math.max(-1, CK.step - 1);
  else if (a[0] === "m") CK.mult = +a.slice(1);
  drawCook();
}

/* ---------- Kitchen, Recipes, Scaler & Consolidated Groceries ---------- */
let KQ = "", RFID = null;
const RSC = {};
const PRF = () => { S.prefs = S.prefs || { foods: {}, meals: {} }; S.prefs.foods = S.prefs.foods || {}; S.prefs.meals = S.prefs.meals || {}; return S.prefs; };
function afterPrefs() { save(); regen(); renderAll(true); }
function cycleFood(id) { const f = PRF().foods, v = f[id] || 0, n = v === 0 ? 1 : v === 1 ? -1 : 0; if (n) f[id] = n; else delete f[id]; afterPrefs(); }
function setMealPref(id, v) { const m = PRF().meals; if (m[id] === v) delete m[id]; else m[id] = v; afterPrefs(); }
function mealName(id) { const t = TPL.find(x => x.id === id); if (t) return t.n; const r = (S.recipes || []).find(x => "u" + x.id === id); return r ? r.name + " (yours)" : id; }

function numOf(s) {
  s = s.trim(); let m;
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s.replace(",", ".")) || 0;
}
function lineGrams(line, id) {
  const L = line.toLowerCase(), m = L.match(/(\d+\s+\d\/\d|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(kg|grams?|g|ounces?|oz|pounds?|lbs?|lb|ml|tablespoons?|tbsp|teaspoons?|tsp|cups?|slices?|cakes?|scoops?)?(?![a-z])/);
  if (!m) return 0;
  const n = numOf(m[1]), u = (m[2] || "").replace(/s$/, ""), f = FOODS[id];
  let g = 0;
  if (u === "kg") g = n * 1000; else if (u === "g" || u === "gram") g = n; else if (u === "oz" || u === "ounce") g = n * 28.35;
  else if (u === "lb" || u === "pound") g = n * 453.6; else if (u === "ml") g = n;
  else if (u === "tbsp" || u === "tablespoon") g = TBSPG[id] ? n * TBSPG[id] : 0;
  else if (u === "tsp" || u === "teaspoon") g = TBSPG[id] ? n * TBSPG[id] / 3 : 0;
  else if (u === "cup") g = CUPG[id] ? n * CUPG[id] : 0;
  else if (u === "slice" || u === "cake" || u === "scoop" || !u) g = f.u ? n * f.u[1] : 0;
  if (g && f.raw !== 1 && !/cooked/.test(L) && ["kg", "g", "gram", "oz", "ounce", "lb", "pound"].includes(u)) g = g / f.raw;
  return g;
}
function estimateMacros(lines) {
  let P = 0, C = 0, F = 0, hit = 0;
  lines.forEach(l => {
    const low = l.toLowerCase(), k = KW.find(([id, ws]) => ws.some(w => low.includes(w))); if (!k) return;
    const g = lineGrams(l, k[0]); if (!g) return;
    const f = FOODS[k[0]]; P += f.p * g / 100; C += f.c * g / 100; F += f.f * g / 100; hit++;
  });
  return { P, C, F, hit, total: lines.length };
}
const fmtQty = n => String(Math.round(n * 100) / 100);
function scaleLine(line, m) {
  if (m === 1) return line;
  return String(line).replace(/^(\s*)(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)/, (a, sp, num) => sp + fmtQty(numOf(num) * m));
}
function qtyKey(line) {
  const m = String(line).trim().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*([a-zA-Z]+\.?)?\s+(.*)$/);
  if (!m) return null;
  const units = /^(kg|g|grams?|oz|ounces?|lb|lbs?|pounds?|ml|l|cups?|tbsp|tsp|tablespoons?|teaspoons?|cloves?|slices?|cans?|scoops?|pinch)$/i;
  const hasU = m[2] && units.test(m[2].replace(".", ""));
  return { n: numOf(m[1]), u: hasU ? m[2].toLowerCase().replace(/\.$/, "").replace(/s$/, "") : "", name: (hasU ? m[3] : ((m[2] || "") + " " + m[3])).trim().toLowerCase() };
}
function addGroceryLines(lines) {
  S.groc = S.groc || []; let merged = 0, added = 0;
  lines.forEach(l => {
    l = String(l || "").trim(); if (!l) return;
    const k = qtyKey(l), hit = k && S.groc.find(x => { if (x.done) return false; const o = qtyKey(x.t); return o && o.u === k.u && o.name === k.name; });
    if (hit) { const o = qtyKey(hit.t), n = o.n + k.n; hit.t = `${fmtQty(n)}${k.u ? " " + (n > 1 && /^(cup|clove|slice|can|scoop)$/.test(k.u) ? k.u + "s" : k.u) : ""} ${k.name}`; merged++; }
    else if (!k && S.groc.some(x => !x.done && x.t.toLowerCase() === l.toLowerCase())) merged++;
    else { S.groc.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: l, done: false }); added++; }
  });
  save(); renderCustomGrocery();
  return { merged, added };
}
const AISLE = [
  ["Produce", /onion|garlic|tomato|lemon|lime|carrot|herb|cilantro|parsley|basil|ginger|berr|fruit|apple|banana|avocado|spinach|broccoli|pepper|lettuce|salad|mushroom|zucchini|cucumber|potato|celery|kale/i],
  ["Meat & fish", /chicken|beef|steak|turkey|pork|salmon|cod|tuna|shrimp|fish|bacon|sausage|lamb/i],
  ["Dairy & eggs", /milk|butter|cream|yogurt|yoghurt|cheese|egg/i],
  ["Grains & bakery", /rice|oat|pasta|bread|quinoa|flour|tortilla|wrap|cereal|noodle|bagel/i],
  ["Pantry", /oil|sugar|salt|spice|sauce|stock|broth|vinegar|soy|can\b|beans|lentil|honey|nut|almond|peanut|seed|chia|powder|protein|whey|creatine/i],
  ["Frozen", /frozen/i]
];
const aisleOf = t => (AISLE.find(([, re]) => re.test(t)) || ["Other"])[0];

function buildKitchenForm() {
  $("kForm").innerHTML = `
  <div class="cg"><label>Paste a recipe, or upload a .txt / .md / .json file</label><textarea id="rfPaste" placeholder="Paste recipe text here. Headings such as Ingredients and Instructions help the importer."></textarea></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px"><button type="button" class="btn" id="btnRfParse">Fill form from text</button><button type="button" class="btn" id="btnRfFile">Upload file</button><input type="file" id="rfFile" accept=".txt,.md,.json,text/plain,application/json" hidden/></div>
  <div class="fgrid"><div class="cg"><label>Name</label><input id="rfName"/></div><div class="cg"><label>Time (optional)</label><input id="rfTime" placeholder="20 min"/></div></div>
  <h3>Use as</h3>
  <div class="chips" id="rfSlots"><label class="chip"><input type="checkbox" value="B"/>Breakfast</label><label class="chip"><input type="checkbox" value="M"/>Main meal</label><label class="chip"><input type="checkbox" value="S"/>Snack</label><label class="chip"><input type="checkbox" value="E"/>Evening</label></div>
  <h3>Per serving</h3>
  <div class="fgrid"><div class="cg"><label>Calories</label><input id="rfK" type="number" inputmode="numeric"/></div><div class="cg"><label>Protein g</label><input id="rfP" type="number" inputmode="numeric"/></div><div class="cg"><label>Carbs g</label><input id="rfC" type="number" inputmode="numeric"/></div><div class="cg"><label>Fat g</label><input id="rfF" type="number" inputmode="numeric"/></div><div class="cg"><label>Servings</label><input id="rfServ" type="number" inputmode="numeric" value="1"/></div></div>
  <h3>Ingredients (one per line)</h3><textarea id="rfIng" placeholder="200 g chicken breast&#10;1 cup cooked rice"></textarea>
  <h3>Steps (one per line)</h3><textarea id="rfSteps"></textarea>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn" id="btnRfEst">Estimate macros</button><button type="button" class="btn pri" id="btnRfSave">Save recipe</button><button type="button" class="btn" id="btnRfClear">Clear</button></div>
  <div class="d" id="rfMsg" style="margin-top:8px"></div>`;
}
const rfMsg = m => { const el = $("rfMsg"); if (el) el.textContent = m; };
function clearForm() {
  RFID = null; ["rfPaste", "rfName", "rfTime", "rfK", "rfP", "rfC", "rfF", "rfIng", "rfSteps"].forEach(id => { if ($(id)) $(id).value = ""; });
  if ($("rfServ")) $("rfServ").value = "1";
  document.querySelectorAll("#rfSlots input").forEach(i => i.checked = false);
}
function fillForm(r) {
  $("rfName").value = r.name || ""; $("rfTime").value = r.time && r.time !== "your recipe" ? r.time : "";
  $("rfK").value = r.kcal || ""; $("rfP").value = r.P || ""; $("rfC").value = r.C || ""; $("rfF").value = r.F || "";
  $("rfIng").value = (r.ing || []).join("\n"); $("rfSteps").value = (r.steps || []).join("\n");
  document.querySelectorAll("#rfSlots input").forEach(i => i.checked = (r.slots || []).includes(i.value));
}
function parseRecipeText(txt) {
  txt = txt.trim();
  if (/^[{\[]/.test(txt)) {
    try {
      let j = JSON.parse(txt);
      if (Array.isArray(j)) j = j.find(x => x && (x.recipeIngredient || x["@type"] === "Recipe")) || j[0];
      if (j && j["@graph"]) j = j["@graph"].find(x => x["@type"] === "Recipe") || j;
      if (j && (j.recipeIngredient || j.ing || j.ingredients)) {
        const flat = a => (Array.isArray(a) ? a : [a]).flatMap(s => typeof s === "string" ? s.split(/\r?\n/) : s && s.itemListElement ? flat(s.itemListElement) : [s && s.text || ""]).map(s => String(s).trim()).filter(Boolean);
        return { name: j.name || "", ing: flat(j.recipeIngredient || j.ing || j.ingredients), steps: flat(j.recipeInstructions || j.steps || []), time: j.totalTime || "", kcal: +(j.kcal || 0), P: +(j.P || 0), C: +(j.C || 0), F: +(j.F || 0), slots: j.slots || [] };
      }
    } catch (e) {}
  }
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = { name: "", ing: [], steps: [], time: "" };
  let mode = null, sawHead = false;
  const clean = l => l.replace(/^[-*•▢☐□]\s*/, "").replace(/^(\d+[.)]|step\s*\d+[:.)]?)\s*/i, "");
  lines.forEach((l, i) => {
    const h = l.replace(/[:#*_]/g, "").trim().toLowerCase();
    if (/^ingredients?$/.test(h)) { mode = "ing"; sawHead = true; return; }
    if (/^(instructions?|directions?|method|steps?|preparation)$/.test(h)) { mode = "steps"; sawHead = true; return; }
    if (!out.name && mode === null && i === 0) { out.name = l.replace(/^#+\s*/, ""); return; }
    if (mode === "ing") out.ing.push(clean(l)); else if (mode === "steps") out.steps.push(clean(l));
  });
  if (!sawHead) {
    out.ing = []; out.steps = [];
    lines.slice(out.name ? 1 : 0).forEach(l => { if (/^(\d+\s+\d\/\d|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(kg|g|oz|lb|cup|tbsp|tsp|ml|clove|slice)?s?\b/i.test(clean(l)) && clean(l).length < 70) out.ing.push(clean(l)); else out.steps.push(clean(l)); });
  }
  return out;
}
function saveRecipe() {
  const num = id => parseFloat($(id).value) || 0, name = $("rfName").value.trim();
  const slots = [...document.querySelectorAll("#rfSlots input:checked")].map(i => i.value);
  const P = num("rfP"), C = num("rfC"), F = num("rfF"); let kcal = num("rfK"); if (!kcal) kcal = Math.round(4 * P + 4 * C + 9 * F);
  if (!name) return rfMsg("Add a name.");
  if (!slots.length) return rfMsg("Pick at least one meal type.");
  if (!kcal) return rfMsg("Add macros, or tap Estimate macros.");
  const lines = s => $(s).value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const r = { id: RFID || Date.now().toString(36), name, slots, time: $("rfTime").value.trim() || "your recipe", kcal, P, C, F, ing: lines("rfIng"), steps: lines("rfSteps"), use: true, fav: false };
  const arr = S.recipes = S.recipes || [], i = arr.findIndex(x => x.id === r.id);
  if (i >= 0) { r.use = arr[i].use; r.fav = arr[i].fav; arr[i] = r; } else arr.push(r);
  clearForm(); save(); regen(); renderAll(true); rfMsg("Saved. It can appear in your plan now.");
}
function renderRecipeList() {
  const rs = S.recipes || [], names = { B: "Breakfast", M: "Main", S: "Snack", E: "Evening" };
  $("kRecipes").innerHTML = rs.length ? rs.map(r => {
    const m = RSC[r.id] || 1, q = qRecipe(r);
    return `<div class="row" style="cursor:default"><input type="checkbox" ${r.use !== false ? "checked" : ""} data-ru="${r.id}" title="Use in plan"/><div class="body"><div class="t">${r.fav ? "★ " : ""}${esc(r.name)}</div><div class="d">${r.slots.map(s => names[s]).join(", ")} · ${r.kcal} kcal · ${r.P}P · ${r.C}C · ${r.F}F · ${r.ing.length} ingredients</div>
      <div class="rtools"><div class="rscale" role="group" aria-label="Batch size"><button type="button" class="rest" data-rsc="${r.id}|-1">−</button><b>${m}×</b><button type="button" class="rest" data-rsc="${r.id}|1">+</button><small>${m === 1 ? "1 serving" : m + " servings"} · ${Math.round(r.kcal * m)} kcal · ${Math.round(r.P * m)}P</small>${q ? qPill(q) : ""}</div>
      <div class="rbtns"><button type="button" class="btn pri" data-rck="${r.id}">${ico("flame", 14)} Cook</button><button type="button" class="btn" data-rlog="${r.id}">+ Log ${m > 1 ? m + " servings" : "1 serving"}</button><button type="button" class="btn" data-rgl2="${r.id}">${ico("cart", 14)} Add ×${m} to groceries</button></div>
      ${m > 1 && r.ing.length ? `<details class="rec"><summary>Ingredients for ${m}×</summary><div class="itab">${r.ing.map(l => `<div class="irow"><span>${esc(scaleLine(l, m))}</span></div>`).join("")}</div></details>` : ""}</div></div>
      <div class="btns"><button type="button" class="rest" data-rfv="${r.id}">${r.fav ? "Unfavorite" : "Favorite"}</button><button type="button" class="rest" data-red="${r.id}">Edit</button><button type="button" class="rest" data-rdel="${r.id}">Delete</button></div></div>`;
  }).join("") + '<div class="d" style="margin-top:6px">Ticked recipes can appear in your plan. Favorites appear more often.</div>' : '<div class="d">No recipes yet. Paste or upload one above to add it to your rotation.</div>';
}
function renderKitchen() {
  if (!$("rfName")) buildKitchenForm();
  const ban = bannedTags(S.prof), q = KQ.toLowerCase(), groups = {}, fp = PRF().foods;
  Object.keys(FOODS).forEach(id => { const f = FOODS[id]; if (!foodOK(id, ban) || (q && !f.n.toLowerCase().includes(q))) return; (groups[f.cat || "Other"] = groups[f.cat || "Other"] || []).push(id); });
  const order = ["Protein", "Carbohydrates", "Produce", "Fats", "Supplements", "Other"];
  $("kFoods").innerHTML = order.filter(c => groups[c]).map(c => `<div class="fgroup"><h3>${c}</h3><div class="fchips">${groups[c].map(id => { const s = fp[id] || 0; return `<button type="button" class="fchip s${s}" data-fp="${id}">${s === 1 ? "+ " : s === -1 ? "× " : ""}${esc(FOODS[id].n.split(",")[0])}</button>`; }).join("")}</div></div>`).join("") || '<div class="d">No foods match.</div>';
  const likes = Object.values(fp).filter(v => v === 1).length, dis = Object.values(fp).filter(v => v === -1).length;
  $("kfBadge").textContent = `${likes} liked · ${dis} disliked`;
  const mp = PRF().meals, ids = Object.keys(mp);
  $("kMeals").innerHTML = ids.length ? ids.map(id => `<div class="row" style="cursor:default"><div class="body"><div class="t">${mp[id] === 1 ? "Liked · " : "Disliked · "}${esc(mealName(id))}</div></div><div class="btns"><button type="button" class="rest" data-mpclr="${id}">Reset</button></div></div>`).join("") : '<div class="d">Rate meals on Today to personalize your plan.</div>';
  renderRecipeList();
}

const STAPLES = ["Salt, pepper, herbs and spices", "Lemon / lime", "Garlic", "Cooking spray or parchment paper", "Optional: creatine monohydrate 3–5 g/day"];
function addGrocery(text) {
  text = (text || "").trim(); if (!text) return;
  (S.groc = S.groc || []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4), t: text, done: false });
  save(); renderCustomGrocery();
}
function renderCustomGrocery() {
  const box = $("gCustom"); if (!box) return;
  const g = S.groc || [];
  if (!g.length) { box.innerHTML = '<div class="d" style="margin-top:8px">Nothing added yet.</div>'; }
  else {
    const rowHTML = x => `<div class="row ${x.done ? "done" : ""}"><input type="checkbox" ${x.done ? "checked" : ""} data-gc="${x.id}"/><div class="body"><div class="t">${esc(x.t)}</div></div><div class="btns"><button type="button" class="rest" data-gcx="${x.id}">✕</button></div></div>`;
    if (g.length >= 4) {
      const by = {}; g.forEach(x => { const a = aisleOf(x.t); (by[a] = by[a] || []).push(x); });
      const order = AISLE.map(a => a[0]).concat("Other").filter(a => by[a]);
      box.innerHTML = order.length >= 2 ? order.map(a => `<h3>${esc(a)}</h3>` + by[a].map(rowHTML).join("")).join("") : g.map(rowHTML).join("");
    } else box.innerHTML = g.map(rowHTML).join("");
  }
  const tally = {};
  W.days.forEach(d => d.meals.forEach(m => { if (m.user) (tally[m.tid] = tally[m.tid] || { m, n: 0 }).n += m.mult; }));
  const ids = Object.keys(tally);
  $("gRecipes").innerHTML = ids.length ? "<h3>From your recipes this week</h3>" + ids.map(id => { const t = tally[id]; return `<div class="d" style="margin:6px 0"><b>${esc(t.m.name)}</b>: ${t.n} serving${t.n === 1 ? "" : "s"} in total.<br>${t.m.ing.map(esc).join("<br>")}</div>`; }).join("") : "";
}
function shareList(g, order) {
  const cu = (S.groc || []).filter(x => !x.done).map(x => "- " + x.t);
  const txt = "Groceries, week of " + weekMon() + "\n" + order.filter(c => g[c]).map(c => c + "\n" + g[c].map(i => "- " + i.name + ": " + i.text).join("\n")).join("\n\n") + (cu.length ? "\n\nYour items\n" + cu.join("\n") : "");
  if (navigator.share) navigator.share({ title: "Grocery list", text: txt }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast("Grocery list copied", "good")).catch(() => uiAlert(txt, "Grocery list"));
  else uiAlert(txt, "Grocery list");
}
function renderPrep() {
  const groups = [[0, 4], [4, 7]];
  $("prepList").innerHTML = groups.map(([a, b]) => {
    const tot = {};
    W.days.slice(a, b).forEach(d => d.meals.forEach(m => m.items.forEach(it => { const f = FOODS[it.id]; if ((f.cat === "Protein" || f.cat === "Carbohydrates") && f.raw !== 1) tot[it.id] = (tot[it.id] || 0) + it.g; })));
    const ids = Object.keys(tot).sort((x, y) => tot[y] - tot[x]);
    if (!ids.length) return "";
    return `<h3>Cook ahead for ${dateLabel(W.days[a].date, { weekday: "short" })} to ${dateLabel(W.days[b - 1].date, { weekday: "short" })}</h3>` + ids.map(id => `<div class="d" style="margin:4px 0"><b>${esc(FOODS[id].n)}</b>: cook about ${qtyText(id, tot[id], S.prof.units, true)} raw (${Math.round(tot[id])} g cooked)${FOODS[id].prep ? " · " + esc(FOODS[id].prep) : ""}</div>`).join("");
  }).join("") + '<div class="d" style="margin-top:10px">Cooked food keeps 3–4 days in the fridge. Freeze the rest.</div>';
}
function renderGrocery() {
  const g = grocery(W, S.prof.units, S.prof.priceF), order = ["Protein", "Carbohydrates", "Produce", "Fats", "Supplements", "Other"], wk = weekMon();
  let out = "", total = 0, done = 0, cost = 0;
  order.forEach(cat => {
    if (!g[cat]) return;
    out += `<h3>${cat}</h3>`;
    g[cat].forEach(it => { const k = `${wk}|g|${it.id}`; total++; if (S.checks[k]) done++; cost += it.cost; out += row(k, esc(it.name), `Buy about <b>${it.text}</b> (raw / packaged) · ≈$${it.cost.toFixed(2)}`); });
  });
  out += "<h3>Staples</h3>" + STAPLES.map((s, i) => { const k = `${wk}|g|staple${i}`; total++; if (S.checks[k]) done++; return row(k, esc(s), ""); }).join("");
  $("gList").innerHTML = out;
  $("gBadge").textContent = `${done} / ${total} bought · ≈$${Math.round(cost)} / wk`;
  renderPrep(); renderCustomGrocery();
  $("gShare").onclick = () => shareList(g, order);
}
