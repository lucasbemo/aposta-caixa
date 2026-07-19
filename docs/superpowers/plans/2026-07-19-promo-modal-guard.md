# Universal Blocking-Modal Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the automation detect and dismiss promotion/notification modals (tick "Não mostrar mais" + click "Fechar") on any page before acting, and die loudly with saved evidence when an unknown modal cannot be closed.

**Architecture:** Rework the existing `dismissBlockingModals()` in `aposta/src/flow.ts` in place: keep the known `#fecharModal*` ID pass, add a generic pass for visible `.modal.in` containers (checkbox tick + exact-text `Fechar`), and add an escalation path (Escape → evidence to `dom-dumps/` → `AbortBeforePayment`). New `promo` selector group in `selectors.ts`. Two new call sites in the login flow where promos appear.

**Tech Stack:** TypeScript 5 (strict, ESM, NodeNext), Playwright locators, Node 20, Vitest (existing suite only — `flow.ts` is live-validated per project policy).

**Spec:** `docs/superpowers/specs/2026-07-19-promo-modal-guard-design.md`

## Global Constraints

- The generic pass must NEVER click buttons named `Confirmar`, `Sim`, `Continuar`, or `Incluir no carrinho` — those remain exclusive to `clickVisibleModalConfirm()`. The only generic click target is exact text `Fechar`.
- Checkbox tick, clicks, and evidence writes are best-effort (`.catch(() => {})` / try-catch swallow) — a failed evidence write must NOT mask the abort.
- Abort message format (exact): `Modal desconhecido aberto — evidências em dom-dumps/modal_unknown_<timestamp>.*` where `<timestamp>` is `Date.now()`.
- Evidence files: `dom-dumps/modal_unknown_<timestamp>.txt` (output of `debugVisibleControls(page)`) and `dom-dumps/modal_unknown_<timestamp>.png` (full-page screenshot); `dom-dumps` resolved from CWD via `path.resolve('dom-dumps')`.
- `dismissBlockingModals` keeps its exported name; new signature `(page: Page, log?: Logger)` — existing call sites compile unchanged.
- No new unit tests for `flow.ts`/`selectors.ts` (project policy: unit tests cover pure modules only). Verification per task: `make build` clean and `make test` → 18/18. Live `make dry-run` is operator-only — never run it as part of implementation.
- No new dependencies.

---

### Task 1: Promo selectors + guard rewrite with escalation

**Files:**
- Modify: `aposta/src/selectors.ts` (add `promo` group after the `terms` group, ~line 18)
- Modify: `aposta/src/flow.ts:1` (add `fs` import) and `aposta/src/flow.ts:137-163` (replace `dismissBlockingModals`)

**Interfaces:**
- Consumes: existing `selectors` object, `sleep`, `AbortBeforePayment`, `Logger` type, and `debugVisibleControls(page): Promise<string>` (defined later in the same file — function declarations hoist, calling it from `dismissBlockingModals` is fine).
- Produces: `selectors.promo` (`modalContainer: '.modal.in'`, `backdrop: '.modal-backdrop.in'`, `closeButtonText: 'Fechar'`, `dontShowAgainLabel: /não mostrar mais/i`) and `dismissBlockingModals(page: Page, log?: Logger): Promise<void>` which now may throw `AbortBeforePayment`. Task 2 relies on exactly this signature.

- [ ] **Step 1: Add the `promo` selector group**

In `aposta/src/selectors.ts`, insert after the `terms` group (between the `},` on line 18 and `home: {` on line 20):

```ts
  // Promotion/notification modals (e.g. "LOTOFÁCIL DA INDEPENDÊNCIA") shown
  // mainly on home. No stable ids — detected generically by container class.
  // Design: docs/superpowers/specs/2026-07-19-promo-modal-guard-design.md
  promo: {
    modalContainer: '.modal.in',
    backdrop: '.modal-backdrop.in',
    closeButtonText: 'Fechar', // exact-match; never an affirmative button
    dontShowAgainLabel: /não mostrar mais/i, // "Não mostrar mais essa notificação"
  },
```

- [ ] **Step 2: Add the `fs` import to flow.ts**

At `aposta/src/flow.ts:1`, the file currently starts with:

```ts
import path from 'node:path';
```

Add directly above it:

```ts
import fs from 'node:fs';
```

- [ ] **Step 3: Replace `dismissBlockingModals`**

