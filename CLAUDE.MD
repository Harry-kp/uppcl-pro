# UPPCL Pro — AI assistant context

Next.js app (TypeScript) that reverse-engineers UPPCL's prepaid-meter API.
UPPCL dropped encryption — all endpoints accept plaintext JSON.
The Next.js API routes are stateless CORS-bypass pipes.

## Architecture

```
Browser (React + SWR)
  ├─ src/lib/crypto.ts      ALTCHA captcha solver + Appsavy AES-CBC helpers
  ├─ src/lib/session.ts     JWT in sessionStorage
  ├─ src/lib/api.ts         SWR hooks + data fetching
  └─ src/lib/i18n files     next-intl (en + hi)
        │
        ▼
Next.js API routes (stateless CORS proxy)
  ├─ src/app/api/uppcl/[...path]/route.ts    forwards requests to UPPCL
  └─ src/app/api/complaints/route.ts         Appsavy complaints proxy
        │
        ▼
UPPCL backend (uppcl.sem.jio.com) + Appsavy (appsavy.com)
```

Credentials pass through the server as plaintext JSON over HTTPS.
The server never stores, logs, or persists anything. No database.

## Key files

| Path | Purpose |
|------|---------|
| `src/lib/crypto.ts` | ALTCHA proof-of-work solver + Appsavy AES-128-CBC header encryption |
| `src/lib/session.ts` | JWT in `sessionStorage`; expiry check; site cache |
| `src/lib/api.ts` | SWR hooks, login flow, balance fallback chain, dashboard composite |
| `src/app/api/uppcl/[...path]/route.ts` | CORS proxy — forwards plaintext JSON to UPPCL |
| `src/app/api/complaints/route.ts` | Appsavy complaint proxy (anonymous sessions, cookie bootstrapping) |
| `src/components/I18nProvider.tsx` | next-intl client-side locale switching (en/hi) |
| `messages/en.json`, `messages/hi.json` | Translation strings |

## How to run

```bash
bun install && bun run dev    # http://localhost:3000
```

Login via the web UI. JWT stored in `sessionStorage`.

## Upstream field-name quirks

- `/payment/v2/search` wants `consumer_id` (snake_case). The 409 error
  says "connectionID missing" — that's a lie.
- `/bill/search` wants `from`/`to` + `tenantId` + `connectionId`.
- `/eventsummary/aggregate` wants ISO-8601 dates with IST offset
  (`2026-04-19T00:00:00+05:30`). Any other format → "[object Object]".
- `/eventsummary/search` only works with `groupBy: "year"`.
- `/site/prepaidBalance` returns empty `{code:200}` for some accounts.
  The balance logic falls back to latest bill's `closing_bal`.

## UPPCL login flow

1. Fetch ALTCHA challenge from `/altcha/createAltCaptcha`
2. Solve SHA-256 proof-of-work (~10ms)
3. Send plaintext `{username, password, roleType: "user"}` with captchatoken header
4. Receive 60-day JWT + tenantCode

No encryption needed. UPPCL dropped RSA-OAEP + AES-GCM — login and all
data endpoints accept plaintext JSON now.

## Appsavy (1912 complaints) flow

1. Bootstrap anonymous session via `/coreapps/UI/Anonymous` (manual redirect following to collect cookies)
2. AES-128-CBC encrypted headers with constant key `"8080808080808080"`
3. SOAP-style XML request to `GetRelationalDataA`
4. Web Crypto adds PKCS7 padding automatically — do NOT pad manually (caused double-padding bug)

## Route inventory

Working:
- `/auth/v2/login`, `/auth/logout`, `/auth/session-check`
- `/site/search`, `/site/outstandingBalance`, `/site/prepaidBalance`
- `/user/search`, `/userpreference/search`
- `/bill/search`, `/bill/billHistory`
- `/payment/v2/search`
- `/eventsummary/aggregate`, `/eventsummary/search`
- `/connectionbudget/search`, `/dadata/v2/search`

Known-broken:
- `/eventsummary/consumptionAggregation` → "[object Object]"
- `/announcements/landing/search` → "Payload is required"
- `/bill/billDetails` → needs `bpno` not in any response
- `/insight/getDocument*` → needs `subTenantCode`

## Public constants (not secrets)

- API key: `5ab6ef2e-5051-4923-aa65-dc82883af26b` (baked into UPPCL's SPA)
- Default tenant: `b3ba0ab0-05bc-11f0-bf77-932b3a8bb3cd`
- Appsavy AES key/IV: `"8080808080808080"` (constant in their SPA)

## i18n

Uses `next-intl` with client-side locale switching. Messages in `messages/en.json`
and `messages/hi.json`. Provider in `src/components/I18nProvider.tsx`. Currently
only the login page is translated. Add new keys to both JSON files.

## Design origin

The "Kinetic Vault" look was seeded from Stitch by Google AI — MD3
tonal-surface palette + motion vocabulary.
