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
- [ ] Web push for messages, assignments and workout reminders (needs a VAPID key pair + a send function; iOS needs the app on the home screen).
- [ ] Unread tracking for messages (currently "Message waiting" means the last message came from the client).
- [ ] Coach: copy one client's week to another client; program templates with progression per week.
- [ ] Coach: client progress photos (needs Supabase Storage with per-client RLS; photos are device-only today).
- [ ] Group superset drag: drag a whole group as one unit in the builder.

## Later (v4)
- [ ] Native wrapper (Capacitor) for one-tap Apple Health / Health Connect, background sync, and push without the Shortcut.
- [ ] Payments for coaches (Stripe) if the coaching side gets paying clients.
- [ ] Split `index.html` into modules with a build step once it passes ~5,000 lines.

## Known limits
- Health ingest parses numbers by stripping non-digits; a locale that writes decimals with a comma (72,5) is read wrong. US/Canada iPhones send dots.
- A coach can't see progress photos (device-only by design).
- Assignments older than 21 days aren't pulled to the client (history still shows what was logged).
