<div align="center">

# UPPCL Pro -- *Kinetic Vault*

### *Your prepaid meter, finally making sense.*

Open-source analytics dashboard for **UPPCL SMART** prepaid electricity meters.
Your credentials are never stored or logged -- the entire codebase is open for you to verify.

<p>
  <a href="#features"><img alt="Scope" src="https://img.shields.io/badge/scope-UPPCL_SMART_(prepaid)-0a7cff?style=for-the-badge&labelColor=0b0b0b"></a>
  <a href="#security--privacy"><img alt="Open-source · no storage" src="https://img.shields.io/badge/open--source-no_storage-00c07a?style=for-the-badge&labelColor=0b0b0b"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-d1d1d1?style=for-the-badge&labelColor=0b0b0b"></a>
</p>

[Features](#features) &middot; [Security & privacy](#security--privacy) &middot; [Quickstart](#quickstart) &middot; [Architecture](#architecture) &middot; [DISCOM support](#discom-compatibility)

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="docs/screenshots/home-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/home-light.png">
  <img alt="UPPCL Pro dashboard -- home view" src="docs/screenshots/home-dark.png" width="880">
</picture>

</div>

---

## Security & privacy

> **Your credentials are never stored or logged.** They pass through our server over HTTPS to reach UPPCL's API. Here is exactly what happens:

| What happens | Where | What the server sees |
|---|---|---|
| You type your UPPCL credentials | Your browser | Nothing |
| Credentials are sent to the UPPCL API | Through our server over HTTPS | Plaintext JSON in memory during the request -- **never stored, never logged** |
| UPPCL returns a 60-day JWT | Through our server over HTTPS | JWT in memory during the request -- **never stored, never logged** |
| JWT is saved for your session | Your browser (`sessionStorage`) | Nothing -- never sent back to our server |

**The server is a stateless CORS proxy.** It forwards your request to UPPCL's API and returns the response. It has no database, no logging of user data, no analytics, no tracking. Credentials exist in server memory only for the duration of the HTTP request.

**Why should you trust this?**
- The entire codebase is open-source -- [read the route handler](src/app/api/uppcl/%5B...path%5D/route.ts) yourself
- Self-host with `bun run dev` for complete privacy -- your credentials never leave your machine
- No database, no persistent storage of any kind

---

## Features

| Page | What you get |
|------|-------------|
| **Home** | Live balance with auto-fallback chain, runway gauge (days until empty), anomaly detection (z-score > 1.5), recharge recommendation |
| **Usage** | 30-day rolling kWh, calendar heatmap, day-of-week pattern, baseline-vs-active chart, annual profile |
| **Bills & Cost** | Effective rate/unit trend, stacked charge composition (energy / fixed / duty / FPPA / subsidy), tariff slab donut, unified event timeline, CSV export |
| **Recharges** | Sweet-spot recommender (amount x frequency sliders), recharge lifespan analytics, transaction ledger |
| **Meter Health** | Reading reliability donut, 365-day data-gap calendar, peak-vs-sanctioned load gauge, power factor trend |
| **1912 Complaints** | Full complaint history from UPPCL 1912 portal, JE/AE/XEN officer chain with phone numbers, report outage panel |
| **Settings** | Session management, connection details, dark/light/system theme |

---

## Quickstart

### Option 1: Use the hosted version (recommended)

Visit **[uppcl-pro.vercel.app](https://uppcl-pro.vercel.app)** and sign in with your UPPCL SMART credentials.

Your credentials are sent over HTTPS and are never stored or logged. For full privacy, self-host instead.

### Option 2: Self-host

```bash
git clone https://github.com/Harry-kp/uppcl-pro.git
cd uppcl-pro
bun install        # or: npm install
bun run dev        # opens on http://localhost:3000
```

Sign in via the web UI with the same credentials you use on the [UPPCL SMART app](https://uppcl.sem.jio.com/uppclsmart/).

### Production (self-hosted)

```bash
bun run build
bun run start      # serves on http://localhost:3000
```

That's it. No Python. No Docker. No reverse proxy. Just Next.js.

### Requirements

- **Node 20+** or **Bun 1.1+**

---

## Architecture

```
Browser (your machine)                    Server (Vercel / self-hosted)
========================                  =============================

1. You enter credentials                 
2. Credentials sent over HTTPS ------>   /api/uppcl/* (stateless CORS proxy)
                                              |
                                              | forwards to UPPCL API
                                              v
                                         uppcl.sem.jio.com
                                              |
3. Response returned <----------------   returns upstream response
4. JWT stored in sessionStorage          (server stores nothing)
```

### Key files

```
src/
  lib/
    crypto.ts          ALTCHA proof-of-work + Appsavy AES helpers (Web Crypto API)
    session.ts         JWT in sessionStorage (never on server)
    api.ts             SWR hooks + request builder
  app/
    api/
      uppcl/[...path]/route.ts   Stateless CORS proxy to UPPCL API (~90 lines)
      complaints/route.ts        Appsavy proxy (anonymous sessions, no user creds)
    page.tsx           Home dashboard
    analytics/         Usage analytics
    ledger/            Bills & cost
    recharges/         Recharges & runway
    grid-nodes/        Meter health
    complaints/        1912 complaints
    settings/          Preferences
```

### What the server handles

| Route | What it does | User data involved |
|-------|-------------|-------------------|
| `/api/uppcl/*` | CORS proxy -- forwards requests to UPPCL API | Credentials + JWT pass through in memory (never stored or logged) |
| `/api/complaints` | Queries appsavy.com for complaint data | Phone number only (public 1912 portal, no login) |

---

## DISCOM compatibility

Every user-specific identifier is discovered at runtime from `/site/search` -- nothing is hardcoded per DISCOM.

| DISCOM | Region | Status |
|--------|--------|--------|
| **PVVNL** | West UP (Noida, Agra, Ghaziabad...) | Tested end-to-end |
| MVVNL | Central UP | Same API, unverified |
| PuVVNL | East UP | Same API, unverified |
| DVVNL | South UP | Same API, unverified |
| KESCo | Kanpur | Same API, unverified |

On a non-PVVNL DISCOM? [File a verification issue](https://github.com/Harry-kp/uppcl-pro/issues) if it works.

---

## Reverse engineering notes

The upstream UPPCL SMART API (hosted by Jio at `uppcl.sem.jio.com`) uses:
- **ALTCHA proof-of-work** captcha on login
- All endpoints now accept plaintext JSON (encryption was previously required but dropped by UPPCL)
- **60-day JWTs** with tenant-scoped access
- Dynamic tenant UUID discovery from login response

ALTCHA proof-of-work and Appsavy AES are handled by `src/lib/crypto.ts` in the browser via the Web Crypto API. Credentials are sent as plaintext JSON over HTTPS through our CORS proxy.

The 1912 complaint portal (`appsavy.com`) uses anonymous sessions with AES-128-CBC encrypted headers (constant key `"8080808080808080"` -- yes, really).

See [`CLAUDE.MD`](CLAUDE.MD) for the full reverse-engineering knowledge base: endpoint inventory, field-name quirks, known-broken routes, and date format gotchas.

---

## Security

- **Credentials**: Sent as plaintext JSON over HTTPS through our server to UPPCL -- **never stored, never logged**
- **JWT**: Stored in `sessionStorage` (browser only), cleared when the tab closes
- **Server**: Stateless CORS proxy, no database, no logging of user data, no analytics
- **Self-hosted**: Run locally and your credentials never leave your machine
- **Complaints**: Anonymous sessions only -- no user credentials involved

See [`SECURITY.md`](SECURITY.md) for the full threat model.

To report a vulnerability, email the maintainer privately (do not open a public issue).

---

## Contributing

```bash
bun install && bun run dev
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines. PRs welcome -- especially for:
- New analytics visualizations
- Support for DISCOMs outside UPPCL (same Jio SMART stack)
- Performance improvements
- Better data export formats

---

## License

[MIT](LICENSE)

Not affiliated with UPPCL, any DISCOM, or Reliance Jio. All trademarks belong to their respective owners.
