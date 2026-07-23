# Modal Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bet flow resilient to late-appearing promo/notification modals: teach the guard the `.modal-notificacao-container` class, add a modal-aware click retry wrapper, and extend the page-entry modal watch window.

**Architecture:** All changes live in `aposta/src/selectors.ts` (one new selector) and `aposta/src/flow.ts` (guard update + two new helpers + call-site conversions). No new files, no new dependencies.

**Tech Stack:** TypeScript (ESM), Playwright. Build with `make build`, tests with `make test` (both from repo root).

**Spec:** `docs/superpowers/specs/2026-07-23-modal-resilience-design.md`

## Global Constraints

- Project test policy: unit tests cover PURE modules only; `flow.ts` is Playwright-bound and validated live by the operator. **No task in this plan adds unit tests** — the verification bar per task is `make build` clean and `make test` still passing 18/18.
- The guard (`dismissBlockingModals`) must NEVER click affirmative buttons (`Confirmar`, `Sim`, `Continuar`, `Incluir no carrinho`) — those belong exclusively to `clickVisibleModalConfirm()`.
- The CVV "Confirmar" payment click (`selectors.payment.confirmButton` in `payAndConfirm`) stays single-shot — never wrapped, never retried.
- Keycloak login steps (CPF, OTP, password) are NOT wrapped — promos only render on the logged-in silce-web site.
- Best-effort idiom: swallowed errors use `.catch(() => {})`, same as the rest of `flow.ts`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Notification-container selector

**Files:**
- Modify: `aposta/src/selectors.ts:20-28` (the `promo` group)

**Interfaces:**
- Produces: `selectors.promo.notificationContainer: '.modal-notificacao-container'` — consumed by Tasks 2 and 4.

- [ ] **Step 1: Add the selector**

In `aposta/src/selectors.ts`, replace the `promo` group comment + object:

```ts
  // Promotion/notification modals (e.g. "LOTOFÁCIL DA INDEPENDÊNCIA") shown
  // mainly on home. No stable ids — detected generically by container class.
  // Two container classes exist: Bootstrap `.modal.in` dialogs, and the
  // header-rendered `.modal-notificacao-container` (ng-if on
  // notificacaoNaoVisualizada — seen blocking Carrinhos Favoritos 2026-07-23).
  // Designs: docs/superpowers/specs/2026-07-19-promo-modal-guard-design.md
  //          docs/superpowers/specs/2026-07-23-modal-resilience-design.md
  promo: {
    modalContainer: '.modal.in',
    notificationContainer: '.modal-notificacao-container',
    backdrop: '.modal-backdrop.in',
    closeButtonText: 'Fechar', // exact-match; never an affirmative button
    dontShowAgainLabel: /não mostrar mais/i, // "Não mostrar mais essa notificação"
  },
```

- [ ] **Step 2: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 18/18 tests pass (selector addition is inert until Task 2).

- [ ] **Step 3: Commit**

```bash
git add aposta/src/selectors.ts
git commit -m "feat: add notification-modal container selector

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Guard sees both containers

**Files:**
- Modify: `aposta/src/flow.ts` — the `dismissBlockingModals` function (currently lines 140-248)

**Interfaces:**
- Consumes: `selectors.promo.notificationContainer` (Task 1).
- Produces: `dismissBlockingModals(page, log?)` — same signature as today; now dismisses and escalates on `.modal-notificacao-container` too.

- [ ] **Step 1: Replace `dismissBlockingModals` with the two-container version**

Replace the entire function (docstring included) with:

```ts
/**
 * Close blocking modals before acting. Per round (up to 4, since closing one
 * can reveal another):
 *   1. Known close-button ids (#fecharModal*) — alert/info/error modals.
 *   2. Generic dismissable modals (promotions/notifications, no stable ids),
 *      for BOTH container classes (.modal.in and .modal-notificacao-container):
 *      tick "Não mostrar mais essa notificação" when present (persistent
 *      profile => suppresses repeats), then click the modal's exact-text
 *      "Fechar" button.
 * If a modal/backdrop is still visible afterwards: try Escape; if it survives,
 * save evidence to dom-dumps/ and throw AbortBeforePayment so the run dies
 * loudly BEFORE any bet action.
 * NEVER clicks affirmative buttons (Confirmar/Sim/Continuar/Incluir no
 * carrinho) — those belong to clickVisibleModalConfirm().
 * Also called at the post-payment call sites (saveComprovante), where it may
 * still throw AbortBeforePayment; those callers catch locally (see index.ts).
 */
