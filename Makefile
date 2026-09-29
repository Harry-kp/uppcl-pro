# UPPCL Pro — just a Next.js app. Requires bun (https://bun.sh).
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

.DEFAULT_GOAL := help
.PHONY: help setup dev build start lint typecheck check clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install dependencies (one-time)
	@bun install
	@echo "✓ Setup complete. Run \`make dev\` to start."

dev: ## Start dev server on :3000
	@bun run dev

build: ## Production build
	@bun run build

start: ## Start production server (run build first)
	@bun run start

lint: ## Run eslint
	@bun run lint

typecheck: ## Run tsc
	@bunx tsc --noEmit

check: lint typecheck build ## Everything CI runs

clean: ## Remove build artefacts
	@rm -rf .next out
	@echo "✓ Cleaned."
