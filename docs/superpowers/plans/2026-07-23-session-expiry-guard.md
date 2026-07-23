# Session-Expiry Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect the "cached page, dead server session" state (header re-renders "Acessar"), report it as `SessionExpired` instead of misleading errors, and auto re-login from the current page and resume the interrupted phase once.

**Architecture:** Detection lives in `aposta/src/flow.ts` (typed error, `throwIfSessionExpired`, hooks in `settleAndGuard`/`recheckLateModals` and in two abort diagnoses). Recovery is a login refactor (`beginKeycloakLogin`) plus an exported `reloginAfterSessionExpiry`, wired as a retry-once in `aposta/src/index.ts`.

**Tech Stack:** TypeScript (ESM), Playwright. Build `make build`, tests `make test` (repo root).

**Spec:** `docs/superpowers/specs/2026-07-23-session-expiry-guard-design.md`

## Global Constraints

- `payAndConfirm`, `clickVisibleModalConfirm`, and `dismissBlockingModals` internals must NOT be modified. The payment phase is never retried.
- Re-login must start from the CURRENT page's "Acessar" link — never `goto` back to the (possibly cached) home first.
- Test policy: nothing here is pure — no new unit tests. Verification bar per task = `make build` clean + `make test` 22/22.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Detection — `SessionExpired`, watch-window hooks, abort diagnosis

**Files:**
- Modify: `aposta/src/flow.ts`

**Interfaces:**
- Produces: `export class SessionExpired extends AbortBeforePayment {}` (consumed by Task 2 / index.ts); module-private `throwIfSessionExpired(page: Page): Promise<void>`; `settleAndGuard(page, log, opts?: { checkSession?: boolean })` and `recheckLateModals(page, log?, opts?: { checkSession?: boolean })`, both defaulting `checkSession: true`.

- [ ] **Step 1: Add the error class and detector**

In `aposta/src/flow.ts`, immediately after the `AbortBeforePayment` class declaration, add:

```ts
/** Thrown when the header shows the logged-out "Acessar" link on a page where
 * the flow expects to be logged in: the persistent profile served a cached
 * page but the server session is gone. Subclass of AbortBeforePayment so any
 * unhandled instance still takes the safe pre-payment abort path. */
export class SessionExpired extends AbortBeforePayment {}
```

Immediately after the closing brace of `recheckLateModals`, add:

```ts
/** Throw SessionExpired if the CURRENT page's header shows the logged-out
 * "Acessar" link. The cached page does NOT show it at first — the SPA only
 * re-renders the header after a navigation/action makes its API calls fail —
 * hence this runs inside the settle watch window, not just at page entry. */
async function throwIfSessionExpired(page: Page): Promise<void> {
  const link = page.locator(selectors.home.loginLink);
  const visible = (await link.count()) > 0 && (await link.first().isVisible().catch(() => false));
  if (visible) {
    throw new SessionExpired('Sessão expirada (página cacheada) — é preciso refazer o login.');
  }
}
```

- [ ] **Step 2: Hook the watch window**

Replace the `settleAndGuard` and `recheckLateModals` functions with:

```ts
/**
 * Page-entry settle + modal watch window: the historical trio (2.5s settle,
 * terms, full guard), then 2 extra re-checks ~2s apart — promo/notification
 * modals can take longer than 2.5s to render (seen live 2026-07-23). Each
 * re-check is a cheap visible-container count; the full guard runs only when
 * something actually appeared. Cost: ~+4s per page entry; modals later than
 * ~7s are covered by clickWithModalGuard at action time.
 * checkSession (default true): also watch for the header re-rendering the
 * logged-out "Acessar" link (cached page, dead session) and throw
 * SessionExpired. login() disables it — logged-out home is normal there.
 */
async function settleAndGuard(
  page: Page,
  log: Logger,
  opts: { checkSession?: boolean } = {},
): Promise<void> {
  const { checkSession = true } = opts;
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page, log);
  if (checkSession) await throwIfSessionExpired(page);
  await recheckLateModals(page, log, { checkSession });
}

/** The 2-re-check tail of settleAndGuard, reusable where there is no goto. */
async function recheckLateModals(
  page: Page,
  log?: Logger,
  opts: { checkSession?: boolean } = {},
): Promise<void> {
  const { checkSession = true } = opts;
  const blocking = page.locator(
    `${selectors.promo.modalContainer}:visible, ${selectors.promo.notificationContainer}:visible, ${selectors.promo.backdrop}:visible`,
  );
  for (let i = 0; i < 2; i++) {
    await sleep(2000);
    if (checkSession) await throwIfSessionExpired(page);
    if (await blocking.count()) {
      log?.info('Modal tardio detectado — fechando.');
      await dismissBlockingModals(page, log);
    }
  }
}
```

