# CLAUDE.md

Next.js 16 app (App Router, TypeScript) on UPPCL's reverse-engineered prepaid/postpaid
meter API. Browser does all logic; API routes are stateless CORS pipes — never store,
log, or persist credentials. No database.

## Commands (bun only — no npm lockfile)
- Install: `bun install`
- Run locally: `bun run dev` → http://localhost:3000 (log in via the UI; JWT in sessionStorage)
- Lint + typecheck + build (what CI runs): `make check`
- Lint one file: `bunx eslint path/to/file.tsx`
- Typecheck: `bunx tsc --noEmit`
- Tests: none exist. Verify with `make check`, then exercise the page in `bun run dev`.

## Structure
- `src/lib/api.ts` — every upstream call, SWR hook and response type. New endpoints go here, through `proxy()`.
- `src/lib/proxy.ts` — server-side UPPCL proxy; `src/app/api/{uppcl,bootstrap}` just mount it.
- `src/app/api/complaints` (Appsavy 1912 portal) and `src/app/api/wss` (bill-PDF portal) are separate upstreams.
- `src/lib/utils.ts` (format/date), `stats.ts` (numbers), `crypto.ts` (ALTCHA + wss AES).
- `src/components/viz` charts, `components/ui` primitives, `components/bills` pre/postpaid views.

## Conventions
- Before writing a helper, grep for one. `rupees`, `kwh`, `formatRelative`, `toNum`, `mean` already exist.
- Files under ~30 lines that belong to one module go in that module.
- Colours come from CSS tokens (`chart` in `src/lib/chartColors.ts`), never hex literals — themes switch.
- i18n: `next-intl`, client-side (`src/components/I18nProvider.tsx`). Add every key to both
  `messages/en.json` and `messages/hi.json`. Only the login page is translated so far.
- Retired routes are `redirects()` in `next.config.ts`, not stub pages.

## Gotchas
- This Next.js has breaking changes vs. training data. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- `route.ts` may only export HTTP handlers/config — shared server code goes in `src/lib/`.
- After deleting a route, `tsc` fails on stale `.next/types`; run `bun run build` (or `make clean`) first.
- `bun run build` fetches Google Fonts (`next/font/google`) — needs network; flaky offline.
- Public constants (API key, default tenant, Appsavy key/IV) are not secrets; they live in
  `src/lib/api.ts` and `src/app/api/complaints/route.ts`. Don't copy them into new files —
  the gitleaks commit hook flags them as new secrets.
- Appsavy AES: Web Crypto adds PKCS7 padding itself — never pad manually (double-padding bug).
- Turbopack drops the space in `</span> text` when that text wraps to the next line — write `</span>{" "}text`.
- Empty states must check SWR `isLoading` first: some UPPCL calls take ~10 s, and "No data yet" meanwhile reads as data loss.

## Upstream quirks (UPPCL)
- `/payment/v2/search` wants `consumer_id`; its 409 "connectionID missing" is a lie.
- `/bill/search` wants `from`/`to` + `tenantId` + `connectionId`.
- `/eventsummary/aggregate` needs ISO-8601 with IST offset (`2026-04-19T00:00:00+05:30`);
  anything else → "[object Object]". `/eventsummary/search` only works with `groupBy: "year"`.
- `/site/prepaidBalance` returns empty `{code:200}` for some accounts → fall back to latest bill `closing_bal`.
- Known-broken: `/eventsummary/consumptionAggregation`, `/announcements/landing/search`,
  `/bill/billDetails` (needs `bpno`), `/insight/getDocument*` (needs `subTenantCode`).
- Full endpoint notes: `docs/api-reverse-engineering.md`.

## Working on an issue
1. Reproduce in `bun run dev` (no test suite — note the repro steps in the PR).
2. Fix with minimal churn; reuse existing helpers in `src/lib/`.
3. `make check` must pass.
4. Branch `fix/<short-desc>` or `feat/<short-desc>`; conventional commit message.
5. PR description: root cause, what changed, how you verified.
