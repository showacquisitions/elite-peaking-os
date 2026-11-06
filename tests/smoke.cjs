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
    if (m !== "GET") { calls.bodies = calls.bodies || {}; calls.bodies[u.pathname] = r.request().postData() }
    if (u.pathname.startsWith("/storage/v1/object/list/")) return J([{ name: "abc_front_2026-10-01.jpg" }, { name: "abd_front_2026-11-01.jpg" }]);
    if (u.pathname.startsWith("/storage/v1/object/authenticated/")) return r.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64") });
    if (u.pathname === "/auth/v1/recover") return J({});
    if (u.pathname === "/auth/v1/user") return J({ id: me, email: "c@x.y" });
    if (u.pathname === "/rest/v1/progress" && m === "GET" && u.search.includes("user_id=in.")) return J([{ user_id: cl, mtime: 1, data: { prof: { days: 3, units: "metric" }, wlog: { [new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)]: { name: "Push", end: 1, sets: 12, reps: 90, mins: 50 } }, log: {}, sets: {}, hist: {}, checks: {}, steps: {} } }]);
    if (u.pathname === "/rest/v1/progress" && m === "GET") return calls.fail400 ? J({ message: "bad" }, 400) : J([]);
    if (u.pathname === "/rest/v1/coach_links") return J([{ coach_id: me, client_id: cl, coach_name: "Me", client_name: "Jordan", habits: ["10k steps"], created_at: "2026-11-01", coach_read_at: "2026-11-01T00:00:00Z", share_photos: !!calls.share }]);
    if (u.pathname === "/rest/v1/messages" && m === "GET") return J([{ id: 1, client_id: cl, coach_id: me, author: cl, body: "hey coach", created_at: "2026-11-05T10:00:00Z" }]);
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

  console.log("v3: callouts across tabs");
  {
    const p5 = await page(browser, { width: 390, height: 900 });
    const r = await p5.evaluate(() => {
      const out = {};
      showTab("profile"); out.profile = !!document.querySelector("#confirmBar .callout");
      showTab("overview"); out.targets = !!document.querySelector("#pane-overview .callout");
      for (let i = 0; i < 10; i++) S.log[addD(TODAY, -i * 2)] = { w: 80 + i * 0.15 };
      showTab("progress"); renderProgress(); out.trend = !!document.querySelector("#trend .callout") && !!document.getElementById("btnApply");
      CP().mode = "custom"; PLN().days = {}; renderTrain(); out.train = !!document.querySelector("#pane-train .callout.c-warn");
      return out;
    });
    ok(r.profile && r.targets && r.trend && r.train, "Profile, Targets, Progress trend and Train use callouts " + JSON.stringify(r));
    ok(p5.errors.length === 0, "no JS errors " + p5.errors.join(" | "));
    await p5.close();
  }

  console.log("v3.1: coach macros, notifications");
  {
    const p6 = await page(browser, { width: 390, height: 900 });
    const r = await p6.evaluate(() => {
      const before = Math.round(W.T.kcal);
      S.cx = { links: [], asg: {}, msgs: [], ci: {}, targets: { P: 180, C: 250, F: 70, note: "cut phase", by: "Sam" } }; regen(); renderAll(true);
      const T = W.T, d = W.days.find(x => x.session), dr = W.days.find(x => !x.session);
      showTab("overview"); const tgt = !!document.querySelector("#pane-overview .callout.c-coach");
      for (let i = 0; i < 10; i++) S.log[addD(TODAY, -i * 2)] = { w: 80 + i * .15 };
      showTab("progress"); renderProgress(); const tr = document.querySelector("#trend .callout.c-coach") && !document.getElementById("btnApply");
      const avg = W.days.reduce((a, x) => a + x.macros.kcal, 0) / 7;
      S.cx = {}; regen();
      return { before, kcal: Math.round(T.kcal), P: T.P, coach: T.coach && T.coach.name, tgt, tr: !!tr, trainC: d.macros.C, restC: dr && dr.macros.C, avg: Math.round(avg), after: Math.round(W.T.kcal) };
    });
    ok(r.kcal === 2350 && r.P === 180 && r.coach === "Sam", `coach targets replace the client's calories and macros (${r.kcal} kcal)`);
    ok(Math.abs(r.avg - 2350) <= 25 && r.trainC > r.restC, `daily meals average the coach's calories with carb cycling (${r.avg} kcal/day)`);
    ok(r.tgt && r.tr, "Targets and Progress say the coach sets the numbers; auto-adjust buttons are hidden ");
    ok(r.after === r.before, "clearing coach targets restores the profile numbers");
    const rows = await p6.evaluate(() => { S.prof.wtime = "06:15"; const x = reminderRows(); return { n: x.length, sess: upcomingSessions().length, first: x[0], future: x.every(r => new Date(r.at) > new Date()) } });
    ok(rows.n >= 1 && rows.n <= rows.sess && rows.future && /at 06:15/.test(rows.first.title) && new Date(rows.first.at).getHours() === 6, `workout reminders are built for upcoming training days at the workout time (${rows.n})`);
    await p6.evaluate(() => showTab("profile"));
    ok(await p6.isVisible("#pushProf .callout"), "Notifications card explains what's needed on this device");
    const stale = await p6.evaluate(() => { SY.sess = { at: "t", rt: "r", exp: Date.now() + 36e5, uid: "u", email: "e@x.y" }; renderSync(); const r = !/Sign in above/.test($("coachProf").textContent); SY = {}; renderSync(); return r });
    ok(stale, "signing in refreshes the Coaching and Notifications cards");
    ok(await p6.evaluate(() => typeof VAPID_PUB === "string" && keyBytes(VAPID_PUB).length === 65 && keyBytes(VAPID_PUB)[0] === 4), "VAPID public key is a valid P-256 point");
    ok(p6.errors.length === 0, "no JS errors " + p6.errors.join(" | "));
    await p6.close();
  }
  {
    const p7 = await page(browser, { width: 390, height: 900 }), calls = [];
    await mock(p7, calls);
    await p7.evaluate(() => { SY.sess = { at: "t", rt: "r", exp: Date.now() + 36e5, uid: "11111111-1111-1111-1111-111111111111", email: "c@x.y" }; lsSet("eliteCoachOn", "1"); renderNavCoach(); showTab("coach") });
    await p7.waitForSelector(".cocard"); await p7.click(".cocard");
    ok(await p7.isVisible("#ctSave"), "coach sees the nutrition targets card for a client");
    await p7.fill("#ctP", "190"); await p7.fill("#ctC", "220"); await p7.fill("#ctF", "65");
    ok(/2,?225|2225/.test(await p7.textContent("#ctK")), "kcal total updates as the coach types");
    await p7.click("#ctSave"); await p7.waitForTimeout(150);
    ok(calls.some(c => c.startsWith("POST /rest/v1/rpc/coach_set_targets")), "targets are saved through coach_set_targets");
    ok(p7.errors.length === 0, "no JS errors in coach targets " + p7.errors.join(" | "));
    await p7.close();
  }
  {
    const swsrc = fs.readFileSync(path.join(path.dirname(file), "sw.js"), "utf8");
    ok(/addEventListener\("push"/.test(swsrc) && /showNotification/.test(swsrc) && /notificationclick/.test(swsrc), "service worker shows pushes and opens the app on tap");
    const { encrypt, deriveKeys, unb64u, b64u } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "supabase", "functions", "push", "webpush.mjs")).href);
    const s = crypto.subtle, ua = await s.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const uaPub = new Uint8Array(await s.exportKey("raw", ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encrypt({ keys: { p256dh: b64u(uaPub), auth: b64u(auth) } }, '{"title":"t"}');
    const salt = body.slice(0, 16), asPub = body.slice(21, 86), ct = body.slice(86);
    const sh = new Uint8Array(await s.deriveBits({ name: "ECDH", public: await s.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []) }, ua.privateKey, 256));
    const k = await deriveKeys(sh, auth, uaPub, asPub, salt);
    const pt = new Uint8Array(await s.decrypt({ name: "AES-GCM", iv: k.nonce }, await s.importKey("raw", k.cek, "AES-GCM", false, ["decrypt"]), ct));
    ok(new TextDecoder().decode(pt.slice(0, -1)) === '{"title":"t"}' && pt[pt.length - 1] === 2, "push payload encrypts and decrypts (RFC 8291)");
    const A = { ua_public: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", as_public: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8", ecdh: "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs", auth: "BTBZMqHH6r4Tts7J_aSIgg", salt: "DGv6ra1nlYgDCS1FRnbzlw" };
    const kk = await deriveKeys(unb64u(A.ecdh), unb64u(A.auth), unb64u(A.ua_public), unb64u(A.as_public), unb64u(A.salt));
    ok(b64u(kk.cek) === "oIhVW04MRdy2XN9CiKLxTg" && b64u(kk.nonce) === "4h_95klXJ5E_qnoN", "push key schedule matches the RFC 8291 test vector");
  }

  console.log("v3.2: auto supersets, demos, progression, unread, photos, copyright");
  {
    const p8 = await page(browser, { width: 390, height: 900 });
    const r = await p8.evaluate(() => {
      S.prof.autoSS = "acc"; regen(); const ss = W.sessions.map(s => s.ex.map(x => x.ss ? 1 : 0).join("")); const anySS = W.sessions.some(s => s.ex.some(x => x.ss)), mainClean = W.sessions.every(s => !s.ex[0].ss && !s.ex[1].ss);
      S.prof.autoSS = "off"; regen(); const off = W.sessions.every(s => s.ex.every(x => !x.ss));
      return { anySS, mainClean, off, ss };
    });
    ok(r.anySS && r.mainClean && r.off, `auto plan pairs accessories into supersets only when turned on (${r.ss.join(" ")})`);
    const demo = await p8.evaluate(() => {
      const c = CP(); c.mode = "custom"; const dow = (new Date().getDay() + 6) % 7; const ex = [Object.assign(libToEx(EX[0]), { demo: "https://youtu.be/abc123" }), libToEx(EX[7])];
      PLN().days = { [dow]: { name: "Demo day", mt: NOW(), ex } }; touch(); save(); regen(); S.sel = TODAY; showTab("plan"); renderPlan();
      const a = document.querySelector("#wList a.vid-c"); const res = a && a.getAttribute("href"); c.mode = "auto"; save(); regen(); renderAll(true); return res;
    });
    ok(demo === "https://youtu.be/abc123", "a demo video link on an exercise replaces the generic form search");
    const ur = await p8.evaluate(() => {
      SY.sess = { at: "t", rt: "r", exp: Date.now() + 36e5, uid: "me", email: "e@x.y" };
      S.cx = { links: [{ coach_id: "co", client_id: "me", coach_name: "Sam", client_read_at: "2026-11-01T00:00:00Z" }], asg: {}, ci: {}, msgs: [{ coach_id: "co", client_id: "me", author: "co", body: "Nice work", created_at: "2026-11-05T09:00:00Z" }] };
      TAB = "train"; renderPlan(); const b = document.querySelector('.tab[data-tab="plan"] .tbadge');
      const out = { n: clientUnread(), badge: b && b.textContent }; SY = {}; S.cx = {}; renderPlan(); return out;
    });
    ok(ur.n === 1 && ur.badge === "1", "client sees an unread badge for a new coach message");
    ok(/© 2026 Show Acquisitions/.test(await p8.textContent(".appfoot")) && fs.existsSync(path.join(path.dirname(file), "LICENSE")), "copyright notice in the app footer and a LICENSE file");
    ok(p8.errors.length === 0, "no JS errors " + p8.errors.join(" | "));
    await p8.close();
  }
  {
    const p9 = await page(browser, { width: 390, height: 900 }), calls = [];
    await mock(p9, calls);
    await p9.evaluate(() => { SY.sess = { at: "t", rt: "r", exp: Date.now() + 36e5, uid: "11111111-1111-1111-1111-111111111111", email: "c@x.y" }; lsSet("eliteCoachOn", "1"); CP().mode = "custom"; seedFromAuto(); save(); renderNavCoach(); showTab("coach") });
    await p9.waitForSelector(".cocard");
    ok(/1 new message/.test(await p9.textContent(".cocard")) && (await p9.textContent('.tab[data-tab="coach"] .tbadge')) === "1", "coach sees unread messages on the client card and the Clients tab");
    await p9.click(".cocard"); await p9.waitForTimeout(100);
    ok(calls.some(c => c.startsWith("POST /rest/v1/rpc/msg_read")), "opening a client marks their messages read");
    ok(/Not shared/.test(await p9.textContent("#coPhotos")), "client photos stay hidden until the client shares them");
    await p9.selectOption("#coProgP", "wave"); await p9.selectOption("#coWeeks", "4"); await p9.click("#coAssignProg"); await p9.waitForTimeout(200);
    const rows = JSON.parse(calls.bodies["/rest/v1/assignments"] || "[]").filter(x => x.session.ex.length);
    const byWeek = w => rows.filter(x => /^Week (\d+)/.exec(x.note) && +/^Week (\d+)/.exec(x.note)[1] === w)[0];
    const s1 = byWeek(1) && byWeek(1).session.ex[0].sets, s3 = byWeek(3) && byWeek(3).session.ex[0].sets, s4 = byWeek(4) && byWeek(4).session.ex[0].sets;
    ok(rows.length > 0 && s3 === s1 + 2 && s4 < s1 && /deload/.test(byWeek(4).note), `4-week wave builds sets, then deloads (week 1: ${s1}, week 3: ${s3}, week 4: ${s4})`);
    calls.share = true; await p9.evaluate(() => loadClients()); await p9.waitForFunction(() => !CO.loading);
    await p9.waitForSelector("#coPhotos img[src^='blob:']", { timeout: 5000 }).catch(() => {});
    ok(await p9.locator("#coPhotos img").count() === 2, "coach sees first and latest shared photos once the client opts in");
    ok(p9.errors.length === 0, "no JS errors in coach v3.2 " + p9.errors.join(" | "));
    await p9.close();
  }

  console.log("v3.4: charts, scanner, food score, Health parsing");
  {
    // ---- barcode decoder (EAN-13, UPC-A as EAN-13, EAN-8), noisy and blurred frames, plus the rule that noise never reads as a code
    const Lc = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"], Gc = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"], Rc = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"], PAR = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
    const chk = s => { let t = 0; for (let i = 0; i < s.length; i++) t += (+s[i]) * ((s.length - i) % 2 ? 3 : 1); return (10 - t % 10) % 10 };
    const ean13 = c12 => { const c = c12 + chk(c12), p = PAR[+c[0]]; let b = "101"; for (let i = 0; i < 6; i++) b += (p[i] === "L" ? Lc : Gc)[+c[1 + i]]; b += "01010"; for (let i = 7; i < 13; i++) b += Rc[+c[i]]; return { bits: b + "101", code: c } };
    const ean8 = c7 => { const c = c7 + chk(c7); let b = "101"; for (let i = 0; i < 4; i++) b += Lc[+c[i]]; b += "01010"; for (let i = 4; i < 8; i++) b += Rc[+c[i]]; return { bits: b + "101", code: c } };
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, gs = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(.5) };
    const frame = (b, mod, noise) => { const W = 480, H = 240, d = new Array(W * H).fill(215), n = Math.round((b.bits.length + 24) * mod), x0 = ((W - n) / 2) | 0; for (let y = 60; y < 180; y++) for (let x = 0; x < n; x++) { const m = Math.floor(x / mod) - 12; const bar = m >= 0 && m < b.bits.length && b.bits[m] === "1"; d[y * W + x0 + x] = Math.max(0, Math.min(255, (bar ? 30 : 215) + gs() * noise)) } return { data: d, w: W, h: H, gray: true } };
    const cases = [ean13("590123412345"), ean13("301762042200"), ean13("001234567890"), ean8("9638507")];
    const got = await pg.evaluate(fs_ => fs_.map(f => bcScanImage({ data: Uint8ClampedArray.from(f.data), w: f.w, h: f.h, gray: true })), cases.map((c, i) => frame(c, [2.4, 3, 3.6, 2.8][i], 14)));
    ok(got.every((g, i) => g === cases[i].code), `decoder reads EAN-13, UPC-A and EAN-8 from noisy frames (${got.join(", ")})`);
    const noise = await pg.evaluate(() => { let s = 5, c = 0; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; for (let k = 0; k < 40; k++) { const d = new Uint8ClampedArray(320 * 120); for (let i = 0; i < d.length; i++) d[i] = r() * 255; if (bcScanImage({ data: d, w: 320, h: 120, gray: true })) c++ } return c });
    ok(noise <= 1, `random noise is not read as a barcode (${noise}/40 frames; the scanner also needs the same code twice)`);
    ok(await pg.evaluate(() => bcScanImage({ data: new Uint8ClampedArray(200 * 100).fill(128), w: 200, h: 100, gray: true }) === null), "blank frame reads nothing");

    // ---- food score
    const sc = await pg.evaluate(() => {
      const mk = o => offNorm(Object.assign({ code: "1", product_name: "X", nutriments: { "energy-kcal_100g": 100 } }, o));
      const oats = mk({ nutriments: { "energy-kcal_100g": 370, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7, fiber_100g: 10, sugars_100g: 1, "saturated-fat_100g": 1.2, salt_100g: .01 }, nova_group: 1, labels_tags: ["en:organic"] });
      const spread = mk({ nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: 3.4, sugars_100g: 56.3, "saturated-fat_100g": 10.6, salt_100g: .107 }, nova_group: 4 });
      const clean = mk({ nutriments: { "energy-kcal_100g": 60, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 1, sugars_100g: 3, salt_100g: .1 }, nova_group: 1, additives_tags: ["en:e171"], nutriscore_grade: "a", nutriscore_score: -6 });
      const dye = mk({ nutriments: { "energy-kcal_100g": 150, sugars_100g: 8 }, additives_tags: ["en:e150c", "en:e330", "en:e110"], nova_group: 4 });
      S.prof.avoid = ["milk", "gluten"]; S.prof.diet = "vegan";
      const fl = foodFlags(mk({ allergens_tags: ["en:milk"], traces_tags: ["en:gluten"], ingredients_analysis_tags: ["en:non-vegan"] }));
      S.prof.avoid = []; S.prof.diet = "omni";
      return { oats: foodScore(oats), spread: foodScore(spread), clean: foodScore(clean), dye: foodScore(dye), dyeAdd: dye.add.map(a => a.code + ":" + a.r), fl: fl.map(f => f[0] + ":" + f[1]), n: nsEst({ kcal: 100, p: 0, fiber: 0, sugar: 0, sat: 0, salt: 0 }, 0).grade };
    });
    ok(sc.oats.ns.est && sc.oats.ns.grade === "a" && sc.oats.tot >= 85 && sc.oats.label === "Excellent", `plain organic oats: Nutri-Score A (estimated), score ${sc.oats.tot} Excellent`);
    ok(sc.spread.ns.grade === "e" && sc.spread.tot <= 25, `sugary spread: Nutri-Score E, score ${sc.spread.tot}`);
    ok(sc.clean.hi === 1 && sc.clean.tot <= 49, `one high-risk additive (E171) caps the score at 49 (got ${sc.clean.tot})`);
    ok(sc.dyeAdd.join() === "E110:2,E150C:1,E330:0", `additives are tiered by risk (${sc.dyeAdd.join(" ")})`);
    ok(sc.fl.join("|") === "red:Contains milk|warn:May contain traces of gluten|red:Not vegan", `allergen and diet flags (${sc.fl.join(" | ")})`);

    // ---- scanner end to end: fake camera shows a barcode, no BarcodeDetector, mocked Open Food Facts
    const sp = await page(browser, { width: 390, height: 900 });
    await sp.addInitScript(() => { delete window.BarcodeDetector });
    const hits = [];
    const prod = { code: "5901234123457", product_name: "Rolled oats", brands: "Oat Co", serving_quantity: 40, nutriscore_grade: "a", nutriscore_score: -5, nova_group: 1, nutriments: { "energy-kcal_100g": 370, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7, fiber_100g: 10, sugars_100g: 1, "saturated-fat_100g": 1.2, salt_100g: .01 }, additives_tags: [], labels_tags: ["en:organic"], allergens_tags: ["en:gluten"], categories_tags: ["en:cereals", "en:oat-flakes"] };
    const bad = { code: "3017620422003", product_name: "Hazelnut spread", brands: "Nutella", serving_quantity: 15, nutriscore_grade: "e", nutriscore_score: 26, nova_group: 4, nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sugars_100g: 56.3, "saturated-fat_100g": 10.6, salt_100g: .107 }, additives_tags: ["en:e322"], allergens_tags: ["en:milk"], categories_tags: ["en:spreads", "en:hazelnut-spreads"] };
    await sp.route(/openfoodfacts/, r => { const u = r.request().url(); hits.push(u); const m = /product\/(\d+)\.json/.exec(u); if (m) return r.fulfill({ json: m[1] === "5901234123457" ? { status: 1, product: prod } : m[1] === "3017620422003" ? { status: 1, product: bad } : { status: 0 } }); if (/tag_1=a/.test(u)) return r.fulfill({ json: { products: [prod] } }); return r.fulfill({ json: { products: [bad, prod] } }) });
    await sp.evaluate(bits => {
      const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360; const c = cv.getContext("2d"), mod = 4.2, x0 = (640 - (bits.length + 24) * mod) / 2;
      const draw = () => { c.fillStyle = "#d8d8d8"; c.fillRect(0, 0, 640, 360); c.fillStyle = "#1c1c1c"; for (let i = 0; i < bits.length; i++) if (bits[i] === "1") c.fillRect(x0 + (i + 12) * mod, 90, mod + .3, 180) };
      draw(); setInterval(draw, 60);
      navigator.mediaDevices.getUserMedia = async () => cv.captureStream(15);
    }, cases[0].bits.replace(/^/, "").length ? ean13("590123412345").bits : "");
    await sp.evaluate(() => { showTab("plan"); $("pane-plan").dataset.seg = "m" });
    ok(await sp.locator("#fsScan").count() === 1, "Scan button is shown even where the browser has no BarcodeDetector (iPhone Safari)");
    await sp.evaluate(() => { fsScan() });
    ok(await sp.locator(".scanov video").count() === 1, "scanner overlay opens");
    await sp.waitForFunction(() => !document.querySelector(".scanov"), null, { timeout: 15000 }).catch(() => {});
    await sp.waitForSelector("#foodBox .pc", { timeout: 5000 }).catch(() => {});
    ok(await sp.locator(".scanov").count() === 0, "overlay closes itself after a confirmed read");
    ok(hits.some(u => /product\/5901234123457\.json/.test(u)), "scanned code is looked up in Open Food Facts");
    const card = await sp.locator("#foodBox .pc").first().innerText().catch(() => "");
    ok(/Rolled oats/.test(card) && /Excellent/i.test(card) && /Nutri-Score A/.test(card) && /Organic/.test(card), "product card shows name, score band, Nutri-Score and organic");
    await sp.click("[data-fsadd='0']");
    const lg = await sp.evaluate(() => { const l = S.flog[S.sel] || []; return { n: l.length, sc: l[0] && l[0].sc, g: l[0] && l[0].g, kcal: l[0] && l[0].kcal, hist: lsJ(FHK).length } });
    ok(lg.n === 1 && lg.g === 40 && lg.kcal === 148 && lg.sc >= 75 && lg.hist === 1, `adding logs 40 g (148 kcal) with its score and keeps the scan in history (${JSON.stringify(lg)})`);
    await sp.evaluate(() => fsBarcode("3017620422003")); await sp.waitForSelector("#foodBox .pc");
    await sp.click("[data-fsfav='0']");
    await sp.click("[data-fsalt='0']"); await sp.waitForSelector(".pc-alt .arow", { timeout: 5000 }).catch(() => {});
    ok(await sp.locator(".pc-alt .arow").count() >= 1 && /Rolled oats/.test(await sp.textContent(".pc-alt")), "“Find better options” suggests a higher-scoring product from the same category");
    ok(await sp.evaluate(() => fsIsFav("3017620422003")) && await sp.evaluate(() => lsJ(FHK).length) === 2, "save to favourites works, history has both scans");
    await sp.evaluate(() => { S.prof.avoid = ["milk"]; renderFood() });
    ok(/Contains milk/.test(await sp.textContent("#foodBox .pc")), "allergen warning appears on a scanned product");
    await sp.evaluate(() => { fsBarcode("0000000000000") }); await sp.waitForTimeout(300);
    ok(/Not in the database/.test(await sp.textContent("#foodBox")), "unknown barcode gives a clear message");
    const ph = await sp.evaluate(async bits => {
      const cv = document.createElement("canvas"); cv.width = 900; cv.height = 600; const c = cv.getContext("2d"), mod = 5; c.fillStyle = "#e6e2da"; c.fillRect(0, 0, 900, 600); c.fillStyle = "#222";
      const x0 = (900 - (bits.length + 24) * mod) / 2; for (let i = 0; i < bits.length; i++) if (bits[i] === "1") c.fillRect(x0 + (i + 12) * mod, 200, mod, 200);
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .85)); await fsPhoto(new File([blob], "b.jpg", { type: "image/jpeg" })); return FS.res[0] && FS.res[0].code;
    }, ean13("590123412345").bits);
    ok(ph === "5901234123457", "“Photo of barcode” decodes a still image (fallback when live scanning is not possible)");
    ok(sp.errors.length === 0, "no JS errors in scanner flow " + sp.errors.join(" | "));
    await sp.close();

    // ---- interactive charts
    const cp = await page(browser, { width: 360, height: 900 });
    await cp.evaluate(() => {
      S.prof.units = "imperial";
      for (let i = 60; i >= 0; i--) { const d = addD(TODAY, -i); if (i % 2 === 0) S.log[d] = { w: 84 - i * .03 + Math.sin(i) * .4 }; S.steps[d] = 5000 + ((i * 937) % 7000); S.hd[d] = { steps: S.steps[d], sleep: 6 + (i % 5) * .5, hrv: 45 + ((i * 7) % 15), rhr: 55 + (i % 6), w: 0, kcal: 0, cardio: [] } }
      showTab("progress"); renderProgress();
    });
    const ids = await cp.evaluate(() => [...document.querySelectorAll(".ichart")].map(e => e.dataset.ic));
    ok(["weight", "steps", "sleep", "recovery"].every(x => ids.includes(x)), `weight, steps, sleep and recovery charts render (${ids.join(", ")})`);
    const w = cp.locator('.ichart[data-ic="weight"]'); await w.scrollIntoViewIfNeeded();
    const bx = await w.locator("svg").boundingBox();
    const r0 = await w.locator(".icro").innerText();
    await cp.mouse.move(bx.x + bx.width * .3, bx.y + bx.height / 2); const r1_ = await w.locator(".icro").innerText();
    await cp.mouse.move(bx.x + bx.width * .8, bx.y + bx.height / 2); const r2_ = await w.locator(".icro").innerText();
    ok(r1_ !== r2_ && r0 !== r1_ && /lb/.test(r1_), "hover or drag moves the crosshair and updates the readout");
    const xBefore = await w.locator(".icx").getAttribute("x1");
    await w.locator("svg").focus(); await cp.keyboard.press("ArrowLeft");
    ok(await w.locator(".icx").getAttribute("x1") !== xBefore, "arrow keys step through the points");
    const dots0 = await w.locator("svg circle").count();
    await w.locator("[data-icr='90']").click();
    ok(await w.locator("[data-icr='90']").getAttribute("aria-pressed") === "true" && await w.locator("svg text").count() > 0, "range chips switch the window");
    await w.locator("[data-icl='t']").click();
    ok(await w.locator("[data-icl='t']").getAttribute("aria-pressed") === "false" && !/Trend/.test(await w.locator(".icro").innerText()), "legend chips hide a series");
    const st0 = await cp.evaluate(() => { IC.steps.rng = 7; icRefresh("steps"); return document.querySelectorAll('.ichart[data-ic="steps"] svg rect').length });
    ok(st0 === 7, `steps chart draws one bar per day for 7D (${st0})`);
    await cp.locator('.ichart[data-ic="recovery"] [data-icm="rhr"]').click();
    ok(/bpm/.test(await cp.locator('.ichart[data-ic="recovery"] .icro').innerText()), "recovery chart switches between HRV and resting heart rate");
    ok(await cp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "charts cause no horizontal scroll at 360 px");
    // strength: modes, PR stars, per-set detail
    await cp.evaluate(() => { const u = "t:lift"; ["2026-09-01", "2026-09-08", "2026-09-15"].forEach((d, i) => { S.hist[u + "|" + d] = { u, n: "Lift", d, w: 60 + i * 5, r: 5 }; S.sets[u + "|" + d] = [{ w: 60 + i * 5, r: 5, rir: 2 }, { w: 55, r: 8 }] }); CH.uid = u; IC.strength = undefined; renderProgress() });
    const sr = await cp.locator('.ichart[data-ic="strength"]');
    ok(await sr.locator(".icpr").count() === 2 && /@2 RIR/.test(await sr.locator(".icro").innerText()), "strength chart marks personal bests and lists the sets of the selected day");
    await sr.locator("[data-icm='vol']").click();
    ok(await sr.locator("svg rect").count() === 3, "strength volume mode draws bars");
    await cp.evaluate(() => { S.log = {}; S.steps = {}; S.hd = {}; renderProgress() });
    ok(/Log your weight on 2 or more days/.test(await cp.locator('.ichart[data-ic="weight"]').innerText()), "empty state explains what to log");
    ok(cp.errors.length === 0, "no JS errors in charts " + cp.errors.join(" | "));
    await cp.close();

    // ---- Health: Shortcut text values, test ping, honest status
    const { toRows: tr } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "supabase", "functions", "health", "parse.mjs")).href);
    const sh = tr({ Date: "11/6/2026", Steps: "8,421", Weight: "165,4", Sleep: "7 hr 12 min", HRV: "48.2", "Resting Heart Rate": "54" })[0];
    ok(sh.date === "2026-11-06" && sh.steps === "8421" && sh.weight === "165.4" && Math.abs(sh.sleep - 7.2) < 1e-9 && sh.rhr === "54", "Shortcut text values are cleaned (comma thousands and decimals, “7 hr 12 min”, US dates, key names)");
    ok(tr({ date: "2026-11-06 21:00:00 -0500", sleep: "7:30:00" })[0].date === "2026-11-06" && tr({ sleep: "7:30:00" })[0].sleep === 7.5, "ISO timestamps and h:mm:ss durations are understood");
    const hp = await page(browser, { width: 390, height: 900 }); let sent = null;
    await hp.route(/functions\/v1\/health/, r => { sent = r.request().postData(); return r.fulfill({ json: { ok: true, days: 1 } }) });
    await hp.evaluate(() => { lsSet("eliteHealthToken", "abc"); const d = document.createElement("div"); d.id = "htMsg"; document.body.appendChild(d); S.steps[TODAY] = 9999; return healthTest() });
    await hp.waitForTimeout(200);
    ok(JSON.parse(sent || "{}").steps === undefined && JSON.parse(sent || "{}").date, "“Send a test” sends no step count, so it can never overwrite real data");
    const stat = await hp.evaluate(() => { SY.sess = { at: "t", rt: "r", exp: Date.now() + 36e5, uid: "me", email: "e@x.y" }; S.hd = {}; S.hd[TODAY] = { steps: 0, sleep: 0, w: 0, rhr: 0, hrv: 0, kcal: 0, cardio: [] }; showTab("progress"); renderProgress(); const a = $("healthBox").textContent; S.hd[TODAY].steps = 1234; renderProgress(); return [/Waiting for the first sync/.test(a), /Health sync is working/.test($("healthBox").textContent)] });
    ok(stat[0] && stat[1], "an empty test row does not count as a working sync; real numbers do");
    await hp.close();
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
