---
tags:
  - fitness
---

[Open full screen](https://showacquisitions.github.io/elite-peaking-os/)

<iframe src="https://showacquisitions.github.io/elite-peaking-os/" width="100%" height="1400" style="border:0;border-radius:8px"></iframe>

> Hosted app, works in Obsidian on desktop and phone. Backup copy: `elite-peaking-os.html` in this folder (same as `index.html` in the `showacquisitions/elite-peaking-os` repo).

## Tabs

Today · Train · Fuel & Recipes · Quality · Biometrics · Profile (top right)

- **Today:** four rings (readiness, fuel, train, move), the next best action, the workout, meals, habits, supplements and the food log.
- **Train:** auto plan or Build my own.
- **Fuel & Recipes:** Groceries, Recipes (scale 1–10×, cook, log), Targets.
- **Quality:** 0–100 food score for the day, planned meals, recipes and any scanned product, with swaps.
- **Biometrics:** weight, body fat, sleep, HRV, resting HR, steps, energy, calories and volume over 7/30/90 days, correlations, CSV export, Health sync.

## Behaviour worth knowing

- **Guided / Elite Pro** switch is the button next to Profile. Same data, different density.
- **Health sync** status is the pill in the header. Missing values never break a sync and never overwrite saved ones. A number typed by hand always beats Health.
- iPhone automations that read Health must run while the phone is unlocked: use the trigger App: Is Opened, not Time of Day.
- Readiness marked "estimate" is carried from the last measured day and does not change your sets.

## Deploying a new build

1. Bump `APP_VER` in the app (`const APP_VER`, format `YYYY.MM.DD.N`).
2. If `supabase/functions/health/parse.mjs` changed, run `node tools/inline-hx.cjs`.
3. Set `version.json` to the same value.
4. Push to `main`. GitHub Actions runs `tests/smoke.cjs`.
