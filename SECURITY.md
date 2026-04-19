# Security policy

## Reporting a vulnerability

Please do not open a public GitHub issue for security bugs.

Email the maintainer privately with:
- A description of the issue.
- The version / commit you reproduced it on.
- A minimal reproduction (curl, code snippet, HAR — scrubbed of your personal data).

I'll acknowledge within 72 h and work with you on a fix and coordinated disclosure.

## Threat model

This project runs entirely on your own machine. The sensitive data at play is:

| Data | Where it lives | Risk |
|---|---|---|
| UPPCL username / password | Sent once to UPPCL's login API, never persisted by the proxy | Leak via HTTPS interception requires a rogue CA on your machine. |
| 60-day JWT | `uppcl_session.json` (gitignored) | If leaked, grants full UPPCL SMART access until its `expires` timestamp. **UPPCL's `/auth/logout` is soft — it only deletes the server-side session record. The JWT itself keeps working.** To force-invalidate, change your UPPCL password. |
| Meter + consumption data | Returned via local proxy at :8000; cached by SWR in the browser | No upstream egress beyond UPPCL's API. |
| Public API key + tenant UUID | Baked in `uppcl_api.py` | Not secrets — they're fetched from UPPCL's own SPA. Present so Jio rotating them becomes a 1-line fix. |

## Known soft edges

- The proxy binds to `127.0.0.1:8000` by default — do not expose it to a public network without authentication in front (Caddy + basic auth, Tailscale, etc.). The proxy itself has **no auth**; it trusts whoever can reach its port.
- The `/debug/raw` route can send arbitrary requests to UPPCL's upstream API using your cached JWT. Useful for reverse engineering; also a foot-gun.
- The `uppcl_session.json` file is world-readable by default. Chmod it to 600 if you're on a multi-user machine.

## Responsible use

This is a read-mostly tool. The complaint-submission reverse engineering is **deliberately not wired** into an automated "file complaint" button by default — the risk of an automated system spamming UPPCL's 1912 helpline is not worth the convenience. Any future submission endpoint will require explicit opt-in and dry-run verification.

If you fork and add auto-submission, please keep the same guardrails.

## Out of scope

- Vulnerabilities in UPPCL's or Appsavy's production services. Please report those to UPPCL directly.
- Issues in unrelated dependencies — open an issue with the upstream package.
