APP := aposta

.DEFAULT_GOAL := help
.PHONY: help install config build all test check-build dry-run bet comprovante history setup

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies and Playwright Chromium
	cd $(APP) && npm install
	cd $(APP) && npx playwright install chromium

config: ## Create .env and config.json from examples (never overwrites existing)
	cd $(APP) && cp -n .env.example .env || true
	cd $(APP) && chmod 600 .env
	cd $(APP) && cp -n config.example.json config.json || true

build: ## Compile TypeScript (tsc)
	cd $(APP) && npm run build

all: install config build ## Fresh clone -> ready for 'make dry-run'

test: ## Run Vitest unit tests
	cd $(APP) && npm test

check-build:
	@test -f $(APP)/dist/index.js || { echo "dist/index.js not found — run 'make build' first" >&2; exit 1; }

dry-run: check-build ## Full flow, stops before payment (no bet placed)
	cd $(APP) && node dist/index.js bet --dry-run

bet: check-build ## REAL bet: asks SIM confirmation, pays, saves receipt
	cd $(APP) && node dist/index.js bet

comprovante: check-build ## Re-save the latest purchase receipt screenshot
	cd $(APP) && node dist/index.js comprovante

history: check-build ## List locally recorded bets
	cd $(APP) && node dist/index.js history

setup: check-build ## Show initial configuration instructions
	cd $(APP) && node dist/index.js setup
