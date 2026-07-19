APP := aposta

.DEFAULT_GOAL := help
.PHONY: help install config build all test

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
