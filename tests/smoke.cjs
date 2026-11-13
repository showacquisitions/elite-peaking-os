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
  const TABS = ["plan", "train", "food:grocery", "food:kitchen", "food:overview", "quality", "progress", "overview", "profile", "coach"];

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
    ok(rows.length === 1 && r0.steps === 8421 && r0.weight === 75.02 && r0.unit === "kg" && r0.sleep === 7.25 && r0.kcal === 500, "Health Auto Export metrics become one day row (steps summed, kJ to kcal, weight to kg)");
    ok(r0.cardio && r0.cardio[0].min === 42 && Math.abs(r0.cardio[0].km - 3.38) < .01, "Health workouts become cardio entries");
    ok(toRows({ date: "2026-11-05", steps: 10 })[0].steps === 10 && toRows([{ date: "x" }]).length === 0, "Shortcut bodies are read; a row with no usable value is dropped");
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

  console.log("v4: Health payload normalizer");
  {
    const mod = await import(require("url").pathToFileURL(path.join(__dirname, "..", "supabase", "functions", "health", "parse.mjs")).href);
    const N = x => mod.hxNormalize(x, { today: "2026-11-13", unit: "lb" }), one = x => N(x).rows[0] || {};
    let r = one({ date: "", steps: "", weight: null, sleep: "NaN", hrv: "", rhr: "72 bpm", kcal: "0" });
    ok(r.date === "2026-11-13" && r.rhr === 72 && Object.keys(r).length === 2, "blank, null, NaN and 0 fields are skipped; the valid field is kept; a missing date means today");
    r = one({ steps: "4000\n4421", rhr: "58\n62", weight: "165.4 lb\n166 lb", sleep: "27000", hrv: "45,5 ms" });
    ok(r.steps === 8421 && r.rhr === 60 && r.weight === 75.3 && r.sleep === 7.5 && r.hrv === 45.5, "one-sample-per-line lists: steps summed, heart rate averaged, latest weight, seconds to hours, decimal comma");
    r = one({ steps: "8,421 steps", kcal: "1 850 kJ", sleep: "7 hr 30 min", weight: "75 kg", bf: "0.152" });
    ok(r.steps === 8421 && r.kcal === 442 && r.sleep === 7.5 && r.weight === 75 && r.bf === 15.2, "unit suffixes and thousands separators are understood");
    const br = N('{"date":"2026-11-12","steps":,"weight":"165,4","sleep":NaN,}');
    ok(br.rows.length === 1 && br.rows[0].weight === 75.02 && br.rows[0].steps === undefined && br.issues.length === 1, "JSON with empty values from Shortcuts is repaired, not rejected");
    r = one("sync&steps=8%2C421&weight=&sleep=7:30&hrv=&date=Nov 12, 2026 at 9:00 PM");
    ok(r.date === "2026-11-12" && r.steps === 8421 && r.sleep === 7.5 && r.weight === undefined, "URL query bodies and Shortcuts date text are read");
    ok(N("h=2026-11-03,165.4,8421;2026-11-02,165.0,9100&u=lb").rows.length === 2 && N("2026-11-03, 165.4, 8421").rows[0].steps === 8421, "legacy #h= links and CSV lines still import");
    ok(one([{ date: "2026-11-13", steps: 5000 }, { date: "2026-11-13", steps: 8000, hrv: 50 }]).steps === 8000 && one({ steps_watch: "7000", steps_phone: "6500" }).steps === 7000, "iPhone + Watch duplicates are not added together");
    const bad = N({ date: "2027-06-01", steps: 5 }), junk = N({ steps: "abc", rhr: 900, weight: "12 kg" });
    ok(bad.rows.length === 0 && bad.issues.length === 1 && junk.rows.length === 0 && junk.issues.length === 3, "future dates and out-of-range values are reported, never stored");
    ok(N(null).rows.length === 0 && N("hello").rows.length === 0 && N(undefined).issues.length === 0 && N([null, 5, "x"]).rows.length === 0, "garbage input never throws");
    const m = mod.hxMerge({ date: "d", steps: 9000, hrv: 50 }, { date: "d", steps: 9500 }, false);
    ok(m.steps === 9500 && m.hrv === 50, "a later sync updates what it carries and keeps the rest");
    const html = fs.readFileSync(file, "utf8"), src = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "health", "parse.mjs"), "utf8"), blk = t => t.slice(t.indexOf("/*HX-BEGIN*/"), t.indexOf("/*HX-END*/"));
    ok(blk(html).length > 1000 && blk(html) === blk(src), "the app and the server run the identical normalizer (run tools/inline-hx.cjs after editing parse.mjs)");
  }

  console.log("v4: URL auto-ingest, partial upsert, sync status");
  {
    const p = await browser.newPage({ viewport: { width: 390, height: 900 } });
    p.errors = []; p.on("pageerror", e => p.errors.push(e.message)); p.on("dialog", d => d.accept());
    await p.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
    await p.goto(url + "#sync&steps=8421&weight=&sleep=7:30&hrv=NaN&rhr=58%20bpm&kcal=");
    await p.waitForFunction(() => typeof W !== "undefined" && W && W.days && document.querySelector(".toast.on"));
    let r = await p.evaluate(() => ({ h: S.hd[TODAY], hash: location.hash, steps: S.steps[TODAY], sleep: (S.log[TODAY] || {}).s, toast: $("toast").textContent, pill: $("hxPill").textContent, log: hxLog()[0] }));
    ok(r.h.steps === 8421 && r.h.sleep === 7.5 && r.h.rhr === 58 && r.h.hrv === undefined && r.h.w === undefined, "link sync stores the values that are present and nothing for the empty ones");
    ok(r.hash === "" && /Health synced/.test(r.toast), "the address bar is cleaned and a confirmation toast shows");
    ok(r.steps === 8421 && r.sleep === "7.5" && /3\/7/.test(r.pill) && r.log.src === "link" && r.log.days === 1, "synced values reach the step counter, the daily log, the status pill and the sync log");
    r = await p.evaluate(async () => {
      S.log[TODAY].w = 80; save();
      location.hash = "#sync&steps=0&weight=165.4&u=lb&hrv=52"; await new Promise(r => setTimeout(r, 80));
      const a = { steps: S.hd[TODAY].steps, sleep: S.hd[TODAY].sleep, hrv: S.hd[TODAY].hrv, hw: S.hd[TODAY].w, lw: S.log[TODAY].w, hash: location.hash };
      location.hash = "#h=" + addD(TODAY, -2) + ",165.0,9100&u=lb"; await new Promise(r => setTimeout(r, 80));
      a.legacy = S.steps[addD(TODAY, -2)]; a.lw2 = (S.log[addD(TODAY, -2)] || {}).w;
      return a;
    });
    ok(r.steps === 8421 && r.sleep === 7.5 && r.hrv === 52 && r.hw === 75.02 && r.hash === "", "a second partial sync adds new fields and never zeroes earlier ones (hash change, app already open)");
    ok(r.lw === 80, "a weight typed by hand is not overwritten by Health");
    ok(r.legacy === 9100 && Math.abs(r.lw2 - 74.84) < .01, "old-style #h= links still work");
    r = await p.evaluate(() => {
      showTab("progress"); $("hxIn").value = HX_SAMPLE; hxCheck(false);
      const dry = { tbl: !!document.querySelector("#hxOut table.tele"), hd: JSON.stringify(S.hd[TODAY]) };
      S.hd = {}; hxUpsert([{ date: TODAY, hrv: 50, steps: 9000 }]); hxUpsert([{ date: TODAY, steps: 9500, hrv: null, rhr: NaN, sleep: 0 }]);
      return { dry, merged: S.hd[TODAY], guide: /Sunrise or Sunset/.test($("hxBox").textContent) && /Text/.test($("hxBox").textContent), over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    ok(r.dry.tbl && r.merged.hrv === 50 && r.merged.steps === 9500 && r.merged.rhr === undefined && r.merged.sleep === undefined, "payload tester reads without saving; upsert ignores null, NaN and 0");
    ok(r.guide && !r.over, "Shortcut setup and repair guide is shown and fits a phone");
    r = await p.evaluate(() => {
      S.hd = {}; for (let i = 0; i < 14; i++) if (i % 2 === 0) S.hd[addD(TODAY, -i)] = { steps: 8000, w: 75, kcal: 400 };
      renderHX(); const s = hxState(), txt = $("hxBox").textContent;
      return { synced: s.synced, never: s.never.join(), skip: /skipped 7 of the last 14 days/.test(txt), nev: /Never received: Resting HR, HRV, Sleep, Body fat/.test(txt), ios27: /Allow Running When Locked/.test(txt) && /Sunrise or Sunset/.test(txt) };
    });
    ok(r.synced === 7 && r.never === "rhr,hrv,sleep,bf" && r.skip && r.nev && r.ios27, "coverage check names skipped days and values the phone never sends; guide covers the iOS 27 trigger screens");
    ok(p.errors.length === 0, "no JS errors in Health sync " + p.errors.join(" | "));
    await p.close();
  }

  console.log("v4: readiness, modes, command strip, fuel, quality, recipes, biometrics");
  {
    const p = await page(browser, { width: 1280, height: 900 });
    let r = await p.evaluate(() => {
      const d = TODAY, y = addD(d, -1), o = {};
      o.none = readiness(d);
      S.log[y] = { s: "8.5", e: "5" }; const est = readiness(d); o.est = est && est.est && isFinite(est.pct); o.estAdj = adjusted({ sets: 4, rir: 2 }, Object.assign({}, est, { level: "red" })).sets;
      S.log[d] = { s: "abc", e: "NaN", sr: "" }; S.hd[d] = { hrv: NaN, rhr: 0 }; const junk = readiness(d); o.junk = junk === null || (junk.est && isFinite(junk.score));
      S.log[d] = { s: "4.5" }; const one = readiness(d); o.one = one && !one.est && one.level === "red" && one.parts.length === 1 && one.missing.length === 4 && isFinite(one.pct);
      S.water[y] = 3000; S.done[y] = 90; const more = readiness(d); o.ctx = more.parts.length === 3 && more.pct > one.pct;
      renderPlan(); o.badge = $("rdBadge").textContent; o.rdx = !!document.querySelector("#readyBox .rdx");
      return o;
    });
    ok(r.none === null && r.one && r.junk, "readiness: no data gives no score, one signal gives a real score, junk never gives NaN");
    ok(r.est && r.estAdj === 4, "a day with no data shows a carried-forward estimate that does not change the prescription");
    ok(r.ctx && r.rdx && /RED · \d+/.test(r.badge), "context signals re-weight the score and the breakdown is shown");
    r = await p.evaluate(() => {
      const tabs = [...document.querySelectorAll(".tab:not([hidden])")].map(t => t.dataset.tab), nav = getComputedStyle(document.querySelector(".tabs"));
      showTab("overview"); const legacy = TAB === "food" && $("pane-overview").classList.contains("active") && !!document.querySelector("#pane-overview .foodseg .on");
      showTab("quality"); const q = $("pane-quality").classList.contains("active") && !!document.querySelector("#pane-quality .empty");
      return { tabs, side: nav.position === "fixed" && parseInt(nav.width) < 260, legacy, q };
    });
    ok(r.tabs.join() === "plan,train,food,quality,progress" && r.side, "five pillars, shown as a left sidebar on desktop");
    ok(r.legacy && r.q, "Targets lives under Fuel (old links still land there); Quality opens with a starter state");
    r = await p.evaluate(() => {
      showTab("plan"); setMode("guided"); const g = { mode: document.documentElement.dataset.mode, micro: getComputedStyle($("microBox").closest(".card")).display, kpis: getComputedStyle($("kpis")).display };
      const cb = document.querySelector('#hList input[type=checkbox]'); cb.click(); const still = S.ux.mode;
      setMode("pro"); const pr = { micro: getComputedStyle($("microBox").closest(".card")).display, saved: JSON.parse(localStorage.getItem(KEY)).ux.mode };
      return { g, still, pr, rings: document.querySelectorAll("#cmdBox .cring").length, nba: !!document.querySelector("#cmdBox .nba1 b").textContent, card: !!$("modeCard") };
    });
    ok(r.g.mode === "guided" && r.g.micro === "none" && r.g.kpis === "none" && r.pr.micro !== "none" && r.pr.saved === "pro" && r.card, "Guided hides the dense cards, Elite Pro shows them, the choice is saved");
    ok(r.still === "guided", "ordinary clicks do not change the mode");
    ok(r.rings === 4 && r.nba, "Today shows four rings and a next best action");
    r = await p.evaluate(() => {
      S.sel = TODAY; renderPlan(); setPlanSeg("m");
      $("exN").value = "Burrito"; $("exP").value = "40"; $("exC").value = "60"; $("exF").value = "20"; $("btnAddEx").click();
      const e = S.flog[TODAY].slice(-1)[0], kc = e.kcal;
      document.querySelector(`[data-fsfav="${e.id}"]`).click(); const fav = S.favs.length;
      document.querySelector("#foodBox [data-qa]").click(); const n = S.flog[TODAY].length;
      document.querySelector("[data-supp]").click(); const sup = Object.keys(S.supp[TODAY] || {}).length;
      renderPlan(); const nut = S.nut[TODAY];
      return { kc, fav, n, sup, nut, name: e.n };
    });
    ok(r.kc === 580 && r.name === "Burrito" && r.fav === 1 && r.n === 2 && r.nut && r.nut.k === 1160, "quick add works out calories from macros, favorites re-log in one tap, the day's intake is recorded");
    ok(r.sup === 1, "supplements are ticked per day");
    r = await p.evaluate(() => {
      const whole = qScore({ kcal: 60, p: 10, sugar: 3, sat: .2, sodium: 40, fiber: 0 }, { nova: 1, add: 0 }), junk = qScore({ kcal: 480, p: 5, sugar: 32, sat: 9, sodium: 700, fiber: 1 }, { nova: 4, add: 6 }), part = qScore({ kcal: 300, p: 8 }, {}), none = qScore({}, {});
      const it = offNorm({ product_name: "Choco Bar", nutriments: { "energy-kcal_100g": 480, proteins_100g: 5, sugars_100g: 32, "saturated-fat_100g": 9, sodium_100g: .7 }, nova_group: 4, additives_n: 6 });
      FS.res = [it]; FS.msg = ""; showTab("quality"); renderQuality();
      const card = $("pane-quality").querySelector(".qcard"), txt = card ? card.textContent : "";
      document.querySelector("[data-qadd]").click(); const e = S.flog[S.sel].slice(-1)[0];
      return { w: whole.score, j: junk.score, flags: junk.fl.map(f => f[1]).join("|"), part: part.est && isFinite(part.score), none: isFinite(none.score), swap: /Cleaner swap/.test(txt), up: /Ultra-processed/.test(txt), q: e.q, qx: qScore(it.per, it.meta).score, day: qDay(selDay()).score };
    });
    ok(r.w >= 85 && r.j <= 25 && /Ultra-processed/.test(r.flags) && /High sugar/.test(r.flags) && /High sodium/.test(r.flags) && /additives/.test(r.flags), `quality score separates whole food (${r.w}) from ultra-processed (${r.j}) and flags why`);
    ok(r.part && r.none && r.swap && r.up && r.q === r.qx && r.q <= 25 && isFinite(r.day), "missing label data is re-weighted and marked as an estimate; a product card shows flags, a swap and logs with its score");
    r = await p.evaluate(() => {
      S.recipes = [{ id: "r1", name: "Chicken rice", slots: ["M"], time: "20 min", kcal: 500, P: 45, C: 50, F: 10, ing: ["200 g chicken breast", "1 1/2 cups rice", "salt"], steps: ["Cook rice", "Grill chicken"], use: true, fav: false }];
      S.groc = []; save(); regen(); renderAll(true); showTab("food", "kitchen");
      const sc = [scaleLine("1 1/2 cups rice", 2), scaleLine("200 g chicken breast", 3), scaleLine("salt", 4), scaleLine("1/2 tsp salt", 3)];
      document.querySelector('[data-rsc="r1|1"]').click(); document.querySelector('[data-rsc="r1|1"]').click();
      const before = (S.flog[S.sel] || []).length; document.querySelector('#kRecipes [data-rlog="r1"]').click(); const e = S.flog[S.sel].slice(-1)[0];
      document.querySelector('[data-rgl2="r1"]').click(); document.querySelector('[data-rgl2="r1"]').click();
      const g = S.groc.map(x => x.t);
      document.querySelector('[data-rck="r1"]').click(); const cook = { open: !$("cook").hidden, batch: $("cook").querySelectorAll(".ck-mult [data-ckact]").length, ing: $("cook").querySelector(".ck-list").textContent };
      cookAct("m10"); const ten = $("cook").querySelector(".ck-list").textContent; cookAct("close");
      return { sc, added: S.flog[S.sel].length - before, kcal: e.kcal, g, cook, ten };
    });
    ok(r.sc.join("|") === "3 cups rice|600 g chicken breast|salt|1.5 tsp salt", "recipe scaler multiplies whole numbers, fractions and mixed numbers");
    ok(r.added === 1 && r.kcal === 1500, "one tap logs the scaled servings to the food log");
    ok(r.g.length === 3 && r.g.includes("1200 g chicken breast") && r.g.includes("9 cups rice"), "adding a recipe to groceries twice combines matching lines instead of duplicating them");
    ok(r.cook.open && r.cook.batch === 8 && /600 g chicken/.test(r.cook.ing) && /2000 g chicken/.test(r.ten), "cook mode opens from a recipe and rescales up to 10×");
    r = await p.evaluate(() => {
      S.hd = {}; S.nut = {}; S.wlog = {};
      for (let i = 0; i < 20; i++) { const d = addD(TODAY, -i); if (i % 3) { S.hd[d] = { sleep: 6 + (i % 4) * .5, hrv: 45 + i % 9, steps: 6000 + i * 150 }; hxProject(d) } if (i % 2) S.wlog[d] = { name: "A", start: 1, end: 2, mins: 50, sets: 15, reps: 120, vol: 4000 + (i % 4) * 400 }; if (i % 4 === 0) (S.log[d] = S.log[d] || {}).w = 75 - i * .05 }
      showTab("progress"); renderProgress();
      const txt = $("bioBox").textContent, tiles = document.querySelectorAll("#bioBox .btile").length;
      document.querySelector('[data-bior="90"]').click(); const rng = BIO.range; document.querySelector('[data-biom="hrv"]').click();
      const chart = !!document.querySelector("#bioBox svg.biochart circle"), empty = (() => { BIO.metric = "bf"; renderBio(); return !!document.querySelector("#bioBox .card.bio .empty") })();
      const csv = bioCSV().split("\n"), roll = rolling([{ d: "a", v: 2 }, { d: "b", v: null }, { d: "c", v: 4 }], 7);
      BIO.metric = "weight"; BIO.range = 30; renderBio();
      return { nan: /NaN|undefined|Infinity/.test(txt), tiles, rng, chart, empty, head: csv[0].split(",").length, rows: csv.length, roll, pr: pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), corr: bioCorr(30).filter(c => c.r != null).length, over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    ok(!r.nan && r.tiles === 9 && r.rng === 90 && r.chart && r.empty, "biometrics: sparse data never prints NaN, range and metric selectors work, an empty metric shows a starter state");
    ok(r.roll[1].est === true && r.roll[1].v === 2 && r.roll[2].v === 3 && Math.abs(r.pr - 1) < 1e-9 && r.corr >= 1, "rolling average marks gap days as estimates; correlations appear once 5 paired days exist");
    ok(r.head === 20 && r.rows > 5 && !r.over, "daily CSV export has one row per day");
    ok(p.errors.length === 0, "no JS errors in v4 " + p.errors.join(" | "));
    await p.close();

    const o = await browser.newPage({ viewport: { width: 390, height: 900 } });
    o.errors = []; o.on("pageerror", e => o.errors.push(e.message));
    await o.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
    await o.addInitScript(() => { if (!localStorage.getItem("elitePeakingState_v3")) localStorage.setItem("elitePeakingState_v3", JSON.stringify({ prof: { kg: 80, goal: "cut" }, log: { "2026-11-01": { w: 80 } }, checks: {}, perf: {}, extra: { "2026-11-01": { kcal: 300, p: 20 } }, hist: { a: { u: "x", d: "2026-11-01", w: 50, r: 5 } }, done: {}, flog: {}, sets: {}, steps: {}, hd: { "2026-11-01": { steps: 0, sleep: 0, hrv: 0, rhr: 0, w: 0, kcal: 0, cardio: [] } } })) });
    await o.goto(url); await o.waitForFunction(() => typeof W !== "undefined" && W && W.days);
    const mg = await o.evaluate(() => { showTab("progress"); showTab("quality"); showTab("plan"); return { kg: S.prof.kg, extra: S.extra["2026-11-01"].kcal, hist: Object.keys(S.hist).length, mode: S.ux.mode, supp: typeof S.supp, favs: Array.isArray(S.favs), pill: $("hxPill").textContent } });
    ok(mg.kg === 80 && mg.extra === 300 && mg.hist === 1 && mg.mode === "pro" && mg.supp === "object" && mg.favs && /Connect Health/.test(mg.pill) && o.errors.length === 0, "a v3 backup loads unchanged: data kept, new fields added, existing users stay in Elite Pro " + o.errors.join(" | "));
    await o.close();
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
