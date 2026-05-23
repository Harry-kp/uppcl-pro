# UPPCL Pro — just a Next.js app. No Python, no Docker.
#
# Quickstart:
#   make setup   # one-time: install deps
#   make dev     # start dev server on :3000
#
# Deploy to Vercel:
#   vercel deploy (from web/)
#
# Self-host on Pi / laptop:
#   make build && make start

PI ?= pi@raspberrypi.local
BUN := $(shell command -v bun 2>/dev/null)

.DEFAULT_GOAL := help
.PHONY: help setup dev build start lint typecheck pi-push pi-deploy clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ─── Setup ────────────────────────────────────────────────────────────────

setup: ## Install dependencies (one-time)
ifdef BUN
	@cd web && bun install
else
	@cd web && npm install
endif
	@echo "✓ Setup complete. Run \`make dev\` to start."

## ─── Run ──────────────────────────────────────────────────────────────────

dev: ## Start dev server on :3000
ifdef BUN
	@cd web && bun run dev
else
	@cd web && npm run dev
endif

build: ## Production build
ifdef BUN
	@cd web && bun run build
else
	@cd web && npm run build
endif

start: ## Start production server (run `make build` first)
ifdef BUN
	@cd web && bun run start
else
	@cd web && npm run start
endif

## ─── Quality ──────────────────────────────────────────────────────────────

lint: ## Run eslint
ifdef BUN
	@cd web && bun run lint
else
	@cd web && npm run lint
endif

typecheck: ## Run tsc
ifdef BUN
	@cd web && bunx tsc --noEmit
else
	@cd web && npx tsc --noEmit
endif

## ─── Raspberry Pi ─────────────────────────────────────────────────────────

pi-push: ## rsync to Pi
	@echo "▸ rsync → $(PI):~/uppcl-pro/"
	@rsync -azP --delete \
		--exclude='.git' --exclude='web/node_modules' \
		--exclude='web/.next' --exclude='docs/screenshots' \
		./ $(PI):~/uppcl-pro/

pi-deploy: build pi-push ## Build + push + start on Pi
	@ssh $(PI) 'cd ~/uppcl-pro/web && npm install --production && npm run start &'
	@echo "✓ Deployed. Open http://$${PI#*@}:3000/"

## ─── Hygiene ──────────────────────────────────────────────────────────────

clean: ## Remove build artefacts
	@rm -rf web/.next web/out
	@echo "✓ Cleaned."
