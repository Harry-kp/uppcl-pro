<div align="center">

# UPPCL Pro -- *Kinetic Vault*

### *Your prepaid meter, finally making sense.*

Zero-knowledge analytics dashboard for **UPPCL SMART** prepaid electricity meters.
Your credentials are encrypted in your browser -- our server never sees them.

<p>
  <a href="#features"><img alt="Scope" src="https://img.shields.io/badge/scope-UPPCL_SMART_(prepaid)-0a7cff?style=for-the-badge&labelColor=0b0b0b"></a>
  <a href="#zero-knowledge-security"><img alt="Zero-knowledge" src="https://img.shields.io/badge/zero--knowledge-your_creds_never_leave_your_browser-00c07a?style=for-the-badge&labelColor=0b0b0b"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-d1d1d1?style=for-the-badge&labelColor=0b0b0b"></a>
</p>

[Features](#features) &middot; [How it's secure](#zero-knowledge-security) &middot; [Quickstart](#quickstart) &middot; [Architecture](#architecture) &middot; [DISCOM support](#discom-compatibility)

<picture>
  <source media="(prefers-color-scheme: dark)"  srcset="docs/screenshots/home-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/home-light.png">
  <img alt="UPPCL Pro dashboard -- home view" src="docs/screenshots/home-dark.png" width="880">
</picture>

</div>

---

## Zero-knowledge security

> **Your username and password never touch our server.** Here is exactly what happens:

| Step | Where it happens | What our server sees |
|------|------------------|---------------------|
| You type your UPPCL credentials | Your browser | Nothing |
| Credentials are encrypted with RSA-OAEP + AES-256-GCM | Your browser (Web Crypto API) | Nothing |
| Encrypted blob is sent to UPPCL | Passes through our server | Encrypted blob (cannot decrypt) |
| UPPCL returns a 60-day JWT | Passes through our server | Encrypted response |
| JWT is stored | Your browser (`sessionStorage`) | Nothing -- never stored on server |

**The server is a stateless CORS-bypass pipe.** It forwards encrypted bytes between your browser and UPPCL's API. It cannot decrypt them. It does not log them. It does not store them. Close your browser tab and the JWT is gone.

Don't trust us -- [read the 90-line route handler](web/src/app/api/uppcl/%5B...path%5D/route.ts) yourself.

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

Everything is encrypted in your browser. The server never sees your credentials.

### Option 2: Self-host

```bash
git clone https://github.com/Harry-kp/uppcl-pro.git
cd uppcl-pro/web
bun install        # or: npm install
bun run dev        # opens on http://localhost:3000
```

Sign in via the web UI with the same credentials you use on the [UPPCL SMART app](https://uppcl.sem.jio.com/uppclsmart/).

### Production (self-hosted)

```bash
cd web
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
2. Web Crypto API encrypts them          
   (RSA-OAEP + AES-256-GCM)             
3. Encrypted blob sent ---------->       /api/uppcl/* (stateless pipe)
                                              |
                                              | forwards verbatim
                                              v
                                         uppcl.sem.jio.com
                                              |
4. Response returned <-------------      returns upstream response
5. JWT stored in sessionStorage          (server never stores anything)
```

### Key files

```
web/src/
  lib/
    crypto.ts          Browser-side ALTCHA + RSA-OAEP + AES-GCM (Web Crypto API)
    session.ts         JWT in sessionStorage (never on server)
    api.ts             SWR hooks + encrypted request builder
  app/
    api/
      uppcl/[...path]/route.ts   Stateless CORS-bypass forwarder (~90 lines)
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
| `/api/uppcl/*` | Forwards encrypted blobs to UPPCL | None -- only encrypted bytes pass through |
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
- **RSA-OAEP + AES-256-GCM** hybrid envelope encryption on every request body
- **60-day JWTs** with tenant-scoped access
- Dynamic tenant UUID discovery from login response

All of this is handled transparently by `web/src/lib/crypto.ts` running in your browser via the Web Crypto API.

The 1912 complaint portal (`appsavy.com`) uses anonymous sessions with AES-128-CBC encrypted headers (constant key `"8080808080808080"` -- yes, really).

See [`CLAUDE.MD`](CLAUDE.MD) for the full reverse-engineering knowledge base: endpoint inventory, field-name quirks, known-broken routes, and date format gotchas.

---

## Security

- **Credentials**: Encrypted in your browser, never sent in plaintext to our server
- **JWT**: Stored in `sessionStorage` (browser only), cleared when the tab closes
- **Server**: Stateless forwarder, no database, no logging of user data
- **Complaints**: Anonymous sessions only -- no user credentials involved

See [`SECURITY.md`](SECURITY.md) for the full threat model.

To report a vulnerability, email the maintainer privately (do not open a public issue).

---

## Contributing

```bash
cd web && bun install && bun run dev
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
