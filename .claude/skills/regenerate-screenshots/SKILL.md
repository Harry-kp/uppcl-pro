---
name: regenerate-screenshots
description: Capture fresh screenshots for the README gallery. Use when user says "screenshots", "update gallery", or screenshots look stale.
---

# Screenshots

7 routes x 2 themes = 14 PNGs in `docs/screenshots/`.

## Prereqs

1. Dev server running on :3000
2. `scripts/pii.json` exists (copy from `scripts/pii.sample.json` if missing)
3. Playwright installed: `npx playwright install chromium`

## Capture

No automated script yet. Use Playwright manually:

1. Launch Chromium via `npx playwright`
2. Navigate to each route: `/`, `/analytics`, `/ledger`, `/recharges`, `/grid-nodes`, `/complaints`, `/settings`
3. Capture dark + light for each
4. Apply PII redactions from `scripts/redactions.js`
5. Save to `docs/screenshots/<route>-<theme>.png`

## Verify

Check that PII is redacted: phone numbers, addresses, connection IDs should be dummy values. Bill amounts and dates should be real (not PII).

> "14 screenshots in docs/screenshots/. Run `git add docs/screenshots/` to stage."
