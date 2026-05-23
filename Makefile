# UPPCL Pro — just a Next.js app. No Python, no Docker.
#
# Quickstart:
#   make setup   # one-time: install deps
#   make dev     # start dev server on :3000
#
# Deploy to Vercel:
#   vercel deploy
#
# Self-host:
#   make build && make start

BUN := $(shell command -v bun 2>/dev/null)

.DEFAULT_GOAL := help
.PHONY: help setup dev build start lint typecheck clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install dependencies (one-time)
ifdef BUN
	@bun install
else
	@npm install
endif
	@echo "✓ Setup complete. Run \`make dev\` to start."

dev: ## Start dev server on :3000
ifdef BUN
	@bun run dev
else
	@npm run dev
endif

build: ## Production build
ifdef BUN
	@bun run build
else
	@npm run build
endif

start: ## Start production server (run build first)
ifdef BUN
	@bun run start
else
	@npm run start
endif

lint: ## Run eslint
ifdef BUN
	@bun run lint
else
	@npm run lint
endif

typecheck: ## Run tsc
ifdef BUN
	@bunx tsc --noEmit
else
	@npx tsc --noEmit
endif

clean: ## Remove build artefacts
	@rm -rf .next out
	@echo "✓ Cleaned."
