# Elite OS — Memory

State of the app and the decisions behind it. Newest first.

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