(vs. today: both gain the `opts` parameter and the `checkSession` calls; the
modal logic is unchanged.)

- [ ] **Step 3: Disable the check where logged-out is normal**

In `login()`, replace:

```ts
  await settleAndGuard(page, log); // promos pop on home (logged in OR out) and block all clicks
```

with:

```ts
  await settleAndGuard(page, log, { checkSession: false }); // logged-out home is normal here
```

- [ ] **Step 4: Diagnose the two misleading aborts**

In `selectCarrinhoFavoritoAndCheckout`, replace:

```ts
  await page.waitForSelector(selectors.carrinhos.includeIcon, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Página de Carrinhos Favoritos não carregou (nenhum carrinho salvo?).');
  });
```

with:

```ts
  const iconsLoaded = await page
    .waitForSelector(selectors.carrinhos.includeIcon, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!iconsLoaded) {
    await throwIfSessionExpired(page); // dead session reports itself, not "nenhum carrinho salvo?"
    throw new AbortBeforePayment('Página de Carrinhos Favoritos não carregou (nenhum carrinho salvo?).');
  }
```

and replace:

```ts
  await page.waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Botão "Ir para pagamento" não apareceu no carrinho (carrinho vazio?).');
  });
```

with:

```ts
  const payButtonLoaded = await page
    .waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!payButtonLoaded) {
    await throwIfSessionExpired(page);
    throw new AbortBeforePayment('Botão "Ir para pagamento" não apareceu no carrinho (carrinho vazio?).');
  }
```

- [ ] **Step 5: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 22/22 tests pass.

- [ ] **Step 6: Commit**

```bash
git add aposta/src/flow.ts
git commit -m "feat: SessionExpired detection — watch window + abort diagnosis

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Recovery — login refactor, `reloginAfterSessionExpiry`, resume-once wiring

**Files:**
- Modify: `aposta/src/flow.ts`
- Modify: `aposta/src/index.ts`

**Interfaces:**
- Consumes: `SessionExpired` (Task 1), `submitOtpAndPassword` (existing).
- Produces: module-private `beginKeycloakLogin(page, secrets, log)`; `export async function reloginAfterSessionExpiry(page: Page, secrets: Secrets, timeoutSec: number, log: Logger, promptFallback: () => Promise<string>): Promise<void>`.

- [ ] **Step 1: Extract `beginKeycloakLogin` from `login()`**

In `aposta/src/flow.ts`, immediately BEFORE the `login` function's docstring, add:

```ts
/**
 * Click the CURRENT page's "Acessar" link and drive Keycloak up to REQUESTING
 * the email code (CPF -> "Próximo" -> pick email -> "Receber código"). Works
 * from any silce-web page whose header shows "Acessar" — used by login() on
 * the home page and by reloginAfterSessionExpiry() wherever the expiry was
 * detected (never navigate back to the possibly-cached home first).
 */
async function beginKeycloakLogin(page: Page, secrets: Secrets, log: Logger): Promise<void> {
  const loginLink = page.locator(selectors.home.loginLink);
  await loginLink.waitFor({ timeout: 15_000 }).catch(() => {
    throw new AbortBeforePayment('Botão "Acessar" não encontrado na página.');
  });
  await loginLink.click();

  // Keycloak: CPF
  await page.waitForSelector(selectors.login.cpfInput, { timeout: 20_000 });
  await page.fill(selectors.login.cpfInput, secrets.caixaCpf);
  await page.click(selectors.login.cpfNextButton);

  // Keycloak: choose email, request code
  await page.waitForSelector(selectors.login.mailRadio, { timeout: 20_000 });
  await page.check(selectors.login.mailRadio).catch(() => {});
  await page.click(selectors.login.requestCodeButton);
  log.step('login-request-code', 'ok');
}
```

Then in `login()`, replace everything from `const loginLink = page.locator(selectors.home.loginLink);` through `log.step('login-request-code', 'ok');` (inclusive) with:

```ts
  await beginKeycloakLogin(page, secrets, log);
