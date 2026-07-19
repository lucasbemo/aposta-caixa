# Universal blocking-modal guard (promo modals) — design

**Date:** 2026-07-19
**Status:** approved by Lucas

## Problem

The Loterias CAIXA site shows promotion/notification modals (e.g. "LOTOFÁCIL
DA INDEPENDÊNCIA", screenshot provided by the user) — mainly on the home page
right after login, but potentially on any page. While such a modal is open,
the overlay intercepts all clicks and the automation cannot act. The current
`dismissBlockingModals()` in `aposta/src/flow.ts` only knows 4 fixed
close-button IDs (`#fecharModalAlerta`, `#fecharModalAlertaSobreModal`,
`#fecharModalErro`, `#fecharModalInfo`) and misses the promo modal. Its exact
DOM is not in `dom-dumps/` (captures predate the promotion), so the design
must not depend on a known ID.

## Decisions made during brainstorming

- **Dismissal:** tick the "Não mostrar mais essa notificação" checkbox when
  present (the Chromium profile is persistent, so this suppresses repeats),
  then click the modal's `Fechar` button. If there is no checkbox, just close.
- **Unknown modal fallback:** if no known close control exists, press
  Escape; if the modal survives, save evidence (DOM dump + screenshot) and
  abort the run with a clear message — always before any bet action.
- **Approach:** upgrade `dismissBlockingModals()` in place (rejected: a
  separate home-page-only `dismissPromoModal()` — promos can appear on other
  pages; rejected: a background auto-dismiss watchdog — it could race the
  intentional CVV/confirmation modals during payment).

## Design

### Guard behavior (`dismissBlockingModals(page, log?)` in `aposta/src/flow.ts`)

Same exported name and call style as today (optional `log` added). Up to 4
rounds; each round:

1. **Known IDs** (existing behavior, kept first): click each visible
   `#fecharModal*` button.
2. **Generic dismissable modal:** for a visible `.modal.in` container:
   - if it contains a checkbox whose accessible label/adjacent text matches
     `/não mostrar mais/i`, tick it (best-effort, errors swallowed);
   - click a visible button with exact text `Fechar` scoped to that
     container.

A round that closed nothing ends the loop. The generic pass must NEVER click
`Confirmar`, `Sim`, `Continuar` or `Incluir no carrinho` — those remain
exclusive to `clickVisibleModalConfirm()` so intentional confirmations
(clear-cart, CVV payment) cannot be swallowed.

### Escalation (unknown modal)

After the rounds, if a visible `.modal.in` or `.modal-backdrop.in` remains:

1. Press `Escape`, wait ~1s, re-check.
2. Still open → write evidence to `dom-dumps/` (resolved from CWD, same
   convention as `index.ts`): `modal_unknown_<timestamp>.txt` (the
   `debugVisibleControls()` output) and `modal_unknown_<timestamp>.png`
   (full-page screenshot), then throw
   `AbortBeforePayment('Modal desconhecido aberto — evidências em dom-dumps/modal_unknown_<timestamp>.*')`.

The run dies loudly before any bet action; the evidence lets the missing
selector be added later.

### Call sites

All existing `dismissBlockingModals` call sites stay. One addition: right
after login is confirmed on the home page — both the `ALREADY` path and the
fresh-login path (end of `submitOtpAndPassword`) — since that is where promos
appear.

### Selectors

New `promo` group in `aposta/src/selectors.ts`, so future site changes are
edited in one place:

- `modalContainer: '.modal.in'`
- `backdrop: '.modal-backdrop.in'`
- `closeButtonText: 'Fechar'` (exact match)
- `dontShowAgainLabel: /não mostrar mais/i`

## Error handling

- Checkbox tick and button clicks are best-effort (`.catch(() => {})`), same
  idiom as the rest of `flow.ts`.
- Evidence writes are best-effort; a failed write must not mask the abort —
  the `AbortBeforePayment` is thrown regardless.
- The guard never throws for modals it successfully closes; it only throws
  on the unknown-modal escalation path.

## Testing

`flow.ts` is Playwright-bound and validated live (project policy: unit tests
cover pure modules only). Verification bar:

- `make test` stays 18/18; `make build` clean.
- Live validation by the operator: `make dry-run` while the promotion is
  active — expect the promo modal ticked + closed on the home page and the
  flow to proceed to checkout-ready as before.

## Out of scope

- No changes to `clickVisibleModalConfirm()`, payment flow, CLI commands, or
  docs other than what the change itself requires.
- No background watchdog / continuous polling.
- No attempt to enumerate specific promo campaign selectors.
