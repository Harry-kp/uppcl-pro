---
name: first-login
description: Walk a freshly-set-up user through their first UPPCL login and verify the proxy + dashboard stack is actually working. Use after `/setup` finishes, or when the user says "log in", "I just cloned this, now what", or mentions a 401 / expired-session error.
---

# UPPCL Pro — first login

Goal: confirm the proxy talks to UPPCL, the dashboard talks to the proxy, and the user sees real data.

## Prereqs — verify once, in parallel

- `test -d venv` — Python deps installed? If no, route to `/setup`.
- `test -d web/node_modules` — dashboard deps installed? If no, route to `/setup`.
- `curl -fs http://127.0.0.1:8000/health` — proxy already running?
- `curl -fs http://127.0.0.1:3000` — dashboard already running?

## Start the stack (if not already up)

If neither server responds, start them in one shell and background the output:

```bash
make dev > /tmp/uppcl-dev.log 2>&1 &
```

Then poll `/health` until it returns 200. Don't sleep — use `until curl -fs http://127.0.0.1:8000/health >/dev/null 2>&1; do sleep 1; done`.

If port 8000 or 3000 is already bound, don't kill the existing process blindly. Run `lsof -ti:8000` to see what's on it and ask the user before stopping it.

## Collect credentials

Ask the user for their UPPCL username + password **via chat**, not in a script. The username is the phone number or connection number they use in the UPPCL SMART app. Never persist these — the JWT is what gets cached.

Call the login endpoint:

```bash
curl -s -X POST http://127.0.0.1:8000/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"...","password":"..."}' | jq
```

Expected good response:

```json
{ "ok": true, "expires_at_ms": 17440..., "tenant": "pvvnl" }
```

Handle specific errors:

- `401 "Invalid credentials"` — wrong username or password; ask the user to retry.
- `502 network error` — proxy can't reach UPPCL. Check `ping uppcl.sem.jio.com`.
- `500 login failed, all OAEP variants rejected` — Jio rotated their public key. Restart the proxy (the 24h cache will refresh) and retry.
- `400 "API KEY not found"` / `"Invalid TenantId"` — UPPCL-wide constants have rotated. Point the user to `.env.sample` to override `UPPCL_API_KEY` / `UPPCL_TENANT`.

## Smoke-test the stack

After login succeeds, fire these in parallel to prove the pipeline works end-to-end:

1. `curl -s http://127.0.0.1:8000/dashboard | jq '.balance.inr, .runway.days'` — should print two numbers.
2. `curl -s http://127.0.0.1:8000/sites | jq '.data[0] | {connectionId, deviceId, tenantId}'` — should show the discovered IDs.
3. Tell the user to open http://127.0.0.1:3000 in a browser. The home dashboard should render populated data within 2-3 seconds.

## Done

End with a one-line summary of what's running and what they can do next:

> *"Proxy on :8000, dashboard on :3000. JWT cached for ~60 days in `uppcl_session.json`. Browse http://127.0.0.1:3000 or poke the API at http://127.0.0.1:8000/docs."*

Point out `/docs` — that's the Swagger UI, which is the fastest way for them to explore the API surface.
