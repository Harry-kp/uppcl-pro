---
name: first-login
description: Help user log in for the first time. Use when user says "log in", "authenticate", or gets 401 errors.
---

# First login

## Prereqs

1. `test -d node_modules` — if missing, run `/setup` first.
2. `curl -fs http://127.0.0.1:3000` — if no response, start with `bun run dev`.

## Login

Login happens in the browser UI at http://localhost:3000.

Tell the user:
> Open http://localhost:3000. Enter your UPPCL credentials (same phone/connection number + password as the official UPPCL SMART app).

The app solves an ALTCHA captcha automatically and sends plaintext credentials over HTTPS through the API route to UPPCL. JWT is stored in `sessionStorage`.

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| Invalid username or password | Wrong credentials | Re-enter |
| Network error | UPPCL down or no internet | Check `curl -I https://uppcl.sem.jio.com` |
| Session expired | JWT expired | Sign out and back in |

## Verify

Ask user to confirm: home dashboard shows balance + charts. Navigate to `/analytics` to double-check.

> "Signed in. JWT in sessionStorage (~60 days). Browse http://localhost:3000."
