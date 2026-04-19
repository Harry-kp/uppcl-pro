---
name: setup
description: Bootstrap UPPCL Pro on a fresh clone — Python venv + dashboard dependencies + Playwright browsers. Use when the user asks "how do I set this up", "install dependencies", "get started", or right after cloning when no venv/node_modules exist yet.
---

# UPPCL Pro — local setup

Goal: take the user from a fresh clone to a runnable stack in one go.

## Preflight — run before doing anything else

Check each of these in **parallel** (single message, multiple Bash calls):

1. `python3 --version` — need 3.10+
2. `bun --version` — preferred. Fall back to `node --version` (need 20+) if Bun is missing.
3. `test -d venv && echo exists || echo missing`
4. `test -d web/node_modules && echo exists || echo missing`
5. `test -f .env && echo exists || echo missing`
6. `test -f scripts/pii.json && echo exists || echo missing`

Report the state of each so the user can see what's already done vs. what needs doing. Do NOT just barrel through `make setup` blindly — that re-runs installs even when they're fine.

## Install path

If **venv is missing or node_modules is missing**: run `make setup`. It handles both.

If both exist: tell the user the stack is already installed and jump to the next skill (`/first-login`).

While `make setup` runs, explain in one line: *"Creating Python venv + installing FastAPI/httpx/cryptography; installing dashboard deps via Bun or npm."*

## Optional extras

Only offer these if the user asks or clearly needs them:

- **Playwright** (for regenerating screenshots): `./venv/bin/pip install playwright && ./venv/bin/playwright install chromium`. Skip unless the user mentions screenshots.
- **PII redaction config** (for running `make screenshots` or `make check-pii`): point the user to `scripts/pii.sample.json` and explain they copy it to `scripts/pii.json` and fill in their own values. The file is gitignored.
- **`.env` overrides**: `cp .env.sample .env` — only needed if Jio rotates the API key or tenant UUID. Default constants work for almost everyone.

## After install

End the turn by telling the user exactly one next step:

> *"Setup complete. Run `/first-login` to authenticate with UPPCL, or `make dev` to start the stack right now."*

Do not start servers automatically — the user may want to configure `.env` first.

## Common install failures

- `cryptography` wheel build fails on Apple Silicon older than macOS 12: suggest upgrading OS or `brew install rust`.
- `bun install` fails behind a corporate proxy: fall back to `cd web && npm install`.
- Playwright chromium download blocked by firewall: document `PLAYWRIGHT_DOWNLOAD_HOST` env override.

Surface the root cause — don't retry silently.
