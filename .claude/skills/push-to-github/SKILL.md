---
name: push-to-github
description: Publish UPPCL Pro to GitHub — first-time push (create repo, set topics + description, tag v1.0, draft release) or incremental push (new commit, push). Use when the user says "push to github", "publish", "ship it", "release", "create the repo", or invokes `/push_to_github`. Handles PII/lint gates, repo metadata, and tagging in one pass.
---

# Push UPPCL Pro to GitHub

Goal: get the repo onto `github.com/Harry-kp/uppcl-pro` safely, with correct metadata, without leaking PII. This skill owns *everything* about publishing — don't delegate decisions back to the user except where explicitly marked **ASK**.

**Default target:** `Harry-kp/uppcl-pro` (the GitHub handle used throughout the codebase). If you see a different handle in `git remote -v` or the user explicitly states otherwise, use that.

## Phase 0 — Context sniff (parallel, one message)

Run these in **parallel** before doing anything irreversible:

1. `git rev-parse --is-inside-work-tree 2>/dev/null && echo "IS_REPO" || echo "NOT_REPO"` — is this already a git repo?
2. `git remote -v 2>/dev/null` — is there a remote? Is it `Harry-kp/uppcl-pro`?
3. `git status --porcelain 2>/dev/null | head -30` — what's untracked / modified?
4. `git log --oneline 2>/dev/null | head -5` — any prior commits?
5. `gh auth status 2>&1` — **parse carefully**: list every account, note which one is `Active account: true`.
6. `gh api user --jq '.login'` — who is the *actually-effective* user right now? (gh's env `GITHUB_TOKEN` overrides keyring slots — this tells you the truth.)
7. `git config user.name && git config user.email` — committer identity set?
8. `basename "$PWD"` — is the working directory named `uppcl-pro`? If it's still `uppcl` (the legacy name), flag it — the user should `mv` and re-open Claude Code first.

Report the state in 3-4 lines so the user can see what mode we're in.

### 🛑 Hard checks before any network call

**A. Effective `gh` account MUST resolve to `Harry-kp`**. This repo lives under that handle. Note that `gh` can have multiple auth slots (env `GITHUB_TOKEN`, keyring) — `gh api user` is the source of truth for which one wins.

If `gh api user --jq '.login'` returns anything other than `Harry-kp`, *stop*. Surface it:

> *"`gh` is effectively authed as `<actual-user>`, not `Harry-kp`. Fix in your shell:*
>
> *If a `GITHUB_TOKEN` env var is overriding (check with `gh auth status` — look for `(GITHUB_TOKEN)`):*
> `! unset GITHUB_TOKEN`
>
> *Then add / switch to Harry-kp:*
> `! gh auth login   # pick Harry-kp via web browser`
> `! gh auth switch --user Harry-kp`
>
> *Verify: `gh api user --jq '.login'` should print `Harry-kp`. Then re-run `/push_to_github`."*

Do **not** attempt `gh auth switch`, `unset`, or `gh auth login` yourself — those belong to the user's interactive shell.

**B. `git config user.email` must NOT be a corporate address**. Apply heuristic: flag anything that isn't `@users.noreply.github.com`, `@gmail.com`, `@outlook.com`, `@icloud.com`, `@protonmail.com`, or `@proton.me`. Any other domain — especially a known employer's — needs a per-repo override. **Stop and warn**:

> *"`git config user.email` is set globally to `<email>`. That email will appear on every commit on the public repo — it accidentally discloses an employer relationship.*
>
> *Set a personal identity just for this repo (not global):*
> `! git config user.email 'Harry-kp@users.noreply.github.com'`
> `! git config user.name  'Harry-kp'`
>
> *GitHub's `<id>+<user>@users.noreply.github.com` form hides the real address but still attributes commits to the right profile. If you want to use a real personal email instead, substitute it."*

Wait for the user to confirm the override before proceeding.

**C. If `basename "$PWD"` is still `uppcl`** (not `uppcl-pro`), stop and advise:

> *"Folder is still named `uppcl` — rename to match the repo before pushing:*
> `! cd ~/Documents/pocs && mv uppcl uppcl-pro && cd uppcl-pro && rm -rf venv && make setup`
> *Then re-open Claude Code in `~/Documents/pocs/uppcl-pro` and retry."*

## Phase 1 — Safety gates (ALL must pass)

These are hard gates. If any fails, **stop** and surface the failure — do not push.

Run in parallel:

```bash
./venv/bin/python scripts/check_pii.py
./venv/bin/ruff check uppcl_api.py appsavy.py scripts/*.py
(cd web && ./node_modules/.bin/tsc --noEmit)
```

Expected:
- PII scan → `✓ N files scanned. No PII matched.`
- Ruff → `All checks passed!`
- tsc → exit 0, no output

If `check_pii.py` reports `scripts/pii.json not found`, **that's a hard stop** — it means pattern config is missing and the scan is a no-op. Ask the user to populate `scripts/pii.json` from the sample, or confirm they've never filled it in (in which case no PII can leak and the scan is trivially safe — but flag this explicitly).

Then a paranoid-check pass: confirm none of these are tracked:

```bash
git ls-files 2>/dev/null | grep -E "^\.env$|uppcl_session\.json|scripts/pii\.json|\.har$" && echo "⚠ PII FILE TRACKED" || echo "✓ no PII files tracked"
```

If any are tracked: **STOP**. Walk the user through `git rm --cached <file>` and re-audit. Do not proceed.

## Phase 2 — Choose path

Decide based on Phase 0:

### Path A — First-time push (no `.git`, no remote)

Branch here if `NOT_REPO` or (repo exists but no commits and no remote).

1. **Init repo on `main`**:
   ```bash
   git init -b main
   ```

2. **Stage everything git-tracked** (gitignore already excludes `.env`, `uppcl_session.json`, `scripts/pii.json`, `*.har`, `node_modules`, `web/.next`, `web/out`, `venv`, `docs/screenshots/_*preview*`, `stitch_with_google_ai_design/`). Audit the staging area *before* commit:

   ```bash
   git add -A
   git status --short
   git diff --cached --stat | tail -5
   ```

   Show the user the file count + top-level breakdown. **ASK** for a thumbs-up before committing — this is the blast-radius moment.

3. **First commit** (HEREDOC so formatting survives):

   ```bash
   git commit -m "$(cat <<'EOF'
   Initial release — UPPCL Pro v1.0 (Kinetic Vault)

   End-to-end reverse-engineered analytics dashboard for UPPCL SMART
   prepaid smart meters. Ships a local FastAPI proxy (ALTCHA proof-of-work
   + RSA-OAEP + AES-256-GCM + 60-day JWT) and a Next.js 16 dashboard
   with a dark-first Material 3 theme.

   Highlights:
   - Live balance with auto-fallback (prepaidBalance → latest daily bill
     → outstanding), always tagged with its source
   - Runway forecast, anomaly detection, day-of-week patterns
   - Cost breakdown: effective ₹/unit, charge composition, subsidy YTD
   - 1912 complaint history with full JE/AE/XEN officer chain
   - Raspberry Pi Zero 2 deployment (Caddy on :1912, coexists with Pi-hole)
   - OpenAPI 3.1 schema at /openapi.json, Swagger UI at /docs
   - Zero user-specific code — every ID is discovered at runtime

   Tested end-to-end on PVVNL; other UPPCL DISCOMs share the same
   upstream API and should work identically (unverified).

   Not affiliated with UPPCL, any DISCOM, or Reliance Jio.
   EOF
   )"
   ```

4. **Tag `v1.0`**:

   ```bash
   git tag -a v1.0 -m "UPPCL Pro v1.0 — Kinetic Vault"
   ```

5. **Create the GitHub repo** via `gh`. Default settings — **public**, description from the template below, MIT license already in tree:

   ```bash
   gh repo create Harry-kp/uppcl-pro \
     --public \
     --source=. \
     --remote=origin \
     --description "Self-hosted analytics dashboard for UPPCL SMART prepaid smart meters. Reverse-engineered FastAPI proxy + Next.js 16 dashboard. Runs on a Raspberry Pi. Tested on PVVNL." \
     --homepage "https://github.com/Harry-kp/uppcl-pro"
   ```

   If `gh repo create` complains that the repo already exists on GitHub, switch to the incremental path (Path B) — don't force-overwrite.

6. **Push main + tag**:

   ```bash
   git push -u origin main
   git push origin v1.0
   ```

7. **Set topics + homepage** (discovery — people find open-source projects by topic):

   ```bash
   gh repo edit Harry-kp/uppcl-pro \
     --homepage https://harry-kp.github.io/uppcl-pro/ \
     --add-topic uppcl,pvvnl,smart-meter,prepaid-meter,energy-monitoring,electricity,india,fastapi,nextjs,tailwindcss,swr,self-hosted,raspberry-pi,home-lab,reverse-engineering,api-proxy,analytics-dashboard,dashboard
   ```

   (18 topics is GitHub's max. List above is already at 18 — don't add more without trimming.)

8. **Enable GitHub Pages** — hosts the ReDoc API reference at `https://harry-kp.github.io/uppcl-pro/` from the `/docs` folder on `main`. Lets visitors browse all 23 endpoints without cloning:

   ```bash
   gh api -X POST repos/Harry-kp/uppcl-pro/pages \
     -f 'source[branch]=main' \
     -f 'source[path]=/docs' \
     2>&1 | head -3
   ```

   If it errors with `Pages already enabled` or similar 422, that's fine — idempotent, move on. First build takes 1-2 min. Verify:

   ```bash
   gh api repos/Harry-kp/uppcl-pro/pages --jq '.status + " → " + .html_url' 2>&1
   ```

8. **Draft a v1.0 release** with generated release notes:

   ```bash
   gh release create v1.0 \
     --title "v1.0 — Kinetic Vault" \
     --generate-notes \
     --notes "$(cat <<'EOF'
   **UPPCL Pro v1.0 — Kinetic Vault**

   First public release. Reverse-engineered analytics dashboard for UPPCL SMART prepaid smart meters.

   ### 📦 What's inside
   - `uppcl_api.py` — FastAPI proxy that handles ALTCHA, RSA-OAEP + AES-256-GCM envelope encryption, 60-day JWT caching
   - `appsavy.py` — read-only client for the UPPCL 1912 complaint portal (AES-CBC-128)
   - `web/` — Next.js 16 dashboard (Tailwind v4, SWR, command palette, 7 routes × dark/light themes)
   - `deploy/` — systemd + Caddy configs for Raspberry Pi Zero 2 deployment (port 1912, coexists with Pi-hole)
   - `.claude/skills/` — `/setup` and `/first-login` skills for Claude Code users

   ### ✅ Tested on
   - PVVNL (Paschimanchal Vidyut Vitran Nigam Limited) — end-to-end
   - Raspberry Pi Zero 2 W + Pi-hole coexistence
   - macOS dev + Raspberry Pi OS Bookworm 64-bit production

   ### 🟡 Unverified but should work (same upstream API)
   - MVVNL, PuVVNL, DVVNL, KESCo — see README compatibility table

   ### 🌐 Hosted API reference
   - Browse all 23 endpoints without cloning: **https://harry-kp.github.io/uppcl-pro/** (ReDoc, auto-updated from `main`)

   ### ⚠️ Not affiliated
   With Uttar Pradesh Power Corporation Limited, any of its DISCOMs, or Reliance Jio.
   All trademarks belong to their respective owners.
   EOF
   )"
   ```

### Path B — Incremental push (repo exists, has commits + remote)

1. Re-run the Phase 1 safety gates. If anything regressed (new PII hit, new lint fail), stop.

2. Show `git status --short` + `git diff --stat HEAD` so the user sees what's changing. **ASK** before committing.

3. Compose a commit message that follows the existing project style. Quickly check the last 5 commits for tone:

   ```bash
   git log --oneline -5
   git log -1 --format=%B
   ```

   Match that style. Typical shape is a short subject + a body paragraph naming the *why*.

4. **Stage + commit** — add specific files, not `git add -A` for incremental changes (reduces blast radius of accidentally staging a new secret):

   ```bash
   git add <specific paths>
   git commit -m "$(cat <<'EOF'
   <short subject in the repo's existing style>

   <why>
   EOF
   )"
   ```

5. **Push**:

   ```bash
   git push origin main
   ```

6. If the user mentioned "release" or "tag a version", create a tag + release. Otherwise skip — not every push is a release.

## Phase 3 — Post-push polish (Path A only, first time)

After the push succeeds:

1. **Enable issue + discussion templates**:

   ```bash
   gh api -X PATCH repos/Harry-kp/uppcl-pro \
     -f has_issues=true -f has_discussions=true -f has_wiki=false -f has_projects=false
   ```

2. **Set default branch protection (light-touch)** — don't go overboard on a solo project, but do block force-pushes to `main`:

   ```bash
   gh api -X PUT repos/Harry-kp/uppcl-pro/branches/main/protection \
     -f required_status_checks= \
     -F enforce_admins=false \
     -F required_pull_request_reviews= \
     -f restrictions= \
     -F allow_force_pushes=false \
     -F allow_deletions=false 2>&1 || echo "(branch protection skipped — needs Pro or public repo)"
   ```

   This may fail silently on free accounts for private repos; it's fine to swallow the error.

3. **Verify** in one curl:

   ```bash
   gh repo view Harry-kp/uppcl-pro --json name,description,url,topics,stargazerCount,isPublic
   ```

4. **Report back to user** with:
   - Repo URL
   - v1.0 release URL
   - Number of topics applied
   - One-line suggestion: *"Share the release URL on /r/india, r/IndiaInvestments, Twitter, Hacker News, etc. if you want traction."*

## Decision heuristics (quick reference)

| Situation | Action |
|---|---|
| Repo already on GitHub | Path B, incremental |
| Local repo exists, no remote, no commits | Path A, first time |
| No local repo | Path A, `git init` first |
| PII scan finds a hit | **Hard stop**. Surface the hit. Do not commit. |
| `.env` / `pii.json` / `uppcl_session.json` tracked | **Hard stop**. `git rm --cached` + re-audit. |
| `gh auth status` errors | Stop and tell user to run `gh auth login` via `!` prefix |
| User says "private repo" | Swap `--public` → `--private` in `gh repo create` |
| Tsc or ruff fails | Stop. Ask if they want to fix or skip (default: fix). |

## DO NOT

- Force-push (`git push -f`) unless explicitly asked, even then push back twice
- `--no-verify` on commit
- Skip Phase 1 gates — PII leaks are irreversible once public
- Add secrets to commit messages or tag annotations
- Commit `docs/screenshots/*_preview*.png` (they're debug artefacts, already gitignored — just don't un-gitignore them)
- Create a release with PII in the notes (scan the notes for any literal values from `scripts/pii.json`)
- Push multiple tags in one go without showing them to the user first

## Repo metadata — canonical values

Use these verbatim unless the user overrides:

- **Owner/name**: `Harry-kp/uppcl-pro`
- **Visibility**: public
- **Default branch**: `main`
- **Description (About)**: `Self-hosted analytics dashboard for UPPCL SMART prepaid smart meters. Reverse-engineered FastAPI proxy + Next.js 16 dashboard. Runs on a Raspberry Pi. Tested on PVVNL.`
- **Topics (18, max allowed)**: `uppcl`, `pvvnl`, `smart-meter`, `prepaid-meter`, `energy-monitoring`, `electricity`, `india`, `fastapi`, `nextjs`, `tailwindcss`, `swr`, `self-hosted`, `raspberry-pi`, `home-lab`, `reverse-engineering`, `api-proxy`, `analytics-dashboard`, `dashboard`
- **License**: MIT (already in `LICENSE`)
- **Initial tag**: `v1.0` (semver, no `v1.0.0` — this is a single digit major release)
- **Release title**: `v1.0 — Kinetic Vault`

## Success criteria

At the end, the user should be able to:

1. Open https://github.com/Harry-kp/uppcl-pro and see the README rendered with screenshots + badges.
2. See the 18 topics listed in the sidebar.
3. See the v1.0 release under *Releases*.
4. Clone it on a fresh machine, run `/setup`, then `/first-login`, and have it working.
