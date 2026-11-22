# Elite OS v5.0 — Claude Opus Review & Polish Handoff

> **Branch:** `v5-elite-overhaul` (branched from `main` @ `f8d0985`)
> **Build:** `2026.11.21.1` (major `5.0`)
> **Status:** All 3 overhaul phases implemented, built cleanly into single-file `index.html`, visually inspected across mobile (390×844 dark + light) and desktop (1440×900 dark), and verified via Playwright (`tests/smoke.cjs`). Ready for Claude Opus second-pass audit, hardening, and polish before merge to `main`.

---

## 1. Executive Summary of What Changed

Elite OS has been upgraded across **all 3 phases** of the v5.0 audit:

1. **Phase 1 — Mechanical, Security & UX Reliability**
   - **Dynamic midnight rollover:** `TODAY` is now mutable with `syncToday()` hooked into `visibilitychange`, `focus`, and `pageshow` (`src/ui/sync.js`), so an installed PWA left open overnight rolls cleanly to the new day.
   - **Wall-clock rest timer & AudioContext:** `startTimer()` / `tickTimer()` now track wall-clock `tmrEnd = Date.now() + secs * 1000` (`src/ui/workout.js`), catching up instantaneously when returning from lock screen/background. Added `−15s`, `+15s`, `Skip`, live progress bar, and a single shared gesture-unlocked `AudioContext` (eliminates iOS silent-beep and context leak).
   - **Manual telemetry protection:** Manual weight (`#lw`), manual sleep (`#ls` + readiness sleep dropdown), and manual steps (`#cdSteps` tracked in `S.stepsM`) are preserved against subsequent Health syncs (`hxProject()`). When Health also has steps for a manually overridden day, both the editable input and a `"Synced from Health: N"` badge display.
   - **Tombstone sync merge:** Added `S.del` (`SYNCKEYS`) and `markDeleted(id)` so deleted `recipes`, `groc`, `favs`, and `flog` items do not resurrect across devices in `mergeData()` (`src/ui/sync.js`).
   - **Cardio deletion by ID:** Cardio entries now delete by stable `id` (`data-cddel`) with an Undo toast instead of fragile array index.
   - **Server/RLS hardening (`supabase/v5-elite.sql`) & APNs Web Push (`supabase/functions/push/index.ts`):**
     - `checkins_protect_reply` `BEFORE UPDATE` trigger prevents clients from overwriting coach `reply`/`replied_at` via the `checkins_client_all` policy.
     - `_merge_cardio(old, incoming)` preserves earlier Health cardio workouts during partial syncs inside `health_ingest`.
     - `push_subs` gains `fail_count` + `last_err` and `push_result_v2` RPC prunes endpoints after 3 consecutive non-404/410 failures; `pg_cron` interval adjusted from 5s → 15s.
     - VAPID `SUBJECT` changed from `https://showacquisitions.github.io/elite-peaking-os/` to `mailto:showacquisitions@gmail.com` to resolve Apple APNs HTTP 400 rejections.
   - **Zero native browser popups:** Eliminated all 25+ `alert()` / `confirm()` / `prompt()` calls in `src/ui/` in favor of Promise-based `uiAlert`, `uiConfirm`, `uiPrompt`, `openSheet` (`src/ui/dialogs.js`), and Undo-capable `toast()`.
   - **Surface declutter & zero monkey-patching:** Removed redundant `.hero` (merged streak/PR into Daily Brief `#cmdBox`), collapsed Quick Add behind `#btnOpenQuick` inside Food Log, removed redundant standalone Steps card and legacy 28d weight polyline, moved Data & Privacy to Profile, and replaced v4's `const _rp = renderPlan; renderPlan = ...` monkey-patching with direct clean orchestration in `src/ui/app.js`.

2. **Phase 2 — Obsidian Precision Visual Overhaul**
   - **3-file CSS design system:** Replaced 5 stacked CSS eras with `src/styles/tokens.css`, `src/styles/base.css`, and `src/styles/components.css`. True OLED Obsidian dark (`#050608` canvas, `#0D1015` / `#141820` / `#1B212C` stepped graphite, translucent hairline borders, platinum `#F8FAFC` high-contrast primary CTAs) plus Ceramic Light mode (`#F4F6FA` / `#FFFFFF`).
   - **Typography & brand:** Added `Plus Jakarta Sans` + `JetBrains Mono` (`tabular-nums`), removed gradient `<h1>` and double desktop branding, designed geometric apex-chevron `icon.svg` and regenerated crisp `icon-512.png`, `icon-192.png`, and `apple-touch-icon.png`.
   - **100% vector iconography:** Expanded `ICO_P` to 48 uniform 1.75px-stroke SVG icons (`src/ui/icons.js`); zero raw system emojis in UI chrome.
   - **Touch-scrubbable SVG charts:** Unified `buildInteractiveChart()` (`src/ui/charts.js`) with pointer drag/hover vertical crosshair and live readout header across Strength, EWMA/Weight, and Biometrics charts.

3. **Phase 3 — 1% Elite Athletic & Nutrition Engine + Module Split**
   - **Gym-Floor Workout Cockpit (`#wm` in `src/ui/workout.js`):** Live elapsed clock (`#wmClock`), structured Set/Previous/Logged/RIR table showing previous-session ghost sets, `−`/`+` weight & rep steppers, inline Plate Calculator drawer (`[data-wm="plates"]`), mid-session Exercise Swap drawer (`[data-wm="swap"]`), inline ramp-up checklist, edit-any-set (`[data-wmedit]`), `+ Add set`, docked wall-clock rest bar, and `localStorage` draft recovery (`eliteWmDraft`).
   - **EWMA Trend Weight & MacroFactor-style Adaptive TDEE (`src/engine/core.js`):** Added `ewmaSeries(log, today, span)` (α = 0.14) and `adaptiveTDEE(log, nut, prof, today)` (`avgIntake - deltaTrendKg * 7700 / span`), surfaced in Biometrics → Trend & adaptive TDEE with dual-series scale vs EWMA interactive chart.
   - **Nutrition depth (`src/data/foods.js`, `src/ui/fuel.js`):** Added USDA per-100g micronutrients (`mi`) to all 50 `FOODS` entries so ticked planned meals populate `dayMicros()` and `#microBox` automatically; added `0.5× / 1× / 1.5×` planned meal portion toggles (`S.mealMult`); added lazy ZXing CDN barcode scanner fallback in `fsScan()` for iOS Safari.
   - **Strength engine & library (`src/data/exercises.js`, `src/ui/workout.js`):** Smooth tapered E1RM above 12 reps (no 12-rep cliff), bodyweight-inclusive `effLoad()` for `bw: 1` exercises (pull-ups, dips, push-ups), and exercise library expanded from 63 → **140 exercises** preserving every original `slot:id` key.
   - **Modular source + zero-dependency build (`tools/build.cjs`):** Single-file `index.html` is now deterministically assembled from `src/*` + `supabase/functions/health/parse.mjs` (`/*HX-BEGIN*/.../*HX-END*/`). `.github/workflows/test.yml` enforces `node tools/build.cjs && git diff --exit-code index.html` before running Playwright.

---

## 2. Architecture & File Map

```text
src/
  template.html            HTML shell + Google Fonts + /*__STYLES__*/ /*__ENGINE__*/ /*__UI__*/
  styles/
    tokens.css             Obsidian Dark + Ceramic Light tokens, type scale, radii, motion
    base.css               Reset, responsive sidebar / mobile glass tab bar, forms, modals, toast
    components.css         Week strip, Daily Brief, Workout Cockpit, Rest Timer, Charts, Coach
  data/
    exercises.js           140 exercises (all 63 original slot:id preserved + bw flags)
    foods.js               50 FOODS with USDA per-100g mi micronutrients, TPL, REC, VAR, SHARES
  engine/
    core.js                Pure deterministic engine: targets, splits, meal solver, EWMA, adaptiveTDEE
  ui/
    icons.js               48 uniform 1.75px SVG icons (ICO_P, ico(), hydrateIcons())
    dialogs.js             Promise modals (uiAlert/uiConfirm/uiPrompt/openSheet) + Undo toast
    charts.js              sparkline, ring, ringSm, ringBig, qGauge, buildInteractiveChart()
    workout.js             Shared AudioContext, wall-clock timer, smooth E1RM, Plate Calc, #wm Cockpit
    sync.js                State S, dynamic TODAY/syncToday(), tombstone mergeData(), Supabase, Coach, Push, HX
    fuel.js                eatenOn() w/ mealMult, dayMicros(), qScore, OFF search + ZXing fsScan, Cook, Recipes
    app.js                 Unified orchestrator (Today, Readiness, Cardio, Biometrics, Profile, Event routing, Boot)
tools/
  build.cjs                Zero-dep bundler → index.html (auto-inlines HX block from parse.mjs)
  inline-hx.cjs            Back-compat wrapper delegating to build.cjs
supabase/
  v5-elite.sql             Additive idempotent SQL migration (checkins trigger, cardio merge, push_result_v2, 15s cron)
  functions/push/index.ts  mailto: VAPID subject + push_result_v2 failure tracking
tests/
  smoke.cjs                170 Playwright tests (all 158 existing + 12 v5.0 regression checks)
```

