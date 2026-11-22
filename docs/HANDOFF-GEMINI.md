# Elite OS v5.0 — Second-Pass Review Handoff (Claude Opus → Gemini)

> **Repository:** `showacquisitions/elite-peaking-os`
> **Branch:** `v5-elite-overhaul`. The review commit sits on top of `daf360a`.
> **Read first:** `docs/HANDOFF-OPUS.md` (the original v5.0 overhaul and the 9-item checklist this pass answered).
> **Verification:** `node tools/build.cjs && node tests/smoke.cjs index.html` gives **179 passed, 0 failed**. Before this pass it was 170 / 0. Nine new regression tests were added, and one fixture was corrected.

---

## 1. Prompt you can paste to Gemini

```text
Pull branch `v5-elite-overhaul` of `showacquisitions/elite-peaking-os` and read `docs/HANDOFF-GEMINI.md`, then `docs/HANDOFF-OPUS.md`.
HANDOFF-GEMINI.md lists every change in the latest review commit, why it was made, and what is still unverified.
Challenge each change: confirm the bug is real, confirm the fix is correct and minimal, and look for regressions.
Pay most attention to Section 4 ("Not verified"). Those items were reasoned about but never executed.
Rebuild with `node tools/build.cjs` and confirm `node tests/smoke.cjs index.html` passes 100% before and after any change you make.
Do not edit index.html directly. It is generated from src/* and CI fails if it drifts.
```

---

## 2. What changed and why

### Server: `supabase/v5-elite.sql` (not yet applied to production)

| # | Change | Why |
|---|---|---|
| S1 | `tg_checkins_protect_reply` now keys on `current_user in ('anon','authenticated')` instead of `auth.uid() = old.client_id and not is_coach_of(...)`. It now fires on **INSERT and UPDATE**. | **Security hole:** the old trigger was `before update` only, while policy `"ci own insert"` let a client INSERT a check-in row that already carried a forged `reply` / `replied_at`. A direct PostgREST write runs as `anon`/`authenticated`. `coach_checkin_reply` is `SECURITY DEFINER`, so it runs as its owner and still passes. The client upsert (`src/ui/sync.js`, check-in send) sends only `client_id, week, data, updated_at`, so nothing legitimate breaks. |
| S1a | Handoff item 1 (self-coaching) | **Moot.** `coach_links` has `check (coach_id <> client_id)` and `coach_invite_accept` rejects your own code, so a coach cannot be their own client. The new `current_user` check doesn't rely on `is_coach_of` anyway. |
| S2 | `push_result_v2` increments `fail_count` only when the failure item carries `count: true`. It still records `last_err` for every failure. | **Mass-deletion footgun:** the old code counted every non-404/410 failure, and the comment named `BadJwtToken` / stale VAPID as a pruning reason. Those are faults on *our* side and hit every subscription at once. One bad VAPID key would have deleted every device's subscription after 5 sends, and every user would have had to re-subscribe by hand. |
| S3 | pg_cron reverted from `15 seconds` back to `5 seconds`. | **UX regression:** `push_timer` (the rest timer) enqueues with `kick = false` and a future `due_at`, so the cron tick is its **only** delivery path. At 15 s the locked-screen "Rest is over" alert would arrive up to 15 s late. An idle tick costs one indexed `exists()` check (`push_queue_due`), and pg_net is called only when something is due. |
| S4 | `_merge_cardio` left unchanged (handoff item 3). | It dedupes by `(type, min)`, which matches `parse.mjs` (`hxMerge`) and the client (`hxProject` in `sync.js`). `NULL` vs `[]` is handled: an empty or NULL new list keeps the old list, and an empty or NULL old list takes the new one. The known limitation is listed in Section 4. |

### Push Edge Function: `supabase/functions/push/index.ts` + `webpush.mjs` (needs redeploy)

