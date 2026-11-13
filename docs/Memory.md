# Elite OS — Memory

State of the app and the decisions behind it. Newest first.

## v4.0.2 — sleep for iPhone-only users, build 2026.11.13.3 (2026-11-13)

- [OBSERVED] The owner has no Apple Watch; other users do. A 6:42 PM background run delivered steps, weight and 1 kcal, and no sleep, resting HR, HRV or body fat. The "Value is not In Bed" filter removed the only sleep an iPhone records.
- Shortcut sends two sleep fields: `sleep` (asleep stages: In Bed and Awake filtered out) and `inbed` (In Bed only). The parser uses `sleep` when it is present, else `inbed`, and reports the fallback in `ignored`. Health Auto Export rows fall back to `inBed` the same way. Old shortcuts are unaffected.
- Edge function `health` deployed as version 7 (same index.ts; parse.mjs as in the repo).
- Not verified: whether the owner's 1 kcal active energy is real or a statistics or limit setting in the shortcut.
- Tests: 147 passed.

## v4.0.1 — iOS 27 Shortcuts guide, build 2026.11.13.2 (2026-11-13)

- **What the server showed.** One sync link (created 2026-11-06). 6 days of data in 14: Nov 6, 7, 8, 11, 12, 13. Every row has steps; weight and active energy on most. Sleep, HRV, resting HR, body fat and workouts never arrived. Runs at 02:00 UTC (9 PM Eastern) succeeded on Nov 7 and 8 and failed on Nov 9 and 10, which fits the locked-phone limit.
- **iOS 27 changed automations** (Apple Support, iOS 27 guide): they are added inside a shortcut (Edit → Automation), and Edit → ⓘ → Privacy → "Allow Running When Locked" replaces Run Immediately. "Time of Day / Sunrise / Sunset" is the time screen, not the trigger list; Apple lists App, Alarm, Charger and others as auto-run triggers.
- **Guide now says:** two triggers (9:30 PM Time of Day plus App: Is Opened), with a one-action helper shortcut if a shortcut takes only one trigger. Unverified: whether iOS 27 allows several triggers per shortcut, and whether Allow Running When Locked also unlocks Health reads.
- **Coverage check** in the Health sync card: days synced out of 14, per-field counts, and a "never received" callout naming the missing Find Health Samples steps.
- Tests: 146 passed.

## v4.0 — full audit and upgrade, build 2026.11.13.1 (2026-11-13)

**Owner approved 2026-11-13: SQL applied, edge function deployed (v6), app merged to `main`.**

