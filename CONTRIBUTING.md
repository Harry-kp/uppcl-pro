# Contributing

Thanks for showing up. This is a small project but we care about code quality.

## Quick contribution checklist

1. Fork → branch (`git checkout -b my-change`).
2. Make your change. Keep diffs focused — one concern per PR.
3. Run the checks:
   ```bash
   make lint          # ruff + eslint
   make typecheck     # tsc, if you changed the dashboard
   make dev           # smoke-test locally
   ```
4. If you touched the UI, regenerate screenshots (`make screenshots`) and commit the updated files in `docs/screenshots/`.
5. Write a clear commit message and PR description — *what* + *why*, not just *how*.

No CLA, no squash-only rule, no ceremony.

## Getting set up

```bash
git clone https://github.com/Harry-kp/uppcl-pro.git
cd uppcl-pro
make setup    # pip install + bun install
cp .env.sample .env
```

The `.env` file is optional — the proxy ships with sensible defaults. Override only if UPPCL rotates the public API key, or if you want to point the proxy at a different base URL for mitmproxy debugging.

## Code style

- **Python**: [ruff](https://docs.astral.sh/ruff/) with default rules. 4-space indent, type hints on public signatures.
- **TypeScript**: Tailwind v4 tokens (don't hardcode hex colours — use `chart.a`, `text-on-surface`, etc.). Keep client components cheap; SWR caches aggressively.
- **Commits**: imperative mood ("add runway gauge", not "added" or "adds").

Tests are intentionally light because most of the value is in the reverse-engineering fidelity. If you're adding a new upstream integration, include a probe script in `scripts/` that demonstrates the call shape + expected response, so future us can verify quickly.

## What's fair game

- New charts and analytics tiles — but keep them dense. This is a power-user dashboard, not a consumer app.
- More DISCOMs beyond UPPCL — the architecture is already factored; add a new client class and wire it behind a `DISCOM` env var.
- Performance improvements on the Pi deployment path.
- Better data-export formats (CSV is the current floor, Excel + Parquet welcome).

## What's not

- **Do not submit live complaints as part of testing.** Use the `dry-run` mode (planned) or capture HARs in offline mode.
- Do not open PRs that weaken the privacy story — the local-only posture is a feature, not a limitation.
- Do not add telemetry, analytics, or any external call that isn't strictly necessary for the feature.

## Reporting bugs

Open an issue with:
- What you did (curl command or click sequence)
- What you expected
- What actually happened (server log, browser console, proxy response)
- Your environment (Python version, Node version, OS, dashboard route)

For API-shape bugs — attach a redacted HAR if you can. We've documented the common ones in [`CLAUDE.md`](CLAUDE.md) and the PR bar is "this HAR shows the bug".

## Security issues

Please don't open public issues for security bugs. See [`SECURITY.md`](SECURITY.md).
