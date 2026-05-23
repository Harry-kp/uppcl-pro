---
name: setup
description: Install deps and start the dev server. Use when user says "set up", "install", "get started", or after a fresh clone.
---

# Setup

## Check

Run in parallel:
1. `bun --version || node --version`
2. `test -d node_modules && echo ok || echo missing`

## Install

```bash
bun install   # or: npm install
```

## Start

```bash
bun run dev   # http://localhost:3000
```

## Done

> "Setup complete. Open http://localhost:3000 and sign in with your UPPCL credentials."
