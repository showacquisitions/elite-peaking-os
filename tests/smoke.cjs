// Smoke + regression tests for Elite OS. Usage: node tests/smoke.cjs [path/to/index.html]
const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));
const url = "file://" + file.split(path.sep).map(encodeURIComponent).join("/").replace(/^\/?/, "/").replace("/%3A", ":");
let failed = 0, passed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ok   " + m) } else { failed++; console.log("  FAIL " + m) } };

async function page(browser, vp) {
  const pg = await browser.newPage({ viewport: vp });
  pg.errors = [];
  pg.on("pageerror", e => pg.errors.push(e.message));
  pg.on("dialog", d => d.accept());
  await pg.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
  await pg.goto(url);
  await pg.waitForFunction(() => typeof W !== "undefined" && W && W.days);
  return pg;
}

(async () => {
  const browser = await chromium.launch();
  const TABS = ["plan", "train", "food:grocery", "food:kitchen", "progress", "overview", "profile"];

  console.log("Layout and errors");
  for (const width of [360, 1280]) {
    const pg = await page(browser, { width, height: 900 });
    for (const t of TABS) {
      await pg.evaluate(t => { const [a, b] = t.split(":"); showTab(a, b) }, t);
      const over = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      ok(!over, `${width}px ${t}: no horizontal scroll`);
    }
    ok(pg.errors.length === 0, `${width}px: no JS errors ${pg.errors.join(" | ")}`);
    await pg.close();
  }

  console.log("Engine");
  const pg = await page(browser, { width: 1280, height: 900 });
  const eng = await pg.evaluate(() => ({ days: W.days.length, sess: W.sessions.length, want: S.prof.days }));
  ok(eng.days === 7, "week has 7 days");
  ok(eng.sess === eng.want, `auto plan has ${eng.want} sessions (got ${eng.sess})`);

  const cust = await pg.evaluate(() => { CP().mode = "custom"; seedFromAuto(); save(); regen(); return { custom: W.custom, sess: W.sessions.length, nTrain: W.nTrain } });
  ok(cust.custom && cust.sess === eng.sess && cust.nTrain === cust.sess, "custom plan seeded from auto drives the week");

  const merge = await pg.evaluate(() => {
    const A = { mode: "custom", mt: 5, active: "p1", plans: { p1: { name: "A", mt: 5, days: { 0: { name: "keepA", mt: 5, ex: [1] }, 1: { name: "old", mt: 1, ex: [1] } } } } };
    const B = { mode: "custom", mt: 3, active: "p1", plans: { p1: { name: "A", mt: 3, days: { 0: { name: "x", mt: 3, ex: [] }, 1: { name: "newB", mt: 3, ex: [] }, 2: { name: "onlyB", mt: 3, ex: [3] } } }, p2: { name: "B", mt: 2, days: {} } } };
    const m = mergeCP(A, B);
    const md = mergeData({ log: { "2026-01-01": { w: 80 } }, wlog: { "2026-01-01": { name: "a" } } }, { log: { "2026-01-02": { w: 79 } }, wlog: { "2026-01-02": { name: "b" } } });
    return [m.plans.p1.days[0].name, m.plans.p1.days[1].name, !!m.plans.p1.days[2], !!m.plans.p2, Object.keys(md.log).length, Object.keys(md.wlog).length];
  });
  ok(merge[0] === "keepA" && merge[1] === "newB", "plan merge: newest edit wins per day, including clears");
  ok(merge[2] && merge[3], "plan merge: keeps days and plans that exist on one side only");
  ok(merge[4] === 2 && merge[5] === 2, "data merge: logs and workout history from both devices survive");

  const prog = await pg.evaluate(() => {
    const u = "test:x"; HI[u] = 10; S.perf[u] = { w: 50, r: 10 };
    PG[u] = { mode: "dbl" }; const a = sugText(u);
    PG[u] = { mode: "reps" }; const b = sugText(u);
    return [a, b];
  });
  ok(/Top of the range/.test(prog[0]), "progression 'add load' suggests more load at top of range");
  ok(/11\+ reps/.test(prog[1]), "progression 'reps only' suggests one more rep");

  const ics = await pg.evaluate(() => { const n = W.sessions.length; const t = weekICS(icsDays(4)); return { n, w: (t.match(/SUMMARY:Workout/g) || []).length, alarms: (t.match(/BEGIN:VALARM/g) || []).length } });
  ok(ics.w >= ics.n * 4 - 1 && ics.alarms >= ics.w, `4-week calendar export has ${ics.w} workouts with alarms`);

  console.log("Workout mode");
  await pg.evaluate(() => { const d = W.days.find(x => x.session); S.sel = d.date; showTab("plan"); renderPlan() });
  await pg.click("#wStart");
  ok(await pg.isVisible("#wm"), "workout mode opens");
  await pg.fill("#wmW", "50"); await pg.fill("#wmR", "8");
  await pg.click('[data-wmrir="2"]'); await pg.click('[data-wm="log"]');
  const set = await pg.evaluate(() => { const e = WM.sess.ex.find(x => S.sets[x.uid + "|" + WM.date]); return e && S.sets[e.uid + "|" + WM.date][0] });
  ok(set && set.r === 8 && set.rir === 2, "logged set stores reps and reps-left");
  const n = await pg.evaluate(() => WM.sess.ex.length);
  for (let i = 0; i < n; i++) { if (await pg.isVisible('[data-wm="save"]')) break; await pg.click('[data-wm="next"]') }
  ok(await pg.isVisible('[data-wm="save"]'), "finish screen appears after the last exercise");
  await pg.fill("#wmNote", "felt strong");
  await pg.click('[data-wm="save"]');
  const wl = await pg.evaluate(() => Object.values(S.wlog).find(l => l.end));
  ok(wl && wl.sets >= 1 && wl.note === "felt strong", "session saved to workout history with note");

  console.log("Progress");
  await pg.evaluate(() => { const u = "test:chart"; ["2026-10-01", "2026-10-08", "2026-10-15"].forEach((d, i) => S.hist[u + "|" + d] = { u, n: "Test lift", d, w: 60 + i * 2.5, r: 5 }); CH.uid = u; showTab("progress"); renderProgress() });
  ok(await pg.locator("#chartBox svg.chart").count() === 1, "strength chart renders");
  ok(await pg.locator("#wlogBox .row").count() >= 1, "workout history lists the session");
  ok(pg.errors.length === 0, "no JS errors during the full run " + pg.errors.join(" | "));

  console.log("Sharing");
  const inv = await pg.evaluate(async () => { let got = null; const sh = navigator.share; navigator.share = async o => { got = o.url }; await inviteFriend(); navigator.share = sh; return got });
  ok(inv && !inv.includes("#") && !/[?&]s=/.test(inv), "Invite a friend shares the plain app link, never your data");

  const vf = path.join(path.dirname(file), "version.json");
  if (fs.existsSync(vf)) {
    const v = JSON.parse(fs.readFileSync(vf, "utf8")).v, av = await pg.evaluate(() => APP_VER);
    ok(v === av, `version.json (${v}) matches APP_VER (${av})`);
  }
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
