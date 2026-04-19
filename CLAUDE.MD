# UPPCL SMART proxy

Local FastAPI proxy for UPPCL's encrypted prepaid meter API. Handles
ALTCHA captcha, RSA-OAEP + AES-GCM encryption, 60-day JWT auth. See
uppcl_api.py for the full client + proxy in one file.

## Current status (all reverse-engineered end-to-end)
- Password login: POST /auth/login with {username, password}
  → returns {ok, expires_at_ms, tenant}. Plaintext login body also
  needs `roleType: "user"`.
- Only user input ever needed: username + password at login time.
  The apikey + parent-tenant UUID are UPPCL-wide constants baked
  into the proxy; everything else (connectionId, deviceId, tenantId,
  tenantCode) is discovered from /sites on first use.
- JWT travels as the `token` HTTP header (and `Authorization: Bearer`
  for good measure). NOT in the outer envelope, NOT in the encrypted
  body. HAR exports sanitize auth headers — server rejects with
  400 "Token is required" if the JWT is anywhere other than the header.
- Public key fetched at runtime from
  /uppclsmart/assets/cert/prod/server_public.pem; 24 h cache.
- Per-user identifiers (connectionId, deviceId, tenantId, tenantCode)
  are all discovered from /site/search — nothing hardcoded.

## Upstream field-name quirks worth remembering
- /payment/v2/search wants `consumer_id` (snake_case). The server's 409
  error says "Mandatory field missing : connectionID" which is a lie —
  connectionId/connectionID in any case never satisfies it.
- /bill/search wants `from`/`to` (not `fromDate`/`toDate`) + `tenantId`
  + `connectionId`.
- /eventsummary/aggregate wants `deviceId` + `tenantId` and ISO-8601
  dates with the explicit IST offset (`2026-04-19T00:00:00+05:30`).
  Any other date format returns the useless "[object Object]" message.
- /eventsummary/search with `groupBy: "year"` + `year` returns monthly
  rollups including `powerFactor`. day/month group-bys error opaquely.
- /site/prepaidBalance returns `{"code":200}` with no `data` for some
  accounts regardless of body shape — a backend quirk. The /balance
  proxy route falls back to the latest bill's closing_bal.

## Route inventory (discovered from grepping main.js bundle)

Working end-to-end and exposed as proxy routes:
- /auth/v2/login, /auth/logout, /auth/session-check
- /site/search, /site/outstandingBalance, /site/prepaidBalance (often empty)
- /user/search, /userpreference/search
- /bill/search, /bill/billHistory
- /payment/v2/search
- /eventsummary/aggregate, /eventsummary/search (groupBy:year only)
- /connectionbudget/search, /dadata/v2/search

Known-broken for this account (kept accessible via /debug/raw):
- /eventsummary/consumptionAggregation  → always "[object Object]"
- /announcements/landing/search         → always "Payload is required"
- /bill/billDetails                     → needs a `bpno` not in any other response
- /insight/getDocumentCount, .../getDocumentDetails
                                        → needs a `subTenantCode` field — server won't
                                          accept it from any case/spelling we tried
- /site/solarTrend                      → needs a `vendor` field (not relevant w/o solar)
- /tenantMasterData/search              → needs "Invited from/to flag" (account sharing)

Other routes visible in the SPA bundle but not yet probed:
- /auth/in-app-login, /auth/partner-user-login
- /bill/download, /payment/v2/download, /site/daily-charges/download,
  /site/monthly-charges/download  (all likely file downloads)
- /payment/initiate-payment, /payment/make-payment, /payment/pay-later,
  /payment/UPI, /payment/card, /payment/quick-pay, /payment/v2/create
  (real-money flows — do not probe casually)
- /site/changeEmail, /site/changePhone, /site/unlinkSite, /site/delete/,
  /site/update/, /site/v2/sitePreferences/
- /user/v2/register*, /user/v2/forgot*, /user/v2/update*, /user/changePassword
- /tenantMasterData/send-invite, /tenantMasterData/accept-invitation,
  /tenantMasterData/revoke-access  (account sharing)

## Reverse-engineering escape hatch

