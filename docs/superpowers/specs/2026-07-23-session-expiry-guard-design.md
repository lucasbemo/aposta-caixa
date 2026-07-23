# Session-expiry guard (cached page, dead server session) — design

**Date:** 2026-07-23
**Status:** approved by Lucas

## Problem

Live run 2026-07-23: the persistent Chromium profile served the home page
from cache showing the logged-in menu ("Minha Conta"), so `login()` returned
`ALREADY` — but the server session was gone. The stale UI let the flow "act"
with no server effect (`clear-cart — ok` against a cached cart), and the run
finally died with the misleading abort
`Página de Carrinhos Favoritos não carregou (nenhum carrinho salvo?)`.

Observed behavior (Lucas): the cached initial page does NOT show "Acessar";
the header only re-renders to "Acessar" after a navigation/action makes the
SPA revalidate (its API calls fail) — so detection must watch a window and
diagnose failures, not sample once at page entry.

## Decisions made during brainstorming

- **Approach A (chosen): detect per page + auto re-login + resume once.**
  Rejected: detect-and-abort only (user must re-run); probe-only at start
  (no mid-run coverage, and the probe duplicates the navigation `clearCart`
  already does).
- **Re-login starts from the CURRENT page's "Acessar" link** — never by
  navigating back to the home page, which may serve the stale cached menu
  again.
- Detection signal: `selectors.home.loginLink` (`a#btnLogin`, "Acessar")
  visible on a page where the flow expects to be logged in.

## Design

### 1. Typed error + detector (`aposta/src/flow.ts`)

- `export class SessionExpired extends AbortBeforePayment {}` — unhandled
  instances still take the safe "abortado antes do pagamento" path.
- Module-private `throwIfSessionExpired(page)`: if the "Acessar" link is
  visible, throw
  `SessionExpired('Sessão expirada (página cacheada) — é preciso refazer o login.')`.

### 2. Detection windows

- `settleAndGuard(page, log, opts?: { checkSession?: boolean })` — default
  `true`. After the initial guard pass AND on each `recheckLateModals` tick
  (~2s apart, so the whole ~6.5s watch window is covered), run
  `throwIfSessionExpired`. `recheckLateModals` gets the same optional flag
  (default `true`).
- `login()`'s own `settleAndGuard` call passes `{ checkSession: false }` —
  being logged out on the home page is normal there. Every other call site
  keeps the default and inherits the protection.

### 3. Diagnosis before misleading aborts

In `selectCarrinhoFavoritoAndCheckout`, the two element-missing aborts
("Página de Carrinhos Favoritos não carregou (nenhum carrinho salvo?)" and
"Botão 'Ir para pagamento' não apareceu no carrinho (carrinho vazio?)") are
restructured to: on timeout, first `await throwIfSessionExpired(page)`, then
throw the original `AbortBeforePayment`. A dead session reports itself as a
dead session.

### 4. Login refactor + recovery entry point

- Extract from `login()` the Keycloak sequence (wait for visible "Acessar"
  on the CURRENT page → click → CPF → "Próximo" → email radio → "Receber
  código" → `log.step('login-request-code')`) into module-private
  `beginKeycloakLogin(page, secrets, log)`. `login()` calls it after its
  ALREADY check; behavior unchanged. (Its not-found abort message becomes
  'Botão "Acessar" não encontrado na página.' since it can run anywhere.)
- New export `reloginAfterSessionExpiry(page, secrets, timeoutSec, log,
  promptFallback)`: logs `Sessão expirada — refazendo login...`, then
  `beginKeycloakLogin` + `submitOtpAndPassword` (which already confirms the
  logged-in home and clears modals). Triggers a fresh OTP e-mail with the
  same manual-paste fallback as a normal login.

### 5. Resume-once orchestration (`aposta/src/index.ts`)

- `runBet`: the `selectCarrinhoFavoritoAndCheckout` call is wrapped — on
  the first `SessionExpired`, call `reloginAfterSessionExpiry` and retry
  the phase ONCE; a second `SessionExpired` (or any other error)
  propagates. The payment phase (`payAndConfirm`) is NOT retried —
  single-shot policy intact; expiry detected there aborts pre-payment with
  the correct message.
- `runComprovante`: same wrap around `saveComprovante`.
- `runBet`'s post-payment `saveComprovante` keeps its existing local catch
  (payment already made; fallback screenshot).

## Error handling

- `SessionExpired` inherits the safe pre-payment classification; the outer
  catch prints "Abortado com segurança antes do pagamento: Sessão
  expirada...". No change to the guard's evidence paths.

## Testing

Nothing new is pure — no new unit tests (suite stays 22/22; `make build`
clean). Live validation is opportunistic: the scenario depends on a stale
cache and cannot be reproduced on demand. On next occurrence the log must
show detection (`Sessão expirada — refazendo login...`), a fresh OTP login,
and the flow resuming; any normal run doubles as a no-regression check.

## Out of scope

- No retry of the payment phase; no changes to `payAndConfirm`,
  `clickVisibleModalConfirm`, `dismissBlockingModals` internals, or the
  guard's evidence paths.
- No cache-busting/reload strategies (the SPA revalidates on route change;
  detection + re-login covers the failure mode).
