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
  const TABS = ["plan", "train", "food:grocery", "food:kitchen", "progress", "overview", "profile", "coach"];

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

  console.log("v3: superset groups");
  const g = await pg.evaluate(() => {
    const c = CP(); c.mode = "custom";
    const ex = [0, 1, 2, 3].map(i => Object.assign(libToEx(EX[i * 7]), { sets: 2, rest: 75 }));
    ex[0].ss = true; ex[1].ss = true;
    const dow = (new Date().getDay() + 6) % 7;
    PLN().days = { [dow]: { name: "SS test", mt: NOW(), ex } }; touch(); save(); S.weekOffset = 0; regen(); S.sel = TODAY; showTab("plan"); renderPlan();
    const grp = document.querySelectorAll("#wList .ssg"), rows = grp[0] ? grp[0].querySelectorAll(".row").length : 0;
    const lab = [...document.querySelectorAll("#wList .ssl")].map(x => x.textContent).join(",");
    return { groups: grp.length, rows, lab, info: ssGroups(selDay().session.ex).map(x => x && x.g + x.k) };
  });
  ok(g.groups === 1 && g.rows === 3, `Today groups the tri-set into one block (${g.groups} group, ${g.rows} rows)`);
  ok(g.lab === "A1,A2,A3" && g.info[3] === null, "superset labels A1, A2, A3; the next exercise stays ungrouped");
  await pg.click("#wStart");
  const seq = [];
  const runs = [];
  for (let k = 0; k < 6; k++) { seq.push(await pg.evaluate(() => WM.i)); await pg.evaluate(() => $("tStop").click()); await pg.fill("#wmR", "8"); await pg.click('[data-wm="log"]'); runs.push(await pg.evaluate(() => $("timer").className === "run" ? 1 : 0)) }
  const after = await pg.evaluate(() => WM.i);
  ok(seq.join("") === "012012" && after === 3, `tri-set rotates A1→A2→A3 each round, then moves on (${seq.join("")} → ${after})`);
  ok(runs.join("") === "001001", `rest timer starts only after A3, once per round (${runs.join("")})`);
  await pg.click('[data-wm="close"]');
  await pg.evaluate(() => { CP().mode = "auto"; save(); regen(); renderAll() });

  console.log("v3: coach assignment + health readiness");
  const ov = await pg.evaluate(() => {
    const d = W.days[2].date;
    S.cx = { links: [], asg: { [d]: { name: "Coach Push", coach: "Sam", note: "Go heavy", ex: [Object.assign(libToEx(EX[0]), { sets: 5, reps: "5" })] } }, msgs: [], ci: {} };
    regen(); const a = W.days[2];
    S.cx.asg[d] = { name: "Rest", coach: "Sam", ex: [] }; regen(); const b = W.days[2];
    S.cx = {}; regen();
    return { label: a.label, sets: a.session && a.session.ex[0].sets, coach: a.session && a.session.coach, rest: b.label, restSess: b.session };
  });
  ok(ov.label === "Coach Push" && ov.sets === 5 && ov.coach === "Sam", "coach assignment replaces the client's session for that date");
  ok(/Rest \(from Sam\)/.test(ov.rest) && !ov.restSess, "coach can set a rest day");
  const rdh = await pg.evaluate(() => {
    const d = TODAY; S.log[d] = { s: "8", e: "5", sr: "1" }; const before = readiness(d).score;
    S.hd = {}; for (let i = 1; i <= 14; i++) S.hd[addD(d, -i)] = { hrv: 60, rhr: 55 };
    S.hd[d] = { hrv: 40, rhr: 63 }; const after = readiness(d).score;
    delete S.log[d]; S.hd = {}; return [before, after];
  });
  ok(rdh[0] > 0.95 && rdh[1] < rdh[0] - 0.2, `low HRV and high resting HR pull readiness down (${rdh[0].toFixed(2)} → ${rdh[1].toFixed(2)})`);
  ok(pg.errors.length === 0, "no JS errors in v3 engine tests " + pg.errors.join(" | "));

  console.log("v3: auth, sync, coach UI (mocked Supabase)");
  const SB = "https://yimjcsyhvoviliupwayl.supabase.co";
  const me = "11111111-1111-1111-1111-111111111111", cl = "22222222-2222-2222-2222-222222222222";
  const mock = async (pgx, calls) => pgx.route(SB + "/**", async r => {
    const u = new URL(r.request().url()), m = r.request().method(); calls.push(m + " " + u.pathname + u.search);
    const J = (b, st) => r.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname === "/auth/v1/recover") return J({});
    if (u.pathname === "/auth/v1/user") return J({ id: me, email: "c@x.y" });
    if (u.pathname === "/rest/v1/progress" && m === "GET" && u.search.includes("user_id=in.")) return J([{ user_id: cl, mtime: 1, data: { prof: { days: 3, units: "metric" }, wlog: { [new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)]: { name: "Push", end: 1, sets: 12, reps: 90, mins: 50 } }, log: {}, sets: {}, hist: {}, checks: {}, steps: {} } }]);
    if (u.pathname === "/rest/v1/progress" && m === "GET") return calls.fail400 ? J({ message: "bad" }, 400) : J([]);
    if (u.pathname === "/rest/v1/coach_links") return J([{ coach_id: me, client_id: cl, coach_name: "Me", client_name: "Jordan", habits: ["10k steps"], created_at: "2026-11-01" }]);
    if (u.pathname === "/rest/v1/checkins" && u.search.includes("client_id=in.")) return J([{ client_id: cl, week: "2026-11-02", data: { energy: 4, wins: "PR", auto: { workouts: 3, planned: 3 } }, reply: "" }]);
    return J(m === "GET" ? [] : null, m === "GET" ? 200 : 204);
  });
  {
    const p2 = await page(browser, { width: 390, height: 900 }), calls = [];
    await mock(p2, calls);
    await p2.evaluate(() => { showTab("profile") });
    await p2.fill("#sbEmail", "c@x.y"); await p2.click("#btnSbForgot");
    await p2.waitForFunction(() => /reset link/.test(document.getElementById("syncMsg").textContent));
    ok(calls.some(c => c.startsWith("POST /auth/v1/recover?redirect_to=")), "Forgot password posts to /recover with a redirect back to the app");
    calls.fail400 = true;
    await p2.evaluate(() => { SY.sess = { at: "t", rt: "r", exp: Date.now() + 3600e3, uid: "11111111-1111-1111-1111-111111111111", email: "c@x.y" }; saveSY() });
    await p2.evaluate(() => syncNow()); await p2.waitForFunction(() => !syncing);
    ok(await p2.evaluate(() => !!SY.sess), "a 400 from the server no longer signs you out");
    calls.fail400 = false;
    await p2.evaluate(() => { lsSet("eliteCoachOn", "1"); renderNavCoach() });
    ok(await p2.isVisible("#tabCoach"), "Clients tab appears when coach mode is on");
    await p2.click("#tabCoach");
    await p2.waitForSelector(".cocard");
    const card = await p2.textContent(".cocard");
    ok(/Jordan/.test(card) && /Check-in to review/.test(card), "client overview lists the client with a check-in flag");
    await p2.click(".cocard");
    ok(await p2.locator(".coday").count() === 7, "client calendar shows 7 days");
    await p2.click(".coday >> nth=3");
    ok(await p2.isVisible("#coSaveDay"), "tapping a day opens the assignment editor");
    await p2.fill("#coAddQ", await p2.evaluate(() => EX[0].n)); await p2.click("#coAddEx");
    await p2.click("#coSaveDay");
    await p2.waitForFunction(() => !CO.loading);
    ok(calls.some(c => c.startsWith("POST /rest/v1/assignments?on_conflict=coach_id,client_id,date")), "assignment is saved to the assignments table, not the client's data");
    ok(!calls.some(c => c.startsWith("POST /rest/v1/progress") && c.includes(cl)), "coach never writes the client's progress row");
    const over = await p2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(!over, "390px client detail: no horizontal scroll");
    ok(p2.errors.length === 0, "no JS errors in coach UI " + p2.errors.join(" | "));
    await p2.close();
  }
  {
    const p3 = await browser.newPage({ viewport: { width: 390, height: 900 } }), calls = [];
    p3.errors = []; p3.on("pageerror", e => p3.errors.push(e.message)); p3.on("dialog", d => d.accept());
    await p3.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
    await mock(p3, calls);
    await p3.goto(url + "#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=recovery");
    await p3.waitForSelector("#pwModal");
    ok(await p3.evaluate(() => location.hash === ""), "reset link: tokens are removed from the address bar");
    await p3.fill("#pwNew", "newpass1"); await p3.fill("#pwNew2", "newpass1"); await p3.click("#pwSave");
    await p3.waitForFunction(() => SY.sess && SY.sess.uid);
    ok(calls.some(c => c === "PUT /auth/v1/user"), "reset link: new password is saved and you are signed in");
    ok(p3.errors.length === 0, "no JS errors in reset flow " + p3.errors.join(" | "));
    await p3.close();
  }

  console.log("v3: warm-up, cool-down, cardio, Health");
  {
    const p4 = await page(browser, { width: 390, height: 900 });
    const r = await p4.evaluate(() => {
      const d = W.days.find(x => x.session); S.sel = d.date; showTab("plan"); setPlanSeg("w"); renderPlan();
      const keys = dayKeys(d);
      return { warm: !!document.querySelector("#wList .callout.c-warm"), cool: !!document.querySelector("#wList .callout.c-cool"), sec: !!document.querySelector("#wList .sech"), chips: document.querySelectorAll("#wList .rx-main").length === d.session.ex.length, keys: keys.includes(d.date + "|wu") && keys.includes(d.date + "|cd") };
    });
    ok(r.warm && r.cool && r.sec, "Today shows warm-up, main work and cool-down sections");
    ok(r.chips, "every exercise shows its sets × reps as a chip");
    ok(r.keys, "warm-up and cool-down count toward the day's progress");
    await p4.check('#wList .c-warm input[type=checkbox]');
    ok(await p4.evaluate(() => !!S.checks[S.sel + "|wu"]), "ticking warm-up done is saved");
    await p4.selectOption("#cdType", "Run"); await p4.fill("#cdMin", "25"); await p4.fill("#cdHr", "150"); await p4.click("#cdAdd");
    const c = await p4.evaluate(() => ({ log: (S.cardio[S.sel] || [])[0], rows: document.querySelectorAll("#cardioBox .cdrow").length, badge: $("cdBadge").textContent }));
    ok(c.log && c.log.type === "Run" && c.log.min === 25 && c.log.hr === 150 && c.rows === 1, "cardio session logs type, minutes and heart rate");
    ok(/^25 \//.test(c.badge), `weekly cardio minutes update (${c.badge})`);
    ok(await p4.evaluate(() => SYNCKEYS.includes("cardio") && MAPK.includes("cardio")), "cardio syncs and merges across devices");
    await p4.fill("#cdSteps", "7345"); await p4.dispatchEvent("#cdSteps", "change");
    ok(await p4.evaluate(() => S.steps[S.sel] === 7345 && /7,345/.test($("cardioBox").textContent)), "manual steps update the step counter");
    const h = await p4.evaluate(() => { S.hd = { [S.sel]: { steps: 9000, sleep: 7.5, hrv: 50, rhr: 56, cardio: [{ type: "Outdoor Walk", min: 30 }] } }; renderPlan(); return { chips: !!document.querySelector("#readyBox .hchips"), synced: /Synced from Health/.test($("cardioBox").textContent), walk: /Outdoor Walk/.test($("cardioBox").textContent) } });
    ok(h.chips && h.synced && h.walk, "Health data shows in readiness, the step counter and cardio");
    const over = await p4.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(!over, "390px Today with cardio: no horizontal scroll");
    ok(p4.errors.length === 0, "no JS errors " + p4.errors.join(" | "));
    await p4.close();
  }
  {
    const { toRows } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "supabase", "functions", "health", "parse.mjs")).href);
    const rows = toRows({ data: { metrics: [{ name: "step_count", units: "count", data: [{ date: "2026-11-05 00:00:00 -0500", qty: 4000 }, { date: "2026-11-05 12:00:00 -0500", qty: 4421 }] }, { name: "weight_body_mass", units: "lb", data: [{ date: "2026-11-05 07:00:00 -0500", qty: 165.4 }] }, { name: "sleep_analysis", units: "hr", data: [{ date: "2026-11-05 00:00:00 -0500", totalSleep: 7.25 }] }, { name: "active_energy", units: "kJ", data: [{ date: "2026-11-05", qty: 2092 }] }], workouts: [{ name: "Outdoor Walk", start: "2026-11-05 18:00:00 -0500", duration: 2520, distance: { qty: 2.1, units: "mi" } }] } });
    const r0 = rows[0] || {};
    ok(rows.length === 1 && r0.steps === 8421 && r0.weight === 165.4 && r0.unit === "lb" && r0.sleep === 7.25 && r0.kcal === 500, "Health Auto Export metrics become one day row (steps summed, kJ to kcal)");
    ok(r0.cardio && r0.cardio[0].min === 42 && Math.abs(r0.cardio[0].km - 3.38) < .01, "Health workouts become cardio entries");
    ok(toRows({ date: "2026-11-05", steps: 10 })[0].steps === 10 && toRows([{ date: "x" }]).length === 1, "Shortcut and list bodies pass straight through");
  }

  const vf = path.join(path.dirname(file), "version.json");
  if (fs.existsSync(vf)) {
    const v = JSON.parse(fs.readFileSync(vf, "utf8")).v, av = await pg.evaluate(() => APP_VER);
    ok(v === av, `version.json (${v}) matches APP_VER (${av})`);
  }
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1) });
