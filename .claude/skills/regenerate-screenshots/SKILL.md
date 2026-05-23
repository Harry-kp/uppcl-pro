---
name: regenerate-screenshots
description: Regenerate the README screenshot gallery (7 routes x dark + light = 14 PNGs) with the user's own redaction config. Use when the user says "regenerate screenshots", "update the gallery", "my screenshots are stale", or mentions `docs/screenshots/` or `pii.json`.
---

# Regenerate the screenshot gallery

Goal: capture 14 fresh PNGs under `docs/screenshots/` with the user's own PII fully redacted — safe to commit and push.

> **Note:** The old Python-based `scripts/capture_screenshots.py` has been removed. Screenshot capture needs to be done manually with Playwright for Node until a replacement script is written. The flow below describes how to do it.

## Preflight — parallel

Check:

1. `curl -fs http://127.0.0.1:3000` — dev server must be up (or start it: `cd web && bun run dev`).
2. `test -f scripts/pii.json` — redaction config present?
3. `npx playwright --version 2>&1` — Playwright for Node installed?

## If `scripts/pii.json` is missing

Don't capture without it — every screenshot will leak PII.

Tell the user:

> *"`scripts/pii.json` is missing. I'll copy the sample template so you can fill in your values."*

Then:

```bash
cp scripts/pii.sample.json scripts/pii.json
```

Ask the user to edit `scripts/pii.json`:

- Minimum fields: `connectionId`, `deviceId`, `phone`, `pincode`, `tenantCode`, `consumerName`.
- Optional fields (only matter if they appear in *your* dashboard): officer names, address fragments, invoice IDs, etc.
- Regex fields use JS source syntax — double-backslash every `\d`, `\s`.

Do **not** capture screenshots until they confirm they've filled it in.

## If Playwright is not installed

```bash
npm init -y  # if no package.json in root
npx playwright install chromium
```

Happens once per machine; ~170 MB download. Warn the user about the size before running.

## Capture flow (manual for now)

The screenshot capture script needs rewriting for the pure-Node stack. Until then, capture manually with Playwright:

1. Ensure the Next.js dev server is running on :3000 (`cd web && bun run dev`).
2. Use `npx playwright` to launch a Chromium instance against `http://localhost:3000`.
3. Navigate to each route (`/`, `/analytics`, `/ledger`, `/recharges`, `/grid-nodes`, `/complaints`, `/settings`).
4. For each route, capture both dark and light themes.
5. Apply redactions from `scripts/redactions.js` + `scripts/pii.json` before each capture.
6. Save to `docs/screenshots/<route>-<theme>.png`.

The 7 routes x 2 themes = 14 screenshots.

## Visual verification

Show the user one of the freshly captured images (Read tool on e.g. `docs/screenshots/home-dark.png`) and ask them to confirm it looks right. Spot-check for:

- Phone numbers: should be `9000000001` / `00919000000010`
- Address: should be *"42 Demo Street, Northville, 110001 Springfield IN"*
- Txn IDs: should be `CHD00000000001`
- Connection ID: should be `1234567890`
- Officer names: should be *"Sunil R."*, *"Rakesh V."*, etc.
- Bills, consumption, rates, dates: **unchanged** — these aren't PII.

## Done

End with:

> *"14 screenshots captured. PII scan clean. `git add docs/screenshots/` to stage them."*

Do **not** run `git add` or `git commit` — leave that to the user.
