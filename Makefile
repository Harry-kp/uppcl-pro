# UPPCL Pro — one-line commands for common tasks.
# Run `make help` to see everything.

PI ?= pi@raspberrypi.local
PY ?= venv/bin/python
BUN := $(shell command -v bun 2>/dev/null)
NPM := $(shell command -v npm 2>/dev/null)

.DEFAULT_GOAL := help
.PHONY: help setup dev dev-proxy dev-web lint typecheck test screenshots build \
        pi-build pi-push pi-deploy clean check-pii

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ─── Setup ─────────────────────────────────────────────────────────────────

setup: ## Install Python + Node dependencies (one-time)
	@echo "▸ Python virtualenv"
	@test -d venv || python3 -m venv venv
	@./venv/bin/pip install --upgrade pip wheel >/dev/null
	@./venv/bin/pip install -r requirements-dev.txt
ifdef BUN
	@echo "▸ Dashboard deps (bun)"
	@cd web && bun install
else
	@echo "▸ Dashboard deps (npm)"
	@cd web && npm install
endif
	@echo "✓ Setup complete. Run \`make dev\` to start."

## ─── Run ──────────────────────────────────────────────────────────────────

dev: ## Start proxy (:8000) + dashboard (:3000) in parallel
	@$(MAKE) -j2 dev-proxy dev-web

dev-proxy: ## Start only the FastAPI proxy
	@$(PY) -m uvicorn uppcl_api:app --host 127.0.0.1 --port 8000 --reload

dev-web: ## Start only the Next.js dashboard
ifdef BUN
	@cd web && bun run dev
else
	@cd web && npm run dev
endif

## ─── Quality ───────────────────────────────────────────────────────────────

lint: ## Run ruff + eslint
	@./venv/bin/ruff check uppcl_api.py appsavy.py scripts/*.py
ifdef BUN
	@cd web && bun run lint
else
	@cd web && npm run lint
endif

typecheck: ## Run tsc on the dashboard
ifdef BUN
	@cd web && bunx tsc --noEmit
else
	@cd web && npx tsc --noEmit
endif

## ─── Screenshots ───────────────────────────────────────────────────────────

screenshots: ## Build static, serve on :3000, capture dark+light for every route
	@./venv/bin/pip install --quiet playwright 2>/dev/null || true
	@./venv/bin/playwright install chromium 2>/dev/null || true
	@echo "▸ Checking proxy on :8000"
	@curl -s http://127.0.0.1:8000/health >/dev/null || { echo "✗ Proxy not running. Start it with \`make dev-proxy\` in another shell."; exit 1; }
	@echo "▸ Static build"
ifdef BUN
	@cd web && STATIC=1 bun run build >/dev/null
else
	@cd web && STATIC=1 npm run build >/dev/null
endif
	@echo "▸ Serving web/out/ on :3000"
	@lsof -ti:3000 | xargs -r kill -9 2>/dev/null; sleep 1
	@cd web/out && (python3 -m http.server 3000 >/dev/null 2>&1 &) && sleep 2
	@echo "▸ Capturing"
	@$(PY) scripts/capture_screenshots.py
	@lsof -ti:3000 | xargs -r kill -9 2>/dev/null; true
	@echo "✓ Screenshots in docs/screenshots/"

## ─── Build ────────────────────────────────────────────────────────────────

build: ## Production Node build of the dashboard
ifdef BUN
	@cd web && bun run build
else
	@cd web && npm run build
endif

pi-build: ## Static-export the dashboard for Raspberry Pi deployment
ifdef BUN
	@cd web && STATIC=1 NEXT_PUBLIC_UPPCL_PROXY=/api bun run build
else
	@cd web && STATIC=1 NEXT_PUBLIC_UPPCL_PROXY=/api npm run build
endif
	@echo "✓ Static export in web/out/ — ready for rsync."

## ─── Raspberry Pi deploy ──────────────────────────────────────────────────

pi-push: ## rsync repo tree to the Pi (override PI=user@host, defaults to pi@raspberrypi.local)
	@echo "▸ rsync → $(PI):~/uppcl-pro/"
	@rsync -azP --delete \
		--exclude='.git' --exclude='.env' --exclude='uppcl_session.json' \
		--exclude='*.har' --exclude='venv' --exclude='__pycache__' \
		--exclude='web/node_modules' --exclude='web/.next' \
		--exclude='docs/screenshots' \
		--exclude='stitch_with_google_ai_design' \
		--exclude='scripts/pii.json' --exclude='scripts/pii.sample.json' \
		./ $(PI):~/uppcl-pro/

pi-deploy: pi-build pi-push ## Build + push + restart services on the Pi
	@ssh $(PI) 'cd ~/uppcl-pro && \
		if [ ! -d venv ]; then bash deploy/pi-setup.sh; \
		else ./venv/bin/pip install -r requirements.txt >/dev/null \
		  && sudo systemctl restart uppcl-proxy caddy; fi'
	@echo "✓ Deployed. Open http://$${PI#*@}:1912/ to verify."

## ─── Hygiene ───────────────────────────────────────────────────────────────

check-pii: ## Scan committable files for personal identifiers (before publishing)
	@$(PY) scripts/check_pii.py

clean: ## Remove build artefacts + caches (keeps .env + session)
	@rm -rf web/.next web/out venv/__pycache__ __pycache__ .pytest_cache
	@echo "✓ Cleaned."