| # | Change | Why |
|---|---|---|
| P1 | New `topicOf(tag)` in `webpush.mjs` builds the RFC 8030 `Topic` from the first 32 chars of the base64url SHA-256 of the tag. The old code stripped and truncated the tag. | **Collision:** tag `msg:<coach uuid><client uuid>` truncated to 32 chars keeps only the coach id. On the coach's device, a pending message from client B would *replace* client A's message in the push service queue. |
| P2 | New `endpointFault(status, reason)` in `webpush.mjs`. `index.ts` sends `count: endpointFault(...)` per failure, and thrown network errors send `count: false`. | Feeds S2. Excluded statuses: 401/403 (VAPID), 413 (our payload), 429/5xx (transient), any reason matching `/jwt|vapid/i`, and 404/410 (already deleted as dead by the caller). |
| P3 | Both helpers live in `webpush.mjs`, not `index.ts`. | `webpush.mjs` runs in both Deno and Node, so `tests/smoke.cjs` can import and test them. |
| — | Handoff item 2 (RFC 8292 headers) | Reviewed, no change. `TTL`, `Urgency` and `Topic` are sent. The VAPID JWT has `aud` = endpoint origin, `exp` = +12 h (under the 24 h limit), and `sub` = `mailto:`. Live APNs 201 is **not verified** (Section 4). |

### Client: `src/*` (rebuilt into `index.html`)