### Health sync (the main fix)
- **Root causes found.** (1) `_hnum` stripped non-digits, so a Shortcuts list `"58\n62"` became 5862 and was dropped, and `"165,4"` became 1654. (2) `0` passed the range check and overwrote real steps and energy; the app's own "Send a test" sent `steps: 0`. (3) A missing date fell back to the server's UTC date, so a 9 PM Pacific sync was filed under tomorrow. (4) A non-ISO date ("Nov 13, 2026 at 9:00 PM") made the row vanish while the response still said ok. (5) Any body that was not strict JSON returned 400, and Shortcuts emits `"steps":,` when a value is empty. (6) The client pull replaced the whole day with the server row, zeros included. (7) `#h=` links only ran on first load, only carried weight and steps, and overwrote hand-typed weights. (8) iOS blocks Health reads while the phone is locked, so the documented 9 PM Time of Day trigger fails (verified from Apple Support Communities and Automators threads).
- **One normalizer, two homes.** `supabase/functions/health/parse.mjs` holds the `HX` block; `index.html` carries a byte-identical copy (no build step). `tools/inline-hx.cjs` re-copies it and a test fails on drift.
- **Rules.** Blank, null, "NaN", 0 and out-of-range values are "not sent". Lists: sum for steps/energy/sleep, mean for HRV/RHR, last for weight. Same-day duplicates inside one payload keep the larger total. Separate `steps_watch` / `steps_phone` keep the larger one. Weight is normalized to kg. Issues are returned (`ignored`) and logged, never fatal.
- **Client.** `hxIngest` → `hxNormalize` → `hxUpsert` (date-keyed merge into `S.hd`) → `hxProject` (fills `S.steps` / `S.log` only where nothing was typed by hand). Sources: link (`#sync&…`, `#health=…`, legacy `#h=…`, also `?`), paste, file, cloud pull, custom feed URL. Runs on load, hashchange, pageshow, focus, visibilitychange.
- **Server.** Edge function accepts POST/GET/PUT, JSON, form or text bodies and query params; `tz` and `u` ride in the link. `supabase/v4-health.sql` adds `body_fat` and makes `health_ingest` treat 0 as null. The app selects `body_fat` and falls back to the old column list on HTTP 400, so it works against either server version.
- **UI.** Header pill (state, last sync, today's n/7), Health sync card in Biometrics: status, today's fields, Sync now, setup guides, repair list, payload tester (Check = dry run, Import = commit), sync log.

### Everything else
- **Navigation.** Five pillars: Today, Train, Fuel & Recipes, Quality, Biometrics. Targets moved under Fuel (`showTab("overview")` still works). Desktop ≥1100 px uses a left sidebar.
- **Experience mode.** `S.ux.mode` guided | pro; `html[data-mode]` hides `.pro-only` / `.guided-only`. New users start Guided; anyone with history stays Pro.
- **Command strip.** Four rings (readiness, fuel, train, move) and a Next best action list. It replaces the old "Start here" card.
- **Readiness engine.** 0–100, per-signal breakdown, re-weights around missing signals, three optional context signals, and a carried-forward estimate that never changes sets (`adjusted` ignores `rd.est`).
- **Fuel.** Quick add with full macros goes to the food log; favorites and recents re-log in one tap; supplements per day (`S.supp`); `S.nut` snapshots what was eaten per day so trends work for past weeks.
- **Recipes.** 1–10× scaler, cook mode from a recipe, one-tap log of scaled servings, groceries that combine matching lines and group by aisle.
- **Quality.** `qScore`: 60% nutrients, 25% NOVA, 15% additives, re-weighted when label data is missing (marked ~). Flags and whole-food swaps. Open Food Facts fields added: `nova_group`, `additives_n`, `labels_tags`, sugars, saturated fat.
- **Biometrics.** 9 tiles with 7/30/90-day range, chart with rolling average, correlations (Pearson, ≥5 paired days), daily table (Pro), CSV export.
- **Design.** Type-scale and radius tokens, tabular numerals everywhere, focus rings, toasts, skeletons, empty states.

### Decisions
- **No module split yet.** One file is still the deploy unit; v4 adds ~1,100 lines in marked blocks. The split stays on the backlog and is now due.
- **Quality score is ours.** It is described in-app as an Elite OS estimate, not as any other app's rating.
- **Hand-typed values beat Health.** Import no longer replaces a weight you typed.

### Verified
- `node tests/smoke.cjs` → 145 passed, 0 failed (100 old + 45 new).
- A click-anywhere bug (`closest("[data-mode]")` matched `<html>`) was caught by the old suite and fixed.
- Live: `health_ingest` checked in a rolled-back transaction; the deployed function checked through pg_net (200 with `ignored` for a blank body, 401 for a wrong key).
- Not verified: a real iPhone Shortcut run.

### Owner actions
See `docs/Backlog.md` → "Blocking v4".

## v3.2 — closes the v3 gap list, build 2026.11.06.5 (2026-11-06)

- **Unread badges.** `coach_links.coach_read_at / client_read_at`, set by `msg_read(coach, client)`. Red count on the Today tab (client) and Clients tab (coach); per-client "N new messages" flag. Client marks read after 2.5 s on Today; coach marks read on opening the client.
- **Photo sharing (opt-in).** Private bucket `progress-photos`, path `<uid>/<photoId>_<pose>_<date>.jpg`, JPEG ≤ 2 MB. Storage policies: owner full access; coach read only while `coach_links.share_photos` is true (set by the client through `set_photo_share`). Sharing uploads all local photos and new ones; turning it off deletes every shared copy; deleting a photo or the account deletes its copy. Coach sees first vs latest per pose. RLS verified in a rolled-back test (coach 0 → 1 → 0 photos across opt-in/out; stranger 0; no writes into another user's folder).
- **Supersets in the auto plan.** Profile → Training → "Supersets (auto plan)": pairs accessory exercises (3rd onward, different muscles) into supersets; main lifts stay straight sets.
- **Coach program progression.** Assign a program as "same every week", "+1 set per week (max +2)" or "4-week wave" (build 3 weeks, deload week 4 at 60% of sets). Each assigned day gets a "Week n of N" note.
- **Demo videos.** Any exercise (own plan or coach-assigned) can carry an https demo link; it replaces the generic "▶ form" search with "▶ demo".
- **Copyright.** `LICENSE` (proprietary, all rights reserved, Show Acquisitions), footer on every screen, meta tags, source headers. Open Food Facts attribution (ODbL) added to the footer — it was missing.
- **Privacy text** updated for Health data, push addresses and opt-in photo copies.
- Tests: 100 passed.
- Edge function sources gained a copyright header after deploy; deployed code is otherwise identical (redeploy on next change).

## v3.1 — push notifications + coach macros, build 2026.11.06.4 (2026-11-06)

**Coach nutrition targets.** `coach_links.targets` {P,C,F,note,at}, set only through `coach_set_targets` (validated: P 30–450, C 0–1000, F 15–300, ≥1000 kcal; only for your own client). The client pulls them into `S.cx.targets`; `buildWeek` runs `applyCoachTargets` on `baseTargets`, so meals, groceries and the Today numbers follow the coach while carb cycling still applies (training days +10% carbs). The client's auto-adjust is replaced by a "set by your coach" callout. Clearing restores profile numbers.

**Push notifications (Web Push, no third-party code).**
- `supabase/functions/push/webpush.mjs`: RFC 8291 aes128gcm encryption + RFC 8292 VAPID with WebCrypto only. Verified against the RFC 8291 test vector and a round-trip decrypt (both in `tests/smoke.cjs`).
- Tables: `push_subs` (one row per device, prefs rest/rem/coach), `push_queue` (one pending row per user+tag, so bursts collapse).
- Delivery: `pg_cron` job `elite-push` every 5 s runs `push_kick()`, which calls the `push` edge function through `pg_net` only when something is due. Instant events kick immediately.
- Secrets in Vault: `push_cron_secret` (pg_net → function auth), `push_vapid_private` (JWK). Public key = `VAPID_PUB` in index.html. Rotating keys means every device re-subscribes.
- Events: message (to the other side), assignment (to client, collapsed per coach, 4 s delay so a program is one push), check-in sent (to coach), check-in reply (to client), new targets (to client), rest timer (only when you leave the app mid-rest; cancelled when you return), workout reminders (next 14 days at the profile workout time, re-uploaded after each sync when changed).
- Dead subscriptions (404/410) are removed automatically.
- **Live-verified 2026-11-06** with a throwaway user via pg_net: health link stored data; push function authenticated, encrypted, posted to FCM and pruned the fake endpoint; wrong secret → 401. Not yet verified: a real phone receiving a notification.
- iPhone: only works when the app is opened from the Home Screen (iOS 16.4+). Obsidian embed can't receive notifications.

## v3 callouts everywhere — build 2026.11.06.3 (2026-11-06)

- Callouts now also used for: Profile setup banner, Targets plan notes and a volume verdict (muscles under or over range), Progress weight trend + calorie auto-adjust (with Apply button), deload/retest week, peak-week phases, empty custom plan, coach replies and coach-tab errors. Plain explanatory text stays plain on purpose.
- Coach overview and client detail show meals ticked off (7 d) and cardio minutes.

## v3 polish — build 2026.11.06.2 (2026-11-06)

- **Callout system.** `callout(kind, icon, title, meta, body)` with kinds warm, cool, good/green, warn/yellow, red, info, coach. Used for warm-up, cool-down, readiness verdict, coach notes, rest-day recovery, cardio prescription and Health sync status. `.note` restyled to match.
- **Workout structure.** Today reads Warm-up → Main work → Cool-down. Warm-up and cool-down are built from the session's muscles, have "done" checks and count toward the day. Workout mode shows the full warm-up before the first set and the cool-down on the finish screen. Sets × reps, RIR and rest are chips.
- **Cardio & steps card.** Step ring vs a goal-based target (cut 10k, recomp 8k, gain 7k), 7-day bars with a goal line, a daily cardio prescription (Zone 2 range from 220 − age), weekly minutes vs target (cut 150, recomp 120, gain 60), manual logging. `S.cardio` is synced and merged. Health workouts are shown alongside, read-only.
- **Health set once.** Edge function `health` (verify_jwt off; the hashed sync key is the only credential) takes a personal URL `…/functions/v1/health?t=<key>`. It accepts Health Auto Export JSON (metrics + workouts), a flat Shortcut body or a list of days. Parser `supabase/functions/health/parse.mjs` is pure and unit-tested. `health_daily.cardio` stores Health workouts. The status callout shows working, waiting or stopped.
- **Visuals.** Premium CSS block at the end of `<style>`: 18 px radius, soft shadows, quieter headers, uppercase micro-labels, Progress tab split into Body / Training / Health / Privacy sections.
- Tests: 71 passed (14 new).
- Not verified live: the edge function has not been called end to end (the sandbox can't reach supabase.co). The in-app "Send a test" button calls it.

## v3 — build 2026.11.06.1 (2026-11-06)

**Shipped on branch `claude/bold-bell-1sakoo`. Not on `main` until the owner approves the deploy.**

### What changed
- **Superset groups.** A run of exercises with `ss` ("superset with next") is one group: A1/A2/A3 labels, one bracketed block on Today, a group panel with round counter in workout mode, grouped rails in the builder. Rotation covers any group size; rest starts only after the last exercise of a round. Fixed bug: the old rotation only looked one exercise back, so in a tri-set A1 got one set.
- **Password reset.** `POST /auth/v1/recover?redirect_to=<app>`; the email link returns with `#access_token…&type=recovery`; `authHash()` strips the hash, shows a set-password dialog, `PUT /auth/v1/user`, then signs in. Signup-confirmation links also sign in now. Expired links show a clear message.
- **Sync sign-out bug.** Any HTTP 400 used to wipe the session. Now only a rejected refresh token or a 401 does; offline errors never do.
- **Coaching.** Tables `coach_links`, `coach_invites`, `assignments`, `messages`, `checkins`. A coach reads a client's `progress` row (read-only RLS policy) and writes only to `assignments` / `messages` / check-in replies. The client app pulls these into `S.cx` (local-only, never pushed) and `buildWeek` overlays assignments per date. Coach tab: overview with score (60% workouts vs plan over 28 d, 25% habits over 7 d, 15% check-in), flags sorted by severity, calendar built by the client's own engine (`buildWeek` on their synced state), day editor, assign-a-program from the coach's own saved plans, habits, check-in replies, workout comments, messages.
- **Health auto-sync.** `health_tokens` (hash only) + `health_daily` + `health_ingest(token, payload)` RPC callable with the publishable key. iPhone Shortcuts automation POSTs daily. App pulls 90 days into `S.hd`, fills steps, weight (unless typed by hand), sleep (unless typed). HRV and resting HR vs a 14-day baseline feed readiness.

### Decisions
- **Coach never writes client data.** Separate tables plus an overlay. A shared-blob design would have let a coach corrupt a client's history with one bad merge. Verified with rolled-back SQL tests: a stranger reads 0 rows from every table; a coach updates 0 client progress rows.
- **RPC instead of an edge function for Health ingest.** No secrets to manage, no deploy; the token is hashed and only the RPC can read the token table.
- **Single file kept.** Deploy is a copy of one file; v3 adds about 25% and sits in one marked block (`V3: COACHING + HEALTH AUTO-SYNC`).
- **"Version 3" is a label.** `APP_MAJOR="3"`, while `APP_VER` stays date-based because the update checker compares it to `version.json`. Storage key `elitePeakingState_v3` unchanged (renaming it would wipe local data).

### Verified
- `node tests/smoke.cjs` → 57 passed, 0 failed (34 old + 23 v3, Supabase mocked).
- RLS: 19 checks in a rolled-back transaction against the live project, all as expected.
- Not verified live from the build sandbox: real email delivery and a real Shortcut run (the sandbox can't reach supabase.co).

### Owner setup still required (Supabase dashboard)
See `docs/Backlog.md` → "Blocking v3".
