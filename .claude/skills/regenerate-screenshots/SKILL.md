---
name: regenerate-screenshots
description: Regenerate the README screenshot gallery (7 routes × dark + light = 14 PNGs) with the user's own redaction config. Use when the user says "regenerate screenshots", "update the gallery", "my screenshots are stale", or mentions `docs/screenshots/` or `pii.json`.
---

# Regenerate the screenshot gallery

Goal: capture 14 fresh PNGs under `docs/screenshots/` with the user's own PII fully redacted — safe to commit and push.

## Preflight — parallel

Check:

1. `curl -fs http://127.0.0.1:8000/health` — proxy must be up.
2. `test -f scripts/pii.json` — redaction config present?
3. `./venv/bin/playwright --version 2>&1 | grep -q Version` — Playwright installed?
4. `lsof -ti:3000` — is something on :3000 already?

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

Do **not** run `make screenshots` until they confirm they've filled it in.

## If Playwright is missing

```bash
./venv/bin/pip install playwright
./venv/bin/playwright install chromium
```

Happens once per machine; ~170 MB download. Warn the user about the size before running.

## Capture

```bash
make screenshots
```

This target:

1. Static-builds the dashboard (`STATIC=1 bun run build`) into `web/out/`.
2. Serves it on :3000 via `python3 -m http.server`.
3. Runs `scripts/capture_screenshots.py` against :3000.
4. Stops the static server.

Takes about 90 seconds. Run in the background and poll for completion — don't sit and wait.

## Post-capture — verify NO PII leaked

Run the PII scanner:

```bash
./venv/bin/python scripts/check_pii.py
```

It scans every committable file (including the new PNGs — well, it skips PNGs because grep can't read pixels, but scans everything else for string leaks from `pii.json`).

Expected output: `✓ N files scanned against M patterns. No PII matched.`

If hits appear: the redaction script missed something. Look at the specific PII key it matched, add or tighten the corresponding rule in `scripts/redactions.js`, and re-run `make screenshots`. Don't commit until clean.

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
