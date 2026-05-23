# Security policy

## Reporting a vulnerability

Please do not open a public GitHub issue for security bugs.

Email the maintainer privately with:
- A description of the issue.
- The version / commit you reproduced it on.
- A minimal reproduction (code snippet, browser console log, HAR — scrubbed of your personal data).

I'll acknowledge within 72 h and work with you on a fix and coordinated disclosure.

## Privacy & transparency

UPPCL Pro is a pure Next.js app. The server acts as a **stateless CORS proxy** between your browser and UPPCL's API. It has no database, no persistent storage, no analytics, and no tracking.

### Honest threat model

**The server CAN see your credentials in memory during the request.** It does not store or log them, but if the server were compromised, an attacker could theoretically intercept credentials in transit. Self-hosting eliminates this risk entirely.

### What the server sees

| Data | Where it lives | What the server sees | Risk |
|---|---|---|---|
| UPPCL username / password | Your browser → server → UPPCL API | **Plaintext JSON in memory** during the HTTP request | Server operator _could_ read them; we don't store or log them |
| 60-day JWT | `sessionStorage` in your browser | Passes through server memory during login response | Same as above — transient, never stored |
| Meter + consumption data | UPPCL API → server → your browser | Passes through server memory as upstream response | Transient, never stored |
| Public API key + tenant UUID | Fetched from UPPCL's SPA | Visible (not secrets) | None |
| Phone number (complaints) | Your browser → Appsavy API | Passes through server for 1912 lookup | Public portal, no login involved |

### How credentials flow

1. You enter your UPPCL username and password in the browser.
2. Credentials are sent as **plaintext JSON over HTTPS** to our Next.js API route (`/api/uppcl/*`).
3. The API route forwards the request verbatim to `uppcl.sem.jio.com` and returns the response.
4. UPPCL validates the credentials and returns a JWT.
5. The JWT is stored in **`sessionStorage` only** — it lives in the current tab and is destroyed when the tab closes.

The server never writes credentials to disk, a database, or a log file. They exist in process memory only for the duration of the HTTP request.

### Trust model

| Deployment | Trust requirement |
|---|---|
| **Self-hosted** (`bun run dev`) | Full privacy — credentials never leave your machine. You trust only yourself. |
| **Hosted** (uppcl-pro.vercel.app) | You trust that the deployed code matches the open-source repo and that Vercel's infrastructure is not compromised. |

**Why should you trust the hosted version?**
- The entire codebase is [open-source on GitHub](https://github.com/Harry-kp/uppcl-pro) — read every line yourself
- The server route handler is [~90 lines](src/app/api/uppcl/%5B...path%5D/route.ts) — a simple proxy with no storage
- No database, no logging of user data, no analytics, no tracking
- If you don't trust it, **self-host** — it takes one command

### Appsavy complaints

The complaint-filing flow (via Appsavy) uses **anonymous sessions** — no UPPCL credentials are involved. The app obtains a temporary Appsavy session token and submits complaints without ever linking to your UPPCL account.

## Known soft edges

- The Next.js API route is a CORS proxy — it forwards whatever the browser sends to UPPCL's upstream API. If a browser extension or devtools script crafts a malicious request, the proxy will forward it.
- The JWT in `sessionStorage` is accessible to any JavaScript running in the same origin. A malicious browser extension or XSS vulnerability could exfiltrate it. **UPPCL's `/auth/logout` is soft — it only deletes the server-side session record. The JWT itself keeps working.** To force-invalidate, change your UPPCL password.
- On the hosted version, credentials are visible to the server process in memory during the request. A compromised server could intercept them. Self-hosting eliminates this risk.

## Responsible use

This is a read-mostly tool. The complaint-submission reverse engineering is **deliberately not wired** into an automated "file complaint" button by default — the risk of an automated system spamming UPPCL's 1912 helpline is not worth the convenience. Any future submission endpoint will require explicit opt-in and dry-run verification.

If you fork and add auto-submission, please keep the same guardrails.

## Out of scope

- Vulnerabilities in UPPCL's or Appsavy's production services. Please report those to UPPCL directly.
- Issues in unrelated dependencies — open an issue with the upstream package.
