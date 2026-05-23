# Security policy

## Reporting a vulnerability

Please do not open a public GitHub issue for security bugs.

Email the maintainer privately with:
- A description of the issue.
- The version / commit you reproduced it on.
- A minimal reproduction (code snippet, browser console log, HAR — scrubbed of your personal data).

I'll acknowledge within 72 h and work with you on a fix and coordinated disclosure.

## Zero-knowledge architecture

UPPCL Pro is a pure Next.js app. The server never sees your UPPCL credentials or JWT in plaintext.

### How credentials flow

1. You enter your UPPCL username and password in the browser.
2. The browser fetches UPPCL's public RSA key and encrypts credentials using **RSA-OAEP + AES-GCM** via the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) — the same encryption UPPCL's own SPA performs.
3. The encrypted blob is sent through a Next.js API route that acts as a **stateless CORS-bypass pipe**. The server only sees opaque ciphertext; it cannot decrypt it.
4. UPPCL's upstream API decrypts and validates the credentials, returning a JWT.
5. The JWT is stored in **`sessionStorage` only** — it lives in the current tab and is destroyed when the tab closes.

### What the server sees

| Data | Server visibility | Notes |
|---|---|---|
| UPPCL username / password | **None** — encrypted in-browser before leaving | RSA-OAEP + AES-GCM via Web Crypto API |
| 60-day JWT | **None** — stays in `sessionStorage` | Never sent to the Next.js server; used only for direct browser → UPPCL API calls via the CORS proxy |
| Meter + consumption data | **Transient** — passes through the API route as an encrypted/opaque upstream response | No storage, no logging |
| Public API key + tenant UUID | Visible (not secrets) | Fetched from UPPCL's own SPA; present so Jio rotating them becomes a 1-line fix |

### Appsavy complaints

The complaint-filing flow (via Appsavy) uses **anonymous sessions** — no UPPCL credentials are involved. The app obtains a temporary Appsavy session token and submits complaints without ever linking to your UPPCL account.

## Known soft edges

- The Next.js API route is a blind CORS proxy — it forwards whatever the browser sends to UPPCL's upstream API. If a browser extension or devtools script crafts a malicious request, the proxy will forward it.
- The JWT in `sessionStorage` is accessible to any JavaScript running in the same origin. A malicious browser extension or XSS vulnerability could exfiltrate it. **UPPCL's `/auth/logout` is soft — it only deletes the server-side session record. The JWT itself keeps working.** To force-invalidate, change your UPPCL password.

## Responsible use

This is a read-mostly tool. The complaint-submission reverse engineering is **deliberately not wired** into an automated "file complaint" button by default — the risk of an automated system spamming UPPCL's 1912 helpline is not worth the convenience. Any future submission endpoint will require explicit opt-in and dry-run verification.

If you fork and add auto-submission, please keep the same guardrails.

## Out of scope

- Vulnerabilities in UPPCL's or Appsavy's production services. Please report those to UPPCL directly.
- Issues in unrelated dependencies — open an issue with the upstream package.