```

so the function ends:

```ts
  await beginKeycloakLogin(page, secrets, log);
  return 'CODE_REQUESTED';
}
```

- [ ] **Step 2: Add `reloginAfterSessionExpiry`**

Immediately after the closing brace of `submitOtpAndPassword`, add:

```ts
/**
 * Recover from SessionExpired: start Keycloak from the CURRENT page's
 * "Acessar" link (never via the possibly-cached home) and complete OTP +
 * password. Triggers a fresh OTP e-mail, same manual-paste fallback as a
 * normal login. The caller retries the interrupted phase ONCE afterwards.
 */
export async function reloginAfterSessionExpiry(
  page: Page,
  secrets: Secrets,
  timeoutSec: number,
  log: Logger,
  promptFallback: () => Promise<string>,
): Promise<void> {
  log.info('Sessão expirada — refazendo login...');
  await beginKeycloakLogin(page, secrets, log);
  await submitOtpAndPassword(page, secrets, timeoutSec, log, promptFallback);
}
```

- [ ] **Step 3: Wire resume-once in `aposta/src/index.ts`**

Extend the `./flow.js` import block to:

```ts
import {
  login,
  submitOtpAndPassword,
  selectCarrinhoFavoritoAndCheckout,
  payAndConfirm,
  saveComprovante,
  AbortBeforePayment,
  SessionExpired,
  reloginAfterSessionExpiry,
  type CheckoutInfo,
} from './flow.js';
```

In `runBet`, replace:

```ts
    const info = await selectCarrinhoFavoritoAndCheckout(page, secrets, config.defaultCardLast4, log);
```

with:

```ts
    let info: CheckoutInfo;
    try {
      info = await selectCarrinhoFavoritoAndCheckout(page, secrets, config.defaultCardLast4, log);
    } catch (e) {
      if (!(e instanceof SessionExpired)) throw e;
      await reloginAfterSessionExpiry(page, secrets, config.otpPollTimeoutSec, log, () =>
        askLine('Cole o código do e-mail: '),
      );
      info = await selectCarrinhoFavoritoAndCheckout(page, secrets, config.defaultCardLast4, log);
    }
```

In `runComprovante`, replace:

```ts
    const comp = await saveComprovante(page, RECEIPTS_DIR, log);
```

with:

```ts
    let comp: { numero: string; screenshotPath: string };
    try {
      comp = await saveComprovante(page, RECEIPTS_DIR, log);
    } catch (e) {
      if (!(e instanceof SessionExpired)) throw e;
      await reloginAfterSessionExpiry(page, secrets, config.otpPollTimeoutSec, log, () =>
        askLine('Cole o código do e-mail: '),
      );
      comp = await saveComprovante(page, RECEIPTS_DIR, log);
    }
```

(`runBet`'s post-payment `saveComprovante` call keeps its existing generic
try/catch — payment already made, fallback screenshot only.)

- [ ] **Step 4: Verify build and tests**

Run: `make build && make test`
Expected: build clean, 22/22 tests pass.

- [ ] **Step 5: Commit**

```bash
git add aposta/src/flow.ts aposta/src/index.ts
git commit -m "feat: auto re-login and resume once on SessionExpired

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final verification (operator — not an agent task)

Opportunistic: the stale-cache state cannot be reproduced on demand. On the
next occurrence, the log must show
`Sessão expirada — refazendo login...` → fresh OTP login → the phase
resuming (instead of `Página de Carrinhos Favoritos não carregou (nenhum
carrinho salvo?)`). Any normal `make bet`/`make dry-run` doubles as a
no-regression check (login, modals, contest choice, checkout unchanged).
