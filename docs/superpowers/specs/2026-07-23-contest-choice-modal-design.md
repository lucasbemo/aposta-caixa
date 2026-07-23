# Contest-choice modal: pick the regular contest, never "Ambos" — design

**Date:** 2026-07-23
**Status:** approved by Lucas

## Problem

Live run 2026-07-23: after clicking the include-favorite-cart icon, the site
showed a modal (screenshot: `modal_bet_em_duas_modalidades.png`):

> "Existem 2 concursos abertos para a Lotofácil. Deseja incluir no carrinho
> qual concurso?" — radios: "Lotofácil da Independência" / "Lotofácil" /
> "Ambos" (pre-selected), buttons "Incluir no carrinho" / "Cancelar".

`clickVisibleModalConfirm()` clicked "Incluir no carrinho" with "Ambos" still
selected, duplicating every Lotofácil game in the cart (regular + special
contest). CAIXA shows this modal for any lottery with a special contest open
(Mega da Virada, Lotofácil da Independência, …), and since the favorite cart
mixes Mega-Sena and Lotofácil games, TWO such modals can appear in sequence.

Required behavior (Lucas): select the radio with the lottery's plain name
("Lotofácil", "Mega-Sena"), never "Ambos", then click "Incluir no carrinho".

## Decisions made during brainstorming

- **Approach A (chosen):** dedicated helper at the include-cart call site,
  before the existing `clickVisibleModalConfirm()`. Rejected: building the
  logic into `clickVisibleModalConfirm()` — it is the shared affirmative
  clicker (clear-cart, payment popup, …); changing it risks side effects.
- **Fail-safe:** if the helper detects the contest modal but cannot select a
  radio, it saves evidence and throws `AbortBeforePayment` — aborting beats
  silently confirming a duplicated cart. (`Cancelar` is not clicked; the run
  dies loudly pre-payment.)

## Design

### 1. Pure chooser: `chooseContestLabel(text, labels)` (`aposta/src/flow.ts`, exported)

Pure function, unit-testable per project policy:

- Trim labels; drop empties and any label equal to "Ambos" (case-insensitive).
- Extract the base lottery name from the modal text via
  `/para [ao] (.+?)[.?]/i` ("…abertos para a Lotofácil." → "Lotofácil").
- If a remaining label equals the base name (locale/accent-insensitive
  compare), return it.
- Fallback (text mangled or name not among labels): return the SHORTEST
  remaining label — the special contest is always "X da Y", strictly longer
  than the plain name.
- Return `null` when no candidate remains (caller escalates).

### 2. Playwright helper: `handleContestChoiceModals(page, log)` (module-private)

Called in `selectCarrinhoFavoritoAndCheckout` right after the include click's
`sleep(1200)` and BEFORE `clickVisibleModalConfirm()`. Up to 3 rounds:

1. Find a visible `selectors.promo.modalContainer` whose text matches
   `selectors.contestChoice.modalText` (`/concursos abertos/i`). None → return.
2. Read the modal's text and its radio labels (accessible name via
   `getByRole('radio')`; fallback: each `input[type="radio"]`'s
   `closest('label')` text via evaluate).
3. `chooseContestLabel(...)` picks the label; check the matching radio
   (`getByRole('radio', { name, exact })`, fallback: click the `label`
   filtered by that text). Verify something was actually selected.
4. Click the modal's visible exact-text "Incluir no carrinho" button
   (scoped to the modal, visible-filtered iteration like existing patterns),
   wait ~1.5s, loop — a second lottery's modal may follow.
5. If step 3 cannot select (no radios found / no label chosen / check
   failed): write evidence to `dom-dumps/contest_modal_<ts>.{txt,png}`
   (same conventions as the unknown-modal path) and throw
   `AbortBeforePayment('Modal de escolha de concurso não tratado — evidências …')`.

The blocking-modal guard is unaffected: it only clicks "Fechar"/known ids,
never radios or affirmatives, so it cannot mishandle this modal.

### 3. Selectors (`aposta/src/selectors.ts`)

New `contestChoice` group:

- `modalText: /concursos abertos/i`
- `includeButtonText: 'Incluir no carrinho'` (exact)

(The "Ambos" exclusion regex lives inside the pure `chooseContestLabel` — it
is part of the chooser's logic, not a DOM selector.)

## Error handling

- Radio ticking and button clicks bounded (2.5s timeouts) and best-effort in
  form, but the helper VERIFIES selection before confirming; failure path is
  evidence + `AbortBeforePayment` (never confirm with "Ambos" selected).
- Evidence writes best-effort; never mask the abort.

## Testing

- New unit tests for `chooseContestLabel` (pure): exact-name pick from real
  modal text; shortest-label fallback when text is mangled; "Ambos" never
  returned; `null` when only "Ambos" exists. Suite grows from 18 to 22.
- `make build` clean.
- Live validation by the operator: `make bet` (or dry-run) while a special
  contest is open — expect log "Concurso selecionado: <nome>" and exactly one
  contest per lottery in the cart.

## Out of scope

- No changes to `clickVisibleModalConfirm()`, the blocking-modal guard,
  payment flow, or CLI.
- No enumeration of specific special-contest names.