`POST /debug/raw` with `{path, body}` sends an encrypted POST to any upstream
route — the proxy handles captcha exemption, JWT, tenantid header, encryption.
Server's 409 messages (`Mandatory field missing: X`) are usually enough to
guess the right body shape.

## How to debug
1. `uvicorn uppcl_api:app --reload`
2. `curl -X POST localhost:8000/auth/login ...`
3. Errors come back as {"detail": {"message": "[409] ...", "upstream": {...}}}
   — the upstream message usually names the missing field.
4. Python one-liner to probe:
   `venv/bin/python -c "from uppcl_api import UPPCLClient; c=UPPCLClient(); print(c._post('/path', {...}))"`
5. Or via curl against the proxy:
   `curl -s -X POST localhost:8000/debug/raw -H 'content-type: application/json' -d '{"path":"/x","body":{}}'`

## Files
- uppcl_api.py — client + FastAPI proxy
- docs/openapi.json — auto-generated OpenAPI schema (snapshot; live at /openapi.json)
- uppcl_session.json — cached JWT (created on first login)

## Pi deployment gotchas (learned the hard way)

Notes for the next round of Pi work — each of these cost time in the
first deploy, full write-up in `docs/PI_DEPLOY.md` troubleshooting:

- **Port**: Caddy binds `:1912` (UPPCL's helpline number). Avoid `:80` —
  Pi-hole's `pihole-FTL` (v6+) owns it, no lighttpd on modern installs.
  `:8080` is also a bad default (Portainer, Jellyfin, etc.).
- **Caddyfile `handle { }` is mandatory**: bare `try_files` at the top
  level of a site block runs *before* `handle_path /api/*` on Caddy
  v2.6.x (Debian Bookworm's default). Without the `handle { }` wrapper
  around the static handlers, every `/api/...` request gets rewritten
  to `/index.html` before reverse_proxy sees it → login "succeeds" with
  HTML body, session file never written, dashboard loops on login.
- **Home-dir perms**: Raspberry Pi OS defaults home dirs to `700`. The
  `caddy` user can't traverse into `/home/<you>/uppcl-pro/web/out/`
  unless you `chmod o+x ~` + `chmod -R o+rX uppcl-pro`. `pi-setup.sh`
  does this automatically; handwritten installs need it.
- **Pi-hole v6 ≠ v5 for local DNS**: v6 stores records in
  `pihole.toml::dns.hosts` (set via `pihole-FTL --config dns.hosts ...`).
  `custom.list` is silently ignored. v5 still uses `custom.list`.
- **Avoid `.local` for friendly hostnames**: it's mDNS-reserved (RFC 6762)
  and macOS/iOS intercept it *before* Pi-hole gets a DNS query. Use
  `.lan` / `.home.arpa` / `.box` instead.
- **macOS NXDOMAIN cache bites**: if the user tried the hostname before
  the DNS record existed, they need `sudo dscacheutil -flushcache` +
  `sudo killall -HUP mDNSResponder` (or toggle Wi-Fi). `dig` bypasses
  the cache, `curl`/browsers don't.
- **`crypto.randomUUID` on plain HTTP**: Web Crypto APIs are gated to
  secure contexts. Over `http://uppcl.lan:1912/` the whole `window.crypto`
  surface is restricted. Toast IDs use a `useRef` counter now; if a new
  dependency starts calling `randomUUID` the fix is either to polyfill
  or front the stack with HTTPS (Tailscale / domain + Caddy auto-HTTPS).

## Design origin
The Next.js dashboard's "Kinetic Vault" look was seeded from
[Stitch by Google AI](https://stitch.withgoogle.com/) — 8 generated
pages (home_dashboard, ampere_grid, cost_breakdown,
consumption_analytics, recharge_history_planning,
meter_health_integrity, unified_event_timeline, command_palette_k)
that defined the MD3 tonal-surface palette + motion vocabulary we
then iterated on. The original HTML + screenshots are *not* checked
in (deleted after the design was internalised in `web/src/`);
reference them via the Stitch share link if the palette ever needs
a re-audit.

## Live API docs
- Swagger UI: http://localhost:8000/docs
- ReDoc:      http://localhost:8000/redoc
- OpenAPI:    http://localhost:8000/openapi.json