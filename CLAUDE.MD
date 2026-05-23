# UPPCL Pro — AI assistant context

Pure Next.js app (TypeScript) that reverse-engineers UPPCL's encrypted
prepaid-meter API. All encryption happens in the browser; the Next.js API
routes are thin CORS-bypass pipes. **No Python anywhere in the stack.**

## Architecture

```
Browser (React + SWR)
  ├─ web/src/lib/crypto.ts    — ALTCHA captcha + RSA-OAEP + AES-GCM encrypt/decrypt
  ├─ web/src/lib/session.ts   — JWT stored in sessionStorage (60-day expiry)
  └─ web/src/lib/api.ts       — SWR-based data fetching client
        │
        ▼
Next.js API routes (server-side, TypeScript)
  ├─ web/src/app/api/uppcl/[...path]/route.ts   — CORS proxy to UPPCL backend
  └─ web/src/app/api/complaints/route.ts         — Appsavy complaints proxy
        │
        ▼
UPPCL backend (uppcl.sem.jio.com)
```

Everything is TypeScript. The browser does the crypto; the API routes just
forward requests to avoid CORS blocks.

## Key files

| Path | Purpose |
|------|---------|
| `web/src/lib/crypto.ts` | ALTCHA challenge solver, RSA-OAEP encryption (with SHA-256→SHA-1 fallback), AES-GCM envelope |
| `web/src/lib/session.ts` | Read/write JWT in `sessionStorage`; expiry check |
| `web/src/lib/api.ts` | SWR hooks + raw fetch helpers for all UPPCL endpoints |
| `web/src/app/api/uppcl/[...path]/route.ts` | Catch-all CORS proxy — pipes encrypted bodies to UPPCL, returns encrypted responses |
| `web/src/app/api/complaints/route.ts` | Appsavy complaint-tracking proxy |

## Upstream field-name quirks worth remembering

- `/payment/v2/search` wants `consumer_id` (snake_case). The server's 409
  error says "Mandatory field missing : connectionID" which is a lie —
  connectionId/connectionID in any case never satisfies it.
- `/bill/search` wants `from`/`to` (not `fromDate`/`toDate`) + `tenantId`
  + `connectionId`.
- `/eventsummary/aggregate` wants `deviceId` + `tenantId` and ISO-8601
  dates with the explicit IST offset (`2026-04-19T00:00:00+05:30`).
  Any other date format returns the useless "[object Object]" message.
- `/eventsummary/search` with `groupBy: "year"` + `year` returns monthly
  rollups including `powerFactor`. day/month group-bys error opaquely.
- `/site/prepaidBalance` returns `{"code":200}` with no `data` for some
  accounts regardless of body shape — a backend quirk. The balance logic
  falls back to the latest bill's closing_bal.

## RSA-OAEP hash fallback

UPPCL's public key is fetched from
`/uppclsmart/assets/cert/prod/server_public.pem` (24h cache). The crypto
layer tries SHA-256 OAEP first; if the server rejects it (rare key
rotation window), it falls back to SHA-1 OAEP. If both fail, the public
key cache needs clearing — restart the dev server.

## Route inventory (discovered from grepping main.js bundle)

Working end-to-end:
- `/auth/v2/login`, `/auth/logout`, `/auth/session-check`
- `/site/search`, `/site/outstandingBalance`, `/site/prepaidBalance` (often empty)
- `/user/search`, `/userpreference/search`
- `/bill/search`, `/bill/billHistory`
- `/payment/v2/search`
- `/eventsummary/aggregate`, `/eventsummary/search` (groupBy:year only)
- `/connectionbudget/search`, `/dadata/v2/search`

### Known-broken endpoints

- `/eventsummary/consumptionAggregation` — always "[object Object]"
- `/announcements/landing/search` — always "Payload is required"
- `/bill/billDetails` — needs a `bpno` not in any other response
- `/insight/getDocumentCount`, `.../getDocumentDetails`
  — needs a `subTenantCode` field; server won't accept it from any
  case/spelling we tried
- `/site/solarTrend` — needs a `vendor` field (not relevant w/o solar)
- `/tenantMasterData/search` — needs "Invited from/to flag" (account sharing)

### Date format quirks

- `/eventsummary/aggregate` and `/eventsummary/search` require ISO-8601
  with explicit IST offset: `2026-04-19T00:00:00+05:30`. Omitting the
  offset or using `Z` returns `[object Object]`.
- `/bill/search` uses `from`/`to` as plain date strings (`YYYY-MM-DD`).
- `/payment/v2/search` accepts no date filter — it returns everything.

### Unprobed routes (visible in SPA bundle)

- `/auth/in-app-login`, `/auth/partner-user-login`
- `/bill/download`, `/payment/v2/download`, `/site/daily-charges/download`,
  `/site/monthly-charges/download` (file downloads)
- `/payment/initiate-payment`, `/payment/make-payment`, `/payment/pay-later`,
  `/payment/UPI`, `/payment/card`, `/payment/quick-pay`, `/payment/v2/create`
  (real-money flows — do not probe casually)
- `/site/changeEmail`, `/site/changePhone`, `/site/unlinkSite`, `/site/delete/`,
  `/site/update/`, `/site/v2/sitePreferences/`
- `/user/v2/register*`, `/user/v2/forgot*`, `/user/v2/update*`, `/user/changePassword`
- `/tenantMasterData/send-invite`, `/tenantMasterData/accept-invitation`,
  `/tenantMasterData/revoke-access` (account sharing)

## How to run

```bash
cd web && bun install
cd web && bun run dev    # http://localhost:3000
```

Login happens in the browser UI — enter UPPCL credentials in the LoginGate
component. JWT is stored in `sessionStorage`.

## Pi deployment gotchas (learned the hard way)

Full write-up in `docs/PI_DEPLOY.md`.

- **Port**: Caddy binds `:1912` (UPPCL's helpline number). Avoid `:80` —
  Pi-hole's `pihole-FTL` (v6+) owns it. `:8080` is also a bad default.
- **Caddyfile `handle { }` is mandatory**: bare `try_files` at the top
  level of a site block runs *before* `handle_path /api/*` on Caddy
  v2.6.x. Without the `handle { }` wrapper around the static handlers,
  every `/api/...` request gets rewritten to `/index.html`.
- **Home-dir perms**: Raspberry Pi OS defaults home dirs to `700`. The
  `caddy` user can't traverse into the web output dir unless you
  `chmod o+x ~` + `chmod -R o+rX uppcl-pro`.
- **Pi-hole v6 != v5 for local DNS**: v6 stores records in
  `pihole.toml::dns.hosts`. `custom.list` is silently ignored.
- **Avoid `.local` for friendly hostnames**: mDNS-reserved (RFC 6762);
  macOS/iOS intercept before Pi-hole gets the DNS query. Use `.lan` /
  `.home.arpa` / `.box`.
- **macOS NXDOMAIN cache**: `sudo dscacheutil -flushcache` +
  `sudo killall -HUP mDNSResponder` after adding DNS records.
- **`crypto.randomUUID` on plain HTTP**: Web Crypto APIs are gated to
  secure contexts. Toast IDs use a `useRef` counter; if a new dependency
  calls `randomUUID`, polyfill it or front the stack with HTTPS.

## Design origin

The "Kinetic Vault" look was seeded from
[Stitch by Google AI](https://stitch.withgoogle.com/) — 8 generated pages
defining the MD3 tonal-surface palette + motion vocabulary. The original
HTML + screenshots are not checked in; reference them via the Stitch share
link if the palette ever needs a re-audit.