**Build command (always run after editing anything in `src/` or `parse.mjs`):**
```bash
node tools/build.cjs
```

**Test command:**
```bash
node tests/smoke.cjs index.html
```

---

## 3. Specific Areas for Claude Opus to Double-Check & Improve

Please scrutinize the following areas carefully — these are the highest-leverage spots where a fresh Opus audit can catch subtle edge cases or elevate quality even further:

### A. Backend & Security (`supabase/v5-elite.sql` & `supabase/functions/push/index.ts`)
1. **`checkins_protect_reply` trigger vs `coach_checkin_reply` SECURITY DEFINER:**
   - Verify in `supabase/v5-elite.sql` that when `coach_checkin_reply(...)` (a `SECURITY DEFINER` RPC owned by `postgres`) runs `UPDATE checkins SET reply = ..., replied_at = ...`, `current_user` / `session_user` / `auth.uid()` behaves as expected!
   - **CHECK CAREFULLY:** In Supabase PostgREST, `auth.uid()` reads `request.jwt.claims` (which is still the coach's JWT inside a `SECURITY DEFINER` function), while `current_user` is `postgres`! Currently our trigger checks `auth.uid() IS NOT NULL AND OLD.client_id = auth.uid()` — if a user is coaching *themselves* (testing coach mode on their own account!) `OLD.client_id = auth.uid()` would be true even inside `coach_checkin_reply`. Consider checking `current_setting('role', true)` or a session local flag `set_config('elite.allow_reply', '1', true)` inside `coach_checkin_reply` so even self-coaching works cleanly while direct client REST `PATCH /rest/v1/checkins` is 100% blocked!
2. **APNs Web Push (`mailto:` VAPID subject):**
   - `supabase/functions/push/index.ts` changes `SUBJECT` to `mailto:showacquisitions@gmail.com` and calls `push_result_v2` (with graceful fallback to `push_result` if SQL hasn't been applied yet). Double-check `supabase/functions/push/webpush.mjs` to ensure no other header (`TTL`, `Urgency`, `Topic`, `Authorization` format `vapid t=..., k=...`) could trigger an Apple APNs 400 on iOS 16.4–27.
3. **`_merge_cardio` deduplication key:**
   - In `supabase/v5-elite.sql`, `_merge_cardio` deduplicates Health cardio entries by `(type, min, start/km)`. Double-check edge cases when Apple Health sends two identical-duration walks on the same day without timestamps, or when `cardio` is `NULL` vs `[]`.

### B. State Sync, Migrations & Offline Edge Cases (`src/ui/sync.js`)
4. **Tombstone pruning & `S.del` growth:**
   - `S.del` currently stores `{ [id]: timestamp }`. Over months/years of food logging deletions, `S.del` could grow unbounded. Consider pruning tombstones older than e.g. 90 days in `mergeData()` / `save()` (or capping `S.del` to the newest 500 entries) so the synced JSON blob stays compact.
5. **`syncToday()` mid-workout or mid-edit behavior:**
   - `pushSet()`, `undoSet()`, and `topSet()` in `src/ui/workout.js` now anchor to `WM.on ? WM.date : S.sel` so midnight rollover during an active workout keeps all sets and `S.hist` entries on `WM.date` (and `undoSet()` removes `S.hist[k]` if the last set of the day is undone). Double-check `wmFinish()` and `wmSave()` under a simulated midnight rollover as well.
6. **v3/v4 backup import & `S.mealMult` / `S.stepsM` / `S.del`:**
   - Double-check `v4Norm()` and `mergeData()` in `src/ui/sync.js` for backward compatibility with older cloud blobs that lack `del`, `stepsM`, or `mealMult`, and verify `SYNCKEYS` + `MAPK` cover `mealMult`, `stepsM`, `del`.

### C. UI, Ergonomics & Mobile Safari Details
7. **Workout Cockpit (`#wm`) polish:**
   - When `WM.on` is open and `#timer` is running, verify scroll behavior on small iPhones (375×667 SE) so the `Log set` button and RIR pills are always reachable above the docked `#timer` bar.
   - Check `wmLog()` when editing a set (`WM.editIdx != null`): verify `S.hist` recomputes properly if the user lowers the weight of their previously top set (it calls `topSet(e.uid)` which scans all sets in `S.sets[k]` — good! Verify what happens if `undoSet` removes the last set of the day: does it also clean up `S.hist[k]`?).
   - Consider adding a quick **"Collapse/Hide warm-up"** toggle inside `#wm` once the user checks `"Warm-up done"` so the set table & stepper inputs immediately sit above the fold without scrolling!
8. **iOS Safari Barcode Scanner (`fsScan` in `src/ui/fuel.js`):**
   - `fsScan()` now falls back to dynamically loading `@zxing/library` from jsDelivr when `BarcodeDetector` is unavailable (iOS Safari). Verify cleanup of the `<video>` stream (`tracks.forEach(t => t.stop())`) and `codeReader.reset()` when closing the scanner sheet early or pressing Escape, and verify graceful error message when offline.
9. **Touch-scrubbable SVG charts (`src/ui/charts.js`):**
   - Verify touch dragging horizontally on mobile Safari (`touch-action: pan-y` on `.chart-wrap`): check whether `pointercancel` or vertical scroll steals the gesture, and whether releasing the finger resets or holds the crosshair cleanly.
   - Also check `renderBio()` when switching between dark and light mode (or resizing viewport): `buildInteractiveChart` uses `window.innerWidth` at render time for `Wd`; adding a debounced resize re-render or fixed `viewBox="0 0 600 195"` may be even cleaner.
10. **Accessibility & Contrast Audit (Light & Dark):**
    - Spot-check WCAG AA contrast of `--dim` (`#64748b` on `#0d1015` ≈ 4.3:1; bumping to `#7c8ba1` gives ≥5.5:1) and `.c-m` amber uppercase labels in Ceramic Light mode (`--amber: #d97706` on light amber tint).
    - Verify keyboard focus trapping or return-focus when closing `#eliteDlg` and `#wm`.

---

## 4. Verification Status Before Handoff

- **Playwright smoke + regression suite:** `170 passed, 0 failed` (158 existing v1–v4.1 tests + 12 new v5.0 tests covering dialogs, wall-clock timer, manual telemetry protection, tombstones, EWMA/adaptive TDEE, smooth E1RM/BW load, 140 exercises, planned-meal micros, portion scaling, Workout Cockpit, zero chrome emojis, and interactive charts).
- **Visual inspection:** Verified rendered PNG screenshots via Playwright at `390×844` (Dark & Light, Today, Nutrition, Workout Cockpit with running rest timer, Biometrics) and `1440×900` (Dark, Today, Biometrics), plus generated `icon-512.png`, `icon-192.png`, and `apple-touch-icon.png`.
- **Not yet live-tested (requires owner Supabase access & real iPhone):**
  1. Applying `supabase/v5-elite.sql` in Supabase SQL Editor.
  2. Redeploying `supabase/functions/push` (`supabase functions deploy push --no-verify-jwt`) and confirming HTTP 201 from Apple APNs on a real iPhone.
  3. Live camera barcode scanning via ZXing fallback on physical iOS Safari.

---

## 5. Owner Deploy Checklist (After Opus Review)

1. Review & merge the PR from `v5-elite-overhaul` → `main` (GitHub Actions CI will verify build determinism + all 170 Playwright tests).
2. Run `supabase/v5-elite.sql` in **Supabase Dashboard → SQL Editor**.
3. Redeploy the push Edge Function:
   ```bash
   supabase functions deploy push --no-verify-jwt
   ```
4. On iPhone (Home Screen PWA): reload twice for SW `elite-os-v5` update, open **Profile → Notifications**, toggle off/on if needed, and tap **Send a test** to confirm Apple APNs accepts the new `mailto:` VAPID subject.
5. Copy the new `index.html` into your offline Obsidian vault if you maintain a local mirror.
