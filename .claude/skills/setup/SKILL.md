---
name: setup
description: Bootstrap UPPCL Pro on a fresh clone — install Node/Bun dependencies for the Next.js app. Use when the user asks "how do I set this up", "install dependencies", "get started", or right after cloning when no node_modules exist yet.
---

# UPPCL Pro — local setup

Goal: take the user from a fresh clone to a runnable Next.js app in one go.

## Preflight — run before doing anything else

Check each of these in **parallel** (single message, multiple Bash calls):

1. `bun --version` — preferred. Fall back to `node --version` (need 20+) if Bun is missing.
2. `test -d web/node_modules && echo exists || echo missing`

Report the state of each so the user can see what's already done vs. what needs doing.

## Install path

If **node_modules is missing**:

```bash
bun install
```

If `bun` is not available, fall back to:

```bash
npm install
```

If node_modules already exist: tell the user the stack is already installed and jump to the next skill (`/first-login`).

## After install

End the turn by telling the user exactly one next step:

> *"Setup complete. Run `/first-login` to authenticate with UPPCL, or `bun run dev` to start the dev server right now."*

Do not start the server automatically — the user may want to review config first.

## Common install failures

- `bun install` fails behind a corporate proxy: fall back to `npm install`.
- Node version too old (< 20): suggest upgrading via `nvm install 20` or `brew install node@20`.

Surface the root cause — don't retry silently.