| # | File | Change | Why |
|---|---|---|---|
| C1 | `src/ui/app.js` (`[data-fsfav]`) | A new favorite gets its own id (`fv…`). Un-favoriting skips the tombstone when the fav id is still used by a food-log entry (legacy favs). | **Data loss:** a fav was a copy of the food-log entry, *including its id*. Un-favoriting called `markDeleted(fav.id)`, which tombstoned the food-log entry, and the next `mergeData` deleted that day's logged food on every device. |
| C2 | `src/ui/app.js` (`[data-fsdel]` undo) | Undo restores the entry under a **fresh id** on the **captured day**, not `S.sel` at undo time. | **Race:** the undo toast lasts 5.6 s, but `schedulePush` debounces 4 s, so the tombstone can reach the server before Undo. Restoring the old id lets the next merge delete it again. The old code also restored to whatever day was selected when Undo was tapped. |
| C3 | `src/ui/sync.js` | New `pruneDel()` (90-day cut) is used by `markDeleted` and by `mergeData` output. | Handoff item 4. Pruning happened only on a new local delete, and `mergeData` unioned both devices' tombstones without pruning, so old ones came back. Filtering still uses the full set, and only the shipped set is pruned. |
| C4 | `src/ui/fuel.js` (`fsScan`) | Rewritten cleanup. See the list after this table. | Handoff item 7. Detail follows. |
| C5 | `src/ui/charts.js` | The chart payload moved from the global `window.__CHARTS[id]` to the element (`data-pts`, `data-wd`). It is parsed once and cached on `wrap._chart`. | **Memory leak:** every re-render added an entry to the global map and nothing removed it. Now the data is freed with the DOM. Handoff item 8 needed no other change: `touch-action: pan-y` is set on `.chart-wrap`, and scrub maps through `getBoundingClientRect().width`, so resize scales correctly. |
| C6 | `src/ui/workout.js` + `app.js` (`data-k` change handler) | The warm-up callout hides once `<date>|wu` is checked, and that also suppresses the duplicate first-exercise ramp-up callout. The `data-k` handler calls `wmDraw()` when the cockpit is open. | Handoff item 6. Ticking "Warm-up done" inside the cockpit saved the check but never re-rendered `#wm`, so the callout stayed above the fold. |
| C7 | `src/styles/tokens.css` | Dark `--dim` `#5d6778` → `#7c8ba1`. Light theme now overrides `--dim #5c6878`, `--accent #2155d6`, `--green #146c33`, `--amber`/`--warm #a34e06`, `--red #b91c1c`, `--cool #0369a1`, `--coach #7c3aed`. | Handoff item 9. Measured contrast: dark `--dim` was **3.34:1** on `--panel`. The light theme never overrode the status hues, so amber, green, cool and coach rendered at about **2:1 on white**, and they are used as text (for example the `+N% vs last` volume deltas). Every new value is at least 4.5:1 on `--panel3` (#e5e8ef) and lighter. Colours used as fills (bars, dots, rings) just get darker in light mode, and white-on-red badges improve to 6.5:1. |
| — | `src/ui/workout.js` | Handoff item 5: no change. | `pushSet`/`undoSet`/`topSet`/`wmLog`/`wmFinish`/`wmSave`/`sessStats` all key on `WM.date`. `syncToday()` moves `S.sel` but never touches `WM`. |

**C4 detail (`fsScan`):**
- `@zxing/browser@0.1.5`'s `BrowserMultiFormatReader` has **no `reset()`**. Inspecting the prototype chain in Chromium confirmed it, so the old cleanup was a silent no-op. Cleanup now uses the `controls.stop()` handle.
- **Leaked camera:** tapping Cancel while `getUserMedia` or the CDN load was still pending removed the overlay, but the stream started afterwards and was never stopped (camera light stays on). A `closed` flag is now re-checked after every `await`, and whatever was just acquired is stopped.
- `done()` is idempotent. **Escape** closes the scanner. The overlay has `role="dialog"`, `aria-modal`, an `aria-label`, an `aria-live` status line, and focus on Cancel.
- The CDN script now loads with **SRI** (`sha384-ylLhng89…`, computed from the pinned file) and `crossOrigin="anonymous"`. jsDelivr sends `Access-Control-Allow-Origin: *`. This script runs with the Supabase session token in reach, so a changed CDN file must fail to load rather than run. The service worker passes cross-origin GETs through, so it doesn't interfere.
- Errors are clearer: offline vs load failure vs `NotAllowedError` (camera permission denied). A failed `<script>` tag is removed so a retry can work.
- The decode callback no longer reads `const controls` inside its own initializer (TDZ risk). It uses the callback's third argument instead.

### Tests: `tests/smoke.cjs`
New cases:
- un-favorite keeps the log entry
- undo gets a fresh id and survives a merge with the synced tombstone
- 90-day tombstone pruning
- scanner stops a camera that starts after Cancel or Escape
- chart scrub works without a global map
- cockpit warm-up collapse
- WCAG AA token check in both themes
- push `Topic` uniqueness and length
- `endpointFault` classification

**Fixture changed:** the existing "tombstone sync merge" test used timestamp `2000` (1970), which the new 90-day prune correctly drops. It now uses `NOW() - 2000`, with the same assertion.

---

## 3. Deploy steps (changed from HANDOFF-OPUS §4)

1. Merge `v5-elite-overhaul` → `main`.
2. Apply `supabase/v5-elite.sql` in Supabase Dashboard → SQL Editor. Idempotent.
3. Redeploy the push function: `supabase functions deploy push --no-verify-jwt`. **Required:** `webpush.mjs` and `index.ts` changed.
   - Steps 2 and 3 are safe in either order. A new function with old SQL falls back to `push_result`. Old SQL with the new function leaves `count` missing, which reads as false, so nothing is pruned.
4. iPhone PWA: reload twice. Then Profile → Notifications → Send a test.

---

## 4. Not verified: please check these

1. **SQL was never executed.** No local Postgres, so all four SQL changes were checked by reading only. Run the file against a Supabase branch or a local `supabase start`. Then try:
   - a client `insert into checkins (..., reply) values (..., 'x')` → must raise
   - a client update of `data` only → must pass
   - `coach_checkin_reply` → must pass
2. **APNs HTTP 201 not observed.** Needs the redeployed function and a real iOS 16.4+ device.
3. **ZXing callback third argument (`controls`)** comes from the `@zxing/browser` docs and was not exercised with a real decode. The Cancel and Escape paths use the returned `controls` and are tested with a stubbed `BarcodeDetector` path. The ZXing (Safari) path itself has no automated test, because the smoke run blocks the network.
4. **iPhone SE (375×667) cockpit with the docked timer** was checked by reading the CSS (`#timer` at `bottom: 82px` above a ~78 px sticky `.wm-nav`, `.wm-body` padding 112 px), not by screenshot.
5. **Known limitations, left as-is on purpose:**
   - `_merge_cardio`, `parse.mjs` and the client all treat two workouts with the same type and duration on the same day as one. A real fix needs the workout start time stored end to end (parser, `health_ingest` whitelist, client). That is a feature, not a patch.
   - Union merge means a workout deleted in Apple Health stays in `health_daily`.
   - Legacy favorites that still share an id with a log entry are not tombstoned when removed, so they may reappear on another device.
   - A device offline for more than 90 days can resurrect items deleted in the meantime (tombstone TTL).
   - Light `--accent` moved from `#2563eb` to `#2155d6`, a slight brand shift needed for AA on `--panel3`.
6. **Windows note:** `git diff` shows `index.html` as changed after a rebuild on Windows. That is only autocrlf (the build writes LF). CI runs on Linux and is unaffected.
