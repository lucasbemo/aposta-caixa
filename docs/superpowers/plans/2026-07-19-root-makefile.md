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

### Task 3: Make the README make-first; move raw commands to docs/CLI.md

**Files:**
- Create: `docs/CLI.md`
- Modify: `README.md` — the `Instalação`, `Configuração` and `Uso` sections. Everything else (aviso, mermaid diagram, Segurança, Limitações, Desenvolvimento) stays untouched.

**Interfaces:**
- Consumes: target names exactly as defined in Tasks 1–2.

- [ ] **Step 1: Create `docs/CLI.md`**

Exact content (PT-BR, matching the README's language):

```markdown
# Comandos sem make

O [`Makefile` na raiz do repositório](../Makefile) é apenas um atalho — cada alvo executa os comandos crus abaixo. Use esta tabela se preferir (ou precisar) rodar sem `make`.

Todos os comandos crus são executados de dentro da pasta `aposta/`.

| Alvo make | Comando(s) cru(s) | O que faz |
|---|---|---|
| `make install` | `npm install` e `npx playwright install chromium` | Instala dependências e o Chromium do Playwright. |
| `make config` | `cp -n .env.example .env`, `chmod 600 .env`, `cp -n config.example.json config.json` | Cria os arquivos de configuração a partir dos exemplos (nunca sobrescreve os existentes). |
| `make build` | `npm run build` | Compila o TypeScript (tsc). |
| `make all` | os três acima, em ordem | Clone novo → pronto para o dry-run. |
| `make dry-run` | `node dist/index.js bet --dry-run` | Roda o fluxo inteiro **parando antes do pagamento** (valida seletores sem apostar). |
| `make bet` | `node dist/index.js bet` | Aposta **real**: pede confirmação "SIM", o CVV (se não estiver no `.env`), paga e salva o comprovante. |
| `make comprovante` | `node dist/index.js comprovante` | Re-salva o comprovante (screenshot) da compra mais recente. |
| `make history` | `node dist/index.js history` | Lista as apostas registradas localmente. |
| `make setup` | `node dist/index.js setup` | Mostra as instruções de configuração inicial. |
| `make test` | `npm test` | Roda os 18 testes (Vitest) das partes puras. |

`make` sem argumentos (na raiz do repositório) lista todos os alvos disponíveis.
```

- [ ] **Step 2: Rewrite the README `## Instalação` section**

Replace the current code block under `## Instalação`:

~~~markdown
```bash
git clone https://github.com/lucasbemo/aposta-caixa.git
cd aposta-caixa/aposta
npm install
npx playwright install chromium
npm run build
```
~~~

with:

~~~markdown
```bash
git clone https://github.com/lucasbemo/aposta-caixa.git
cd aposta-caixa
make install
make build
```

Prefere rodar sem `make`? Os comandos equivalentes estão em [docs/CLI.md](docs/CLI.md).
~~~

- [ ] **Step 3: Rewrite the README `## Configuração` opening**

Replace:

~~~markdown
Copie o arquivo de exemplo e restrinja a permissão do arquivo de segredos:

```bash
cp .env.example .env
chmod 600 .env
```
~~~

with:

~~~markdown
Crie os arquivos de configuração a partir dos exemplos (o `.env` já sai com permissão `600`; nada é sobrescrito se os arquivos já existirem):

```bash
make config
```
~~~

Then delete the now-redundant second copy block later in the same section:

~~~markdown
Copie `config.example.json` para `config.json` e ajuste:

```bash
cp config.example.json config.json
```
~~~

replacing it with the single line:

```markdown
No `config.json`, ajuste:
```

(The `defaultCardLast4` / `maxAmountPerRun` / `otpPollTimeoutSec` bullet list and the security warning below it stay unchanged.)

- [ ] **Step 4: Rewrite the README `## Uso` section**

Replace everything from the line `Todos os comandos abaixo são executados de dentro da pasta \`aposta/\`:` through the end of the 5-row command table (keep the `Exemplo de saída` block that follows) with:

```markdown
Todos os alvos são executados com `make`, a partir da raiz do repositório:

| Comando | O que faz |
|---|---|
| `make dry-run` | Roda o fluxo inteiro **parando antes do pagamento** (valida seletores sem apostar). |
| `make bet` | Aposta **real**: pede confirmação "SIM", o CVV (se não estiver no `.env`), paga e salva o comprovante. |
| `make comprovante` | Re-salva o comprovante (screenshot) da compra mais recente. |
| `make history` | Lista as apostas registradas localmente. |
| `make setup` | Mostra as instruções de configuração inicial. |

`make` sem argumentos lista todos os alvos (incluindo `install`, `config`, `build`, `all` e `test`). Os comandos `node` equivalentes estão em [docs/CLI.md](docs/CLI.md).
```

In the `Exemplo de saída` line that follows, change `` (`bet --dry-run`) `` to `` (`make dry-run`) ``. In `## Desenvolvimento`, change `npm test` → `make test` and `npm run build` → `make build` in the fenced command block, keeping the comments on each line.

- [ ] **Step 5: Verify consistency**

Run: `grep -E '^[a-zA-Z_-]+:.*## ' Makefile | cut -d: -f1 | sort`
Expected: 11 targets — `help` plus the 10 that appear in the `docs/CLI.md` table.

Check: every `docs/CLI.md` link in README resolves (`ls docs/CLI.md`), and `grep -n 'node dist/index.js' README.md` matches only the mermaid diagram node (line ~34), nowhere else.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/CLI.md
git commit -m "docs: make README make-first; move raw CLI commands to docs/CLI.md"
```