export async function dismissBlockingModals(page: Page, log?: Logger): Promise<void> {
  const closeIds = [
    '#fecharModalAlerta',
    '#fecharModalAlertaSobreModal',
    '#fecharModalErro',
    '#fecharModalInfo',
  ];
  for (let round = 0; round < 4; round++) {
    let closedAny = false;
    for (const id of closeIds) {
      const b = page.locator(`${id}:visible`);
      if (await b.count()) {
        await b.first().click().catch(() => {});
        await sleep(700);
        closedAny = true;
      }
    }

    // Generic pass: visible promo/notification modal with a "Fechar" button.
    // Two container classes, no stable ids (see selectors.promo).
    for (const containerSel of [
      selectors.promo.modalContainer,
      selectors.promo.notificationContainer,
    ]) {
      const container = page.locator(`${containerSel}:visible`).first();
      if (!(await container.count())) continue;
      // Best-effort "Não mostrar mais" tick: labelled checkbox first, then
      // checkbox inside a matching <label>, then the container's single
      // visible checkbox when the text is present anywhere in it. Bounded
      // timeout (not a visibility filter — styled checkboxes often hide the
      // input itself).
      const byLabel = container.getByLabel(selectors.promo.dontShowAgainLabel);
      const inLabel = container
        .locator('label')
        .filter({ hasText: selectors.promo.dontShowAgainLabel })
        .locator('input[type="checkbox"]');
      if (await byLabel.count()) {
        await byLabel.first().check({ timeout: 2500 }).catch(() => {});
      } else if (await inLabel.count()) {
        await inLabel.first().check({ timeout: 2500 }).catch(() => {});
      } else if (await container.getByText(selectors.promo.dontShowAgainLabel).count()) {
        const cb = container.locator('input[type="checkbox"]:visible');
        if ((await cb.count()) === 1) await cb.first().check({ timeout: 2500 }).catch(() => {});
      }

      // "Fechar" button: like clickVisibleModalConfirm() above, the site
      // pre-renders hidden duplicate modal controls, so getByRole/getByText
      // counts include hidden nodes. Iterate and pick the first VISIBLE
      // match, with a bounded click timeout so a hidden match can never
      // stall a round.
      for (const candidate of [
        container.getByRole('button', { name: selectors.promo.closeButtonText, exact: true }),
        container.getByText(selectors.promo.closeButtonText, { exact: true }),
      ]) {
        const n = await candidate.count();
        let closedModal = false;
        for (let i = 0; i < n; i++) {
          const b = candidate.nth(i);
          if (await b.isVisible().catch(() => false)) {
            await b.click({ timeout: 2500 }).catch(() => {});
            await sleep(700);
            log?.info('Modal de promoção/notificação fechado.');
            closedAny = true;
            closedModal = true;
            break;
          }
        }
        if (closedModal) break;
      }
    }

    if (!closedAny) break;
  }

  // Escalation: something is still blocking and we don't know how to close it.
  const blocking = page.locator(
    `${selectors.promo.modalContainer}:visible, ${selectors.promo.notificationContainer}:visible, ${selectors.promo.backdrop}:visible`,
  );
  if (!(await blocking.count())) return;
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(1000);
  if (!(await blocking.count())) return;

  const ts = Date.now();
  const dumpDir = path.resolve('dom-dumps');
  const base = path.join(dumpDir, `modal_unknown_${ts}`);
  try {
    fs.mkdirSync(dumpDir, { recursive: true });
    fs.writeFileSync(`${base}.txt`, await debugVisibleControls(page));
  } catch {
    // evidence is best-effort; never mask the abort
  }
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
  log?.info(`Modal desconhecido aberto — evidências em ${base}.*`);
  throw new AbortBeforePayment(
    `Modal desconhecido aberto — evidências em dom-dumps/modal_unknown_${ts}.*`,
  );
}
```

The only changes vs. today: the docstring's item 2 mentions both containers; the generic pass is wrapped in a `for (const containerSel of [...])` loop (inner body unchanged, `continue` instead of an `if` wrapper); and the escalation locator includes `notificationContainer`.

- [ ] **Step 2: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 18/18 tests pass.

- [ ] **Step 3: Commit**

```bash
git add aposta/src/flow.ts
git commit -m "feat: guard dismisses and escalates on .modal-notificacao-container

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `clickWithModalGuard` — modal-aware click retry

**Files:**
- Modify: `aposta/src/flow.ts` — add helper after `dismissBlockingModals`; convert 6 click call sites; extend the playwright type import (line 3)

**Interfaces:**
- Consumes: `dismissBlockingModals(page, log?)` (Task 2).
- Produces: `clickWithModalGuard(page: Page, target: Locator, log?: Logger, opts?: { timeout?: number; attempts?: number }): Promise<void>` — defaults `timeout: 8_000`, `attempts: 3`. Throws the last click error, or `AbortBeforePayment` if the guard escalates.

