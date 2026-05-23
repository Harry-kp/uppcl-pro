---
name: first-login
description: Walk a freshly-set-up user through their first UPPCL login and verify the Next.js app is working. Use after `/setup` finishes, or when the user says "log in", "I just cloned this, now what", or mentions a 401 / expired-session error.
---

# UPPCL Pro — first login

Goal: confirm the Next.js dev server starts, the user can log in via the browser UI, and real data loads.

## Prereqs — verify once, in parallel

- `test -d web/node_modules` — deps installed? If no, route to `/setup`.
- `curl -fs http://127.0.0.1:3000` — dev server already running?

## Start the dev server (if not already up)

If nothing responds on :3000:

```bash
bun run dev > /tmp/uppcl-dev.log 2>&1 &
```

Then poll until it responds:

```bash
until curl -fs http://127.0.0.1:3000 >/dev/null 2>&1; do sleep 1; done
```

If port 3000 is already bound, don't kill the existing process blindly. Run `lsof -ti:3000` to see what's on it and ask the user before stopping it.

## Login

Login happens entirely in the browser — no curl commands needed.

Tell the user:

> *"Open http://localhost:3000 in your browser. You'll see the LoginGate screen. Enter your UPPCL credentials (the phone number or connection number + password you use in the UPPCL SMART app)."*

The browser handles ALTCHA captcha solving, RSA-OAEP encryption, and sends the login request through the Next.js API route. On success, the JWT is stored in `sessionStorage`.

### Handle errors the user may report

- **"Invalid credentials"** — wrong username or password; ask them to retry.
- **Network error / timeout** — check if UPPCL is reachable: `curl -I https://uppcl.sem.jio.com`.
- **"All OAEP variants rejected"** — UPPCL rotated their public key. The 24h cache needs to expire; restarting the dev server forces a refresh.
- **"API KEY not found" / "Invalid TenantId"** — UPPCL-wide constants have rotated. These are hardcoded in the crypto/api layer and need updating in the source.

## Smoke test

After the user confirms they logged in:

1. Ask them if the home dashboard shows populated data (balance, consumption charts).
2. Ask them to navigate to a second page (e.g., `/analytics` or `/ledger`) and confirm data renders.

If data loads on at least two pages, the full pipeline is working: browser crypto, API route proxy, UPPCL backend, decryption, and SWR rendering.

## Done

End with a one-line summary:

> *"Dev server on :3000. JWT in sessionStorage (expires in ~60 days). Browse http://localhost:3000 to explore."*
