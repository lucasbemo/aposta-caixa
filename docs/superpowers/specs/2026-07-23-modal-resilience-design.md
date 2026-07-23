# Modal resilience: late modals + action-level fallback — design

**Date:** 2026-07-23
**Status:** approved by Lucas

## Problem

On 2026-07-23 a live `bet` run died on the Carrinhos Favoritos page: a
notification/promo modal appeared *after* the page-entry guard had already run,
and the include-cart click failed with Playwright's generic 30s timeout
("element intercepts pointer events"). The intercepting element was:

```
<div class="modal-notificacao-container ng-scope"
     ng-if="usuarioLogado.loggedInSistema && notificacaoNaoVisualizada !== undefined && temParametrosSimulacao()">
```

rendered inside `ui-view="header-content"`. Two distinct defects:

1. **Guard is blind to this container.** `dismissBlockingModals()` only knows
   `.modal.in` (plus the fixed `#fecharModal*` ids). `.modal-notificacao-container`
   is neither closed by the generic pass nor detected by the escalation check,
   so the run dies with a raw Playwright timeout instead of the guard's
   evidence-and-abort path.
2. **No timing resilience.** The guard runs once per page entry
   (`sleep(2500)` + guard). A modal that appears later escapes it, and no
   subsequent action has a fallback when it fails due to interception.

## Decisions made during brainstorming

- **Approach A + C combined** (chosen by Lucas): action-level
  retry-with-guard fallback (A) plus a longer page-entry watch window (C).
- **Rejected: background watchdog** — could race the intentional
  confirmation modals (clear-cart, CVV payment) and close them at the wrong
  moment. (Same rejection as the 2026-07-19 design.)
- **Rejected: entry-window-only (C alone)** — does not cover a modal that
  appears mid-page while actions are being performed, which is exactly what
  happened.
- The payment CVV "Confirmar" click stays single-shot, never retried, and is
  explicitly excluded from any retry wrapper.

## Design

### 1. Selectors (`aposta/src/selectors.ts`)

Add to the `promo` group:

- `notificationContainer: '.modal-notificacao-container'`

The container has no stable id; the class is the identifier. Everywhere the
guard treats `.modal.in` as a blocking modal — generic dismissal pass and
escalation detection — it now also treats `.modal-notificacao-container`.

### 2. Guard (`dismissBlockingModals` in `aposta/src/flow.ts`)

Same structure as today (up to 4 rounds, known `#fecharModal*` ids first).
The generic pass iterates over both container selectors
(`.modal.in:visible`, `.modal-notificacao-container:visible`), applying the
existing recipe per container: best-effort tick of the "Não mostrar mais"
checkbox, then click that container's visible exact-text "Fechar" button.

Unchanged invariants:

- NEVER clicks affirmative buttons (Confirmar/Sim/Continuar/Incluir no
  carrinho) — those remain exclusive to `clickVisibleModalConfirm()`.
- Escalation path (Escape → evidence to `dom-dumps/` → `AbortBeforePayment`)
  is unchanged in behavior, but its visibility check now includes the
  notification container, so an uncloseable notification modal dies loudly
  with evidence instead of a raw Playwright timeout.

### 3. Action-level fallback: `clickWithModalGuard` (part A)

New helper in `aposta/src/flow.ts`:

```ts
clickWithModalGuard(page, locator, log?, opts?)
// opts defaults: { timeout: 8_000, attempts: 3 }
```

Behavior: attempt `locator.click({ timeout })`; on failure (typically
"intercepts pointer events"), run `dismissBlockingModals(page, log)` and
retry. After the last failed attempt, rethrow the original click error. If
the guard itself escalates (unknown modal), its `AbortBeforePayment`
propagates — that is the preferred failure mode.

Applied to these logged-in-site actions:

- "Limpar carrinho" button (`clearCart`)
- include-favorite-cart icon (`selectCarrinhoFavoritoAndCheckout`)
- "Ir para pagamento" button (`selectCarrinhoFavoritoAndCheckout`)
- card cell click (`selectCardByLast4`)
- "Continuar" `#pay` button in `payAndConfirm` — safe to retry: it only
  opens the CVV popup; re-opening is harmless
- newest-purchase "Detalhamento da compra" link (`saveComprovante`)

Explicitly NOT wrapped:

- The CVV "Confirmar" click in `payAndConfirm` — single-shot, never retried.
- Keycloak login steps (CPF, OTP, password) — different domain, the
  `usuarioLogado.loggedInSistema` ng-if shows promos only render on the
  logged-in silce-web site.
- `clickVisibleModalConfirm()` internals — unchanged.

### 4. Page-entry watch window: `settleAndGuard` (part C)

New helper in `aposta/src/flow.ts` replacing the repeated
`sleep(2500) → acceptTermsIfPresent → dismissBlockingModals` trio at each
page entry:

```ts
settleAndGuard(page, log)
```

Behavior: initial 2.5s settle + `acceptTermsIfPresent` + full
`dismissBlockingModals` (exactly today's behavior), then **2 extra
re-checks ~2s apart**. Each re-check is a cheap visible-container count
(`.modal.in:visible`, `.modal-notificacao-container:visible`, backdrop);
the full guard runs only when something is visible. Cost: ~+4s per page
entry, covering modals that take up to ~7s to appear. Later-than-that
modals are covered by part 3.

Call sites converted to `settleAndGuard`: post-goto blocks in `login`,
`clearCart`, `selectCarrinhoFavoritoAndCheckout` (favoritos page and cart
page), the post-payment-navigation settle, and `saveComprovante`. The
post-login guard call in `submitOtpAndPassword` (no goto there, so no
terms/settle needed) runs `dismissBlockingModals` followed by the same
2-re-check loop — fresh-login home is where promos appear most.

## Error handling

- Unchanged policy: everything pre-payment aborts via `AbortBeforePayment`;
  evidence writes are best-effort and never mask the abort.
- `clickWithModalGuard` rethrows the final click error so failures keep
  their actionable Playwright call log; guard escalation takes precedence
  when it fires.

## Testing

`flow.ts` is Playwright-bound and validated live (project policy: unit
tests cover pure modules only). Verification bar:

- `make test` stays 18/18; `make build` clean.
- Live validation by the operator: `make dry-run` while the notification is
  still active on the account — expect the notification modal to be closed
  (at page entry or via click fallback) and the flow to reach
  checkout-ready.

## Out of scope

- No background watchdog / continuous polling.
- No changes to `clickVisibleModalConfirm()`, the CVV confirm click, CLI
  commands, or docs beyond what the change itself requires.
- No attempt to enumerate campaign-specific selectors for the notification
  modal's content.