- [ ] **Step 1: Extend the playwright import**

Line 3, replace:

```ts
import { type Page } from 'playwright';
```

with:

```ts
import { type Page, type Locator } from 'playwright';
```

- [ ] **Step 2: Add the helper**

Insert immediately after the closing brace of `dismissBlockingModals`:

```ts
/**
 * Click with a modal-aware fallback: attempt the click with a SHORT timeout
 * (default 8s instead of Playwright's 30s); on failure — typically a promo/
 * notification modal intercepting pointer events — close blocking modals and
 * retry. After the last failed attempt, rethrow the original click error so
 * the Playwright call log stays actionable; if the guard escalates on an
 * unknown modal, its AbortBeforePayment propagates instead (preferred).
 * NEVER use for the CVV "Confirmar" payment click — that stays single-shot.
 */
export async function clickWithModalGuard(
  page: Page,
  target: Locator,
  log?: Logger,
  opts: { timeout?: number; attempts?: number } = {},
): Promise<void> {
  const { timeout = 8_000, attempts = 3 } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await target.click({ timeout });
      return;
    } catch (e) {
      lastError = e;
      log?.info(`Clique falhou (tentativa ${attempt}/${attempts}) — verificando modais bloqueantes.`);
      await dismissBlockingModals(page, log);
    }
  }
  throw lastError;
}
```

- [ ] **Step 3: Convert the 6 call sites**

All in `aposta/src/flow.ts`. Old → new, exact strings:

**(a) `clearCart` — "Limpar carrinho":**

```ts
    await clear.click().catch(() => {});
```
→
```ts
    await clickWithModalGuard(page, clear, log);
```

(Behavior change is intentional: a click still blocked after 3 guard-assisted attempts now aborts the run instead of being silently swallowed.)

**(b+c) `selectCarrinhoFavoritoAndCheckout` — include-favorite-cart icon (both branches):**

```ts
  if (matched === 1) {
    await target.locator(selectors.carrinhos.includeIcon).click();
  } else if (matched === 0 && (await rows.count()) === 1) {
    await rows.locator(selectors.carrinhos.includeIcon).click();
```
→
```ts
  if (matched === 1) {
    await clickWithModalGuard(page, target.locator(selectors.carrinhos.includeIcon), log);
  } else if (matched === 0 && (await rows.count()) === 1) {
    await clickWithModalGuard(page, rows.locator(selectors.carrinhos.includeIcon), log);
```

**(d) `selectCarrinhoFavoritoAndCheckout` — "Ir para pagamento":**

```ts
  await page.click(selectors.carrinho.goToPaymentButton);
```
→
```ts
  await clickWithModalGuard(page, page.locator(selectors.carrinho.goToPaymentButton), log);
```

**(e) `selectCardByLast4` — card cell (inside the polling loop):**

```ts
      await cell.click().catch(() => {});
```
→
```ts
      await clickWithModalGuard(page, cell);
```

(No `log` in this function's signature — the optional param is simply omitted. Errors now propagate: a cell that is visible but unclickable after 3 guard-assisted attempts should abort, not silently return.)

**(f) `payAndConfirm` — "Continuar" `#pay` (retry-safe: only opens the CVV popup):**

```ts
  await page.click(selectors.checkout.proceedButton); // "Continuar" -> opens CVV popup
```
→
```ts
  await clickWithModalGuard(page, page.locator(selectors.checkout.proceedButton), log); // "Continuar" -> opens CVV popup (retry-safe)
```

**(g) `saveComprovante` — "Detalhamento da compra" link:**

```ts
  await link.click();
```
→
```ts
  await clickWithModalGuard(page, link, log);
```

Do NOT touch: the CVV confirm click (`page.locator(`${selectors.payment.confirmButton}:visible`).first().click()`), anything in `clickVisibleModalConfirm()`, or any Keycloak click in `login`/`submitOtpAndPassword`.

- [ ] **Step 4: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 18/18 tests pass.

- [ ] **Step 5: Commit**

```bash
git add aposta/src/flow.ts
git commit -m "feat: clickWithModalGuard — modal-aware retry for logged-in-site clicks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `settleAndGuard` — page-entry watch window

**Files:**
- Modify: `aposta/src/flow.ts` — add two helpers after `clickWithModalGuard`; convert 7 page-entry blocks

**Interfaces:**
- Consumes: `dismissBlockingModals`, `acceptTermsIfPresent`, `selectors.promo.notificationContainer`.
- Produces (module-private, not exported): `settleAndGuard(page: Page, log: Logger): Promise<void>` and `recheckLateModals(page: Page, log?: Logger): Promise<void>`.

- [ ] **Step 1: Add the helpers**

Insert immediately after the closing brace of `clickWithModalGuard`:

```ts
/**
 * Page-entry settle + modal watch window: the historical trio (2.5s settle,
 * terms, full guard), then 2 extra re-checks ~2s apart — promo/notification
 * modals can take longer than 2.5s to render (seen live 2026-07-23). Each
 * re-check is a cheap visible-container count; the full guard runs only when
 * something actually appeared. Cost: ~+4s per page entry; modals later than
 * ~7s are covered by clickWithModalGuard at action time.
 */
async function settleAndGuard(page: Page, log: Logger): Promise<void> {
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page, log);
  await recheckLateModals(page, log);
}

