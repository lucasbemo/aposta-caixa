# Root Makefile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single `Makefile` at the repo root exposing every README command (install → config → build → run → test) as `make <target>`.

**Architecture:** Flat, self-documenting Makefile. Every recipe runs inside `aposta/` via `cd $(APP) && <command>`. Run targets depend on a hidden `check-build` guard that fails fast with a clear message when `dist/index.js` is missing. No file-based incremental tracking — all targets are `.PHONY`.

**Tech Stack:** GNU make (macOS ships 3.81 — use no make-4-only features), BSD userland (`cp -n` on macOS), Node 20+, npm, the existing `aposta` CLI.

**Spec:** `docs/superpowers/specs/2026-07-19-makefile-design.md`

## Global Constraints

- Makefile lives at repo root: `/Users/lucas/workspace/caixa-loteria/Makefile`; `APP := aposta`.
- Default goal is `help`; every user-facing target has a `## description` comment picked up by the help grep.
- `make config` must **never overwrite** an existing `.env` or `config.json` (`cp -n`, with `|| true` so a skip is not an error on GNU coreutils where `cp -n` exits non-zero).
- `bet` is a plain target — no Makefile-level gate (the CLI's own "SIM" confirmation and `maxAmountPerRun` guardrail apply).
- Run targets do **not** rebuild automatically; missing build fails with: `dist/index.js not found — run 'make build' first`.
- Verification must never execute a real `make bet`.
- Makefile recipes must be indented with **tabs**, not spaces.

---

### Task 1: Makefile with help + lifecycle targets

**Files:**
- Create: `Makefile` (repo root)

**Interfaces:**
- Produces: `APP` variable, `help`, `install`, `config`, `build`, `all`, `test` targets, and the `.PHONY`/`.DEFAULT_GOAL` scaffolding that Task 2 extends. Task 2 appends run targets to this same file and adds their names to the existing `.PHONY` line.

- [ ] **Step 1: Confirm no Makefile exists yet (the "failing test")**

Run: `make help`
Expected: FAIL with `make: *** No rule to make target 'help'.  Stop.` (or "No targets specified and no makefile found")

- [ ] **Step 2: Write the Makefile**

Create `Makefile` at the repo root with exactly this content (recipe lines start with a TAB):

```make
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
```

- [ ] **Step 3: Verify help output**

Run: `make` (bare, from repo root)
Expected: PASS — a two-column list showing `help`, `install`, `config`, `build`, `all`, `test` with their descriptions. No other output, no errors.

- [ ] **Step 4: Verify `make config` never clobbers the existing configured files**

Run:
```bash
shasum aposta/.env aposta/config.json > /tmp/cfg.before
make config
shasum -c /tmp/cfg.before
```
Expected: `make config` exits 0; `shasum -c` prints `OK` for both files (contents unchanged). Also run `stat -f '%Lp' aposta/.env` → expected `600`.

- [ ] **Step 5: Verify `make build` and `make test`**

Run: `make build`
Expected: tsc completes, exit 0, `aposta/dist/index.js` exists.

Run: `make test`
Expected: Vitest runs and reports **18 passed** tests, exit 0.

- [ ] **Step 6: Commit**

```bash
git add Makefile
git commit -m "feat: add root Makefile (help, install, config, build, all, test)"
```

---

### Task 2: Run targets with dist guard

**Files:**
- Modify: `Makefile` (repo root — append targets, extend `.PHONY` line from Task 1)

**Interfaces:**
- Consumes: `APP` variable, `.PHONY` line, and help-comment convention from Task 1.
- Produces: `check-build` (hidden guard, no `##` comment so it stays out of help), `dry-run`, `bet`, `comprovante`, `history`, `setup` targets.

- [ ] **Step 1: Confirm targets don't exist yet (the "failing test")**

Run: `make history`
Expected: FAIL with `make: *** No rule to make target 'history'.  Stop.`

- [ ] **Step 2: Extend the Makefile**

Change the `.PHONY` line from Task 1 to:

```make
.PHONY: help install config build all test check-build dry-run bet comprovante history setup
```

Append at the end of the file (recipe lines start with a TAB):

```make
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
```

- [ ] **Step 3: Verify the guard fires when dist is missing**

Run:
```bash
mv aposta/dist/index.js aposta/dist/index.js.bak
make history
```
Expected: FAIL, exit code 2 (make) with stderr containing `dist/index.js not found — run 'make build' first`, and **no** raw node "Cannot find module" error.

Restore immediately:
```bash
mv aposta/dist/index.js.bak aposta/dist/index.js
```

- [ ] **Step 4: Verify a safe run target end-to-end**

Run: `make history`
Expected: PASS — the CLI prints the locally recorded bets (or an empty-history message), exit 0.

Run: `make setup`
Expected: PASS — the CLI prints the initial configuration instructions, exit 0.

- [ ] **Step 5: Verify help now lists the run targets, and check-build stays hidden**

Run: `make`
Expected: list now also shows `dry-run`, `bet`, `comprovante`, `history`, `setup`; `check-build` does **not** appear.

- [ ] **Step 6 (manual, operator-only): dry-run smoke test**

Run: `make dry-run`
Expected: browser launches and the flow proceeds (login → OTP → cart → stops before payment). Because this performs a **real login** and the CAIXA anti-abuse may throttle OTP, the operator may Ctrl+C once the browser has launched — reaching launch satisfies the spec's verification bar. NEVER run `make bet` as part of verification.

- [ ] **Step 7: Commit**

```bash
git add Makefile
git commit -m "feat: add run targets (dry-run, bet, comprovante, history, setup) with dist guard"
```

---

### Task 3: Document make usage in the README

**Files:**
- Modify: `README.md` — insert a new section right after the `## Uso` section's command table and example output (i.e., before `## Segurança & privacidade`).

**Interfaces:**
- Consumes: target names exactly as defined in Tasks 1–2.

- [ ] **Step 1: Add the section**

Insert into `README.md` (PT-BR, matching the document's language), before `## Segurança & privacidade`:

```markdown
## Uso com make (opcional)

Um `Makefile` na raiz do repositório encapsula todos os comandos acima — execute `make <alvo>` a partir da raiz, sem precisar entrar em `aposta/`:

| Alvo | Equivalente |
|---|---|
| `make all` | `install` + `config` + `build` (clone novo → pronto para o dry-run) |
| `make install` | `npm install` + `npx playwright install chromium` |
| `make config` | copia `.env.example` → `.env` e `config.example.json` → `config.json` (nunca sobrescreve) + `chmod 600 .env` |
| `make build` | `npm run build` |
| `make dry-run` | `node dist/index.js bet --dry-run` |
| `make bet` | `node dist/index.js bet` (aposta **real**) |
| `make comprovante` | `node dist/index.js comprovante` |
| `make history` | `node dist/index.js history` |
| `make setup` | `node dist/index.js setup` |
| `make test` | `npm test` |

`make` sem argumentos lista os alvos disponíveis.
```

- [ ] **Step 2: Verify the table matches the Makefile**

Run: `grep -E '^[a-zA-Z_-]+:.*## ' Makefile | cut -d: -f1 | sort` and compare against the `make <alvo>` rows in the new README table.
Expected: the grep lists 11 targets — `help` plus the same 10 that appear as `make <alvo>` rows in the README table (`help` itself is covered by the closing sentence about bare `make`).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document root Makefile targets in README"
```
