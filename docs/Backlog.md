# Elite OS — Backlog

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
- [ ] Split `index.html` into modules with a build step once it passes ~5,000 lines.

## Known limits
- Health ingest parses numbers by stripping non-digits; a locale that writes decimals with a comma (72,5) is read wrong. US/Canada iPhones send dots.
- A coach can't see progress photos (device-only by design).
- Assignments older than 21 days aren't pulled to the client (history still shows what was logged).