/** The 2-re-check tail of settleAndGuard, reusable where there is no goto. */
async function recheckLateModals(page: Page, log?: Logger): Promise<void> {
  const blocking = page.locator(
    `${selectors.promo.modalContainer}:visible, ${selectors.promo.notificationContainer}:visible, ${selectors.promo.backdrop}:visible`,
  );
  for (let i = 0; i < 2; i++) {
    await sleep(2000);
    if (await blocking.count()) {
      log?.info('Modal tardio detectado — fechando.');
      await dismissBlockingModals(page, log);
    }
  }
}
```

- [ ] **Step 2: Convert the 7 page-entry blocks**

All in `aposta/src/flow.ts`. Old → new, exact strings:

**(a) `login` — after `page.goto(CAIXA_URL, ...)`:**

```ts
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page, log); // promos pop on home (logged in OR out) and block all clicks
```
→
```ts
  await settleAndGuard(page, log); // promos pop on home (logged in OR out) and block all clicks
```

**(b) `submitOtpAndPassword` — after the logged-in indicator check (no goto, so no settle/terms — guard + re-check tail only):**

```ts
  await dismissBlockingModals(page, log); // fresh-login home is where promo modals appear most
```
→
```ts
  await dismissBlockingModals(page, log); // fresh-login home is where promo modals appear most
  await recheckLateModals(page, log); // notification modal can render seconds later
```

**(c) `clearCart` — after `page.goto(CARRINHO_URL, ...)`:**

```ts
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page); // "existem apostas idênticas" alert blocks clicks
```
→
```ts
  await settleAndGuard(page, log); // "existem apostas idênticas" alert blocks clicks
```

**(d) `selectCarrinhoFavoritoAndCheckout` — after `page.goto(CARRINHOS_FAVORITOS_URL, ...)`:**

```ts
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page);
  await page.waitForSelector(selectors.carrinhos.includeIcon, { timeout: 20_000 }).catch(() => {
```
→
```ts
  await settleAndGuard(page, log);
  await page.waitForSelector(selectors.carrinhos.includeIcon, { timeout: 20_000 }).catch(() => {
```

**(e) `selectCarrinhoFavoritoAndCheckout` — after the second `page.goto(CARRINHO_URL, ...)`:**

```ts
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page);
  await page.waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 }).catch(() => {
```
→
```ts
  await settleAndGuard(page, log);
  await page.waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 }).catch(() => {
```

**(f) `selectCarrinhoFavoritoAndCheckout` — after the payment-page `waitForURL`:**

```ts
  await sleep(2500);
  await dismissBlockingModals(page);
```
→
```ts
  await settleAndGuard(page, log);
```

(`acceptTermsIfPresent` was not called here before; it is best-effort and harmless on the payment page.)

**(g) `saveComprovante` — after `page.goto(COMPRAS_URL, ...)`:**

```ts
  await sleep(4000);
  await dismissBlockingModals(page);
```
→
```ts
  await settleAndGuard(page, log);
```

(The fixed 4s settle becomes 2.5s + a ~4s watch window — strictly longer coverage. The later `sleep(5000)` + `dismissBlockingModals(page)` after clicking the detalhamento link is a same-page transition, not a page entry: leave it unchanged.)

- [ ] **Step 3: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 18/18 tests pass.

- [ ] **Step 4: Commit**

```bash
git add aposta/src/flow.ts
git commit -m "feat: settleAndGuard — page-entry watch window for late modals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final verification (operator — not an agent task)

Live validation by Lucas, per project policy: run `make dry-run` while the
notification is still active on the account. Expected: the notification modal
is closed (at page entry via `settleAndGuard`, or at action time via
`clickWithModalGuard`), the log shows `Modal de promoção/notificação fechado.`
or `Modal tardio detectado — fechando.` when it fires, and the flow reaches
`checkout-ready`. If an uncloseable modal appears, the run must abort with
`Modal desconhecido aberto — evidências em dom-dumps/modal_unknown_<ts>.*`
instead of a raw Playwright 30s timeout.
