## What changed

<!-- One-line summary. Link any related issues. -->

## Why

<!-- What problem does this solve? Why this approach over alternatives? -->

## How to test

<!-- Exact steps for a reviewer to verify. -->

```bash
make dev
# then
curl localhost:8000/<route>
# or navigate to localhost:3000/<page>
```

## Checks

- [ ] `make lint` passes
- [ ] `make typecheck` passes (if dashboard changed)
- [ ] Screenshots regenerated (`make screenshots`) if UI changed
- [ ] No new dependencies added without justification
- [ ] No PII in logs / diffs / commits
- [ ] README / CLAUDE.md updated if public-facing behaviour changed
