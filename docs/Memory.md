# Elite OS — Memory

State of the app and the decisions behind it. Newest first.

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
