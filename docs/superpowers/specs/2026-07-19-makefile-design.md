# Makefile for README commands — design

**Date:** 2026-07-19
**Status:** approved by Lucas

## Goal

A single `Makefile` at the repo root that exposes every command documented in
`README.md`, so the whole lifecycle (install → config → build → run → test) is
runnable as `make <target>` from anywhere in the repo, without `cd aposta/`.

## Decisions made during brainstorming

- **Location:** repo root (`/Makefile`). Every recipe executes inside `aposta/`
  via `cd $(APP) && <command>`, where `APP := aposta`.
- **Real-money `bet`:** plain target, no extra Makefile gate. The CLI already
  enforces its own "SIM" confirmation and the `maxAmountPerRun` guardrail.
- **Approach:** flat Makefile mirroring the README 1:1 with light dependency
  chaining (rejected: npm-scripts-only wrapper; full file-based make
  dependencies — overkill for a 5-command personal CLI).

## Targets

Default goal is `help`.

| Target | Recipe (inside `aposta/`) | Notes |
|---|---|---|
| `help` | grep-based self-documenting listing | Default when running bare `make`; every target carries a `## description` comment |
| `install` | `npm install` && `npx playwright install chromium` | |
| `config` | `cp -n .env.example .env`; `chmod 600 .env`; `cp -n config.example.json config.json` | `cp -n` never overwrites existing real `.env`/`config.json`; safe no-op on a configured checkout |
| `build` | `npm run build` | tsc |
| `all` | depends on `install config build` | Fresh clone → ready to `make dry-run` |
| `dry-run` | `node dist/index.js bet --dry-run` | Requires prior build (see error handling) |
| `bet` | `node dist/index.js bet` | Real payment; CLI's own SIM gate applies |
| `comprovante` | `node dist/index.js comprovante` | |
| `history` | `node dist/index.js history` | |
| `setup` | `node dist/index.js setup` | |
| `test` | `npm test` | Vitest |

All targets are `.PHONY` (no file outputs tracked by make).

## Error handling

Run targets (`dry-run`, `bet`, `comprovante`, `history`, `setup`) do **not**
rebuild automatically — chaining tsc before every run adds latency. Instead,
each first checks that `aposta/dist/index.js` exists and fails with the message
`dist/index.js not found — run 'make build' first` rather than a raw node
error. `make config` failing because `.env.example` is missing surfaces cp's
own error, which is clear enough.

## Verification

- `make help` lists all targets with descriptions.
- `make test` passes (18 Vitest tests).
- `make build` compiles.
- `make dry-run` reaches at least browser launch (no real bet is placed while
  verifying; `make bet` is never executed as part of verification).
- `make config` on the current configured checkout leaves the existing `.env`
  and `config.json` untouched.

## Out of scope

- No changes to `package.json` scripts, the CLI, or the README command set
  itself (a README section documenting `make` usage may be added during
  implementation, but command semantics stay identical).
- No file-based incremental build tracking in make.