In `aposta/src/flow.ts`, replace the whole function AND its doc comment (currently lines 137–163, from `/**` above `Close blocking ALERT/INFO/ERROR modals` through the function's closing `}`) with:

```ts
/**
 * Close blocking modals before acting. Per round (up to 4, since closing one
 * can reveal another):
 *   1. Known close-button ids (#fecharModal*) — alert/info/error modals.
 *   2. Generic dismissable modals (promotions/notifications, no stable ids):
 *      tick "Não mostrar mais essa notificação" when present (persistent
 *      profile => suppresses repeats), then click the modal's exact-text
 *      "Fechar" button.
 * If a modal/backdrop is still visible afterwards: try Escape; if it survives,
 * save evidence to dom-dumps/ and throw AbortBeforePayment so the run dies
 * loudly BEFORE any bet action.
 * NEVER clicks affirmative buttons (Confirmar/Sim/Continuar/Incluir no
 * carrinho) — those belong to clickVisibleModalConfirm().
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
    const container = page.locator(`${selectors.promo.modalContainer}:visible`).first();
    if (await container.count()) {
      // Best-effort "Não mostrar mais" tick: labelled checkbox first, then
      // checkbox inside a matching <label>, then the container's single
      // visible checkbox when the text is present anywhere in it.
      const byLabel = container.getByLabel(selectors.promo.dontShowAgainLabel);
      const inLabel = container
        .locator('label')
        .filter({ hasText: selectors.promo.dontShowAgainLabel })
        .locator('input[type="checkbox"]');
      if (await byLabel.count()) {
        await byLabel.first().check().catch(() => {});
      } else if (await inLabel.count()) {
        await inLabel.first().check().catch(() => {});
      } else if (await container.getByText(selectors.promo.dontShowAgainLabel).count()) {
        const cb = container.locator('input[type="checkbox"]:visible');
        if ((await cb.count()) === 1) await cb.first().check().catch(() => {});
      }

      const fecharButton = container.getByRole('button', {
        name: selectors.promo.closeButtonText,
        exact: true,
      });
      const fecharText = container.getByText(selectors.promo.closeButtonText, { exact: true });
      if (await fecharButton.count()) {
        await fecharButton.first().click().catch(() => {});
        await sleep(700);
        log?.info('Modal de promoção/notificação fechado.');
        closedAny = true;
      } else if (await fecharText.count()) {
        await fecharText.first().click().catch(() => {});
        await sleep(700);
        log?.info('Modal de promoção/notificação fechado.');
        closedAny = true;
      }
    }

    if (!closedAny) break;
  }

  // Escalation: something is still blocking and we don't know how to close it.
  const blocking = page.locator(
    `${selectors.promo.modalContainer}:visible, ${selectors.promo.backdrop}:visible`,
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

- [ ] **Step 4: Verify build fails/passes as the compiler check**

Run: `make build`
Expected: PASS (tsc clean, exit 0). If it fails, fix type errors before proceeding — common mistakes: missing `fs` import, `getByText` regex vs string (both are accepted by Playwright's types).

- [ ] **Step 5: Run the test suite**

Run: `make test`
Expected: 18 passed (18), exit 0 — this change must not affect the pure modules.

- [ ] **Step 6: Commit**

```bash
git add aposta/src/selectors.ts aposta/src/flow.ts
git commit -m "feat: generic promo/notification modal dismissal with evidence-and-abort fallback"
```

---

### Task 2: Guard call sites in the login flow

**Files:**
- Modify: `aposta/src/flow.ts` — function `login()` (currently starts ~line 59) and function `submitOtpAndPassword()` (currently ends ~line 135)

**Interfaces:**
- Consumes: `dismissBlockingModals(page: Page, log?: Logger): Promise<void>` from Task 1 (may throw `AbortBeforePayment`; callers in `index.ts` already handle that error class — do not add new handling).
- Produces: no new exports; behavior change only.

- [ ] **Step 1: Guard the home page inside `login()`**

In `aposta/src/flow.ts`, `login()` currently reads:

```ts
  await page.goto(CAIXA_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(2500);
  await acceptTermsIfPresent(page, log);

  // Persistent profile may still be logged in — skip the whole login if so.
```

Insert one call after `acceptTermsIfPresent`, so it reads:

```ts
  await page.goto(CAIXA_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page, log); // promos pop on home (logged in OR out) and block all clicks

  // Persistent profile may still be logged in — skip the whole login if so.
```

This single call covers BOTH spec call sites on the home page for `login()`: it runs before the logged-in check (the spec's `ALREADY` path — the guard executes on the same home page right before `return 'ALREADY'` is reached) and it also unblocks the logged-out home so the `Acessar` click can't be intercepted.

- [ ] **Step 2: Guard the post-login home at the end of `submitOtpAndPassword()`**

The function currently ends:

```ts
  await page.waitForSelector(selectors.home.loggedInIndicator, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Não confirmei o login (indicador "Minha Conta" ausente).');
  });
  log.step('login-complete', 'ok');
}
```

Change the ending to:

```ts
  await page.waitForSelector(selectors.home.loggedInIndicator, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Não confirmei o login (indicador "Minha Conta" ausente).');
  });
  await dismissBlockingModals(page, log); // fresh-login home is where promo modals appear most
  log.step('login-complete', 'ok');
}
```

- [ ] **Step 3: Verify build**

Run: `make build`
Expected: PASS (tsc clean, exit 0).

- [ ] **Step 4: Run the test suite**

Run: `make test`
Expected: 18 passed (18), exit 0.

- [ ] **Step 5: Commit**

```bash
git add aposta/src/flow.ts
git commit -m "feat: dismiss blocking modals on home before and after login"
```

---

## Post-plan verification (operator-only — NOT part of any task)

With the promotion currently active on the site, the user runs `make dry-run`
once and expects: promo modal ticked + closed on home, `[step]` log lines
proceeding through `login`/`otp`/`clear-cart`/`checkout-ready` as before, and
no `Modal desconhecido` abort. If the abort fires, `dom-dumps/modal_unknown_*`
holds the selector evidence for a follow-up.
