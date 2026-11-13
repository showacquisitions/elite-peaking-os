# Elite OS — Backlog

## Blocking v4 (owner)
- [x] `supabase/v4-health.sql` applied 2026-11-13 (migration `v4_health_fault_tolerant_ingest`). Verified in a rolled-back test: a second sync with zeros and blanks kept the stored steps and HRV.
- [x] `health` edge function deployed 2026-11-13 (version 6, verify_jwt off). Verified live through pg_net: an all-blank body returns ok with `ignored`; a real body reaches `health_ingest`.
- [x] Merged to `main` through showacquisitions/elite-peaking-os#1.
- [ ] On the iPhone: change the automation trigger from Time of Day to App: Is Opened, set JSON field types to Text, tap Send a test, then Sync now.
- [ ] Replace `elite-peaking-os.html` and the note in the Obsidian vault (`docs/obsidian-note.md` is the updated note).

## Blocking v3 (owner, Supabase + Brevo dashboards, about 10 min)
- [ ] **Auth → URL Configuration:** Site URL `https://showacquisitions.github.io/elite-peaking-os/`; add the same URL under Redirect URLs. Without this the reset email links to localhost (the likely cause of the earlier rollback).
- [ ] **Brevo → SMTP & API → SMTP keys:** generate a key.
- [ ] **Supabase Auth → Emails → SMTP Settings:** enable custom SMTP. Host `smtp-relay.brevo.com`, port `587`, username = the Brevo SMTP login shown on that page, password = the key, sender `showacquisitions@gmail.com`, name `Elite Peaking`.
- [ ] **Auth → Rate limits:** raise the emails-per-hour limit once custom SMTP is on.
- [ ] Optional: Auth → Providers → Email → leaked password protection.
- [ ] Merge `claude/bold-bell-1sakoo` to `main` to deploy.

## Next (v3.1)
- [ ] Verify the health edge function live with "Send a test", then one Health Auto Export run.
- [ ] Live step counting while the app is open (DeviceMotion) — low value; the Health sync covers it.
- [x] Web push for messages, assignments, check-ins, rest timer and workout reminders (v3.1).
- [x] Coach sets client calories and macros (v3.1).
- [ ] Owner: turn on notifications on your phone (Profile → Notifications) and tap Send a test.
- [x] Unread tracking for messages (v3.2).
- [ ] Coach: copy one client's week to another client.
- [x] Coach: client progress photos, opt-in (v3.2).
- [ ] Group superset drag: drag a whole group as one unit in the builder.
- [x] Supersets in the auto plan (v3.2), coach program progression (v3.2), demo video links (v3.2).

## Later (v4)
- [ ] Native wrapper (Capacitor) for one-tap Apple Health / Health Connect (the only way to auto-sync Android Health).
- [ ] Payments for coaches (Stripe) if the coaching side gets paying clients.
- [ ] Split `index.html` into modules with a build step. It is now ~5,100 lines: due. The HX normalizer copy and `tools/inline-hx.cjs` disappear once there is a build.
- [ ] Barcode scanning on iPhone: Safari has no BarcodeDetector, so Scan is hidden there. Add a JS decoder (ZXing) or the native wrapper.
- [ ] Verify the Shortcut steps on a real iPhone and record the exact action names per iOS version.

## Known limits
- Fixed in v4 once the edge function is deployed: decimal commas, unit suffixes and sample lists are parsed.
- Link sync (`#sync&…`) on iPhone lands in Safari, whose storage is separate from the Home Screen app. Signed-in users get it forwarded to the cloud; others should use background sync.
- `S.nut` (per-day intake) only exists from v4 on; older days show no calories in trends.
- A coach can't see progress photos (device-only by design).
- Assignments older than 21 days aren't pulled to the client (history still shows what was logged).
