import fs from 'node:fs';
import path from 'node:path';
import { type Page, type Locator } from 'playwright';
import {
  selectors,
  CAIXA_URL,
  CARRINHOS_FAVORITOS_URL,
  CARRINHO_URL,
  COMPRAS_URL,
  LOGGED_IN_URL_FRAGMENT,
} from './selectors.js';
import { type Secrets } from './secrets.js';
import { type Logger } from './logger.js';
import { fetchLatestCaixaEmail, pollForOtp } from './otp.js';

/** Thrown on any unexpected page BEFORE payment — always safe to abort/retry here. */
export class AbortBeforePayment extends Error {}

export interface CheckoutInfo {
  lottery: string;
  contest: string;
  amount: number;
  cardLast4: string;
}

/** "R$ 6,00" -> 6.0 ; returns NaN if unparseable. */
export function parseAmount(text: string): number {
  const cleaned = (text || '').replace(/[^\d,]/g, '').replace(',', '.');
  return Number(cleaned);
}

/**
 * Pure: pick the "normal" (plain-name, never "Ambos") contest label from a
 * contest-choice modal ("Existem N concursos abertos para a X..."). `text` is
 * the modal's full text, `labels` the radio labels. Returns the label to
 * select, or null when no safe choice exists (caller escalates).
 */
export function chooseContestLabel(text: string, labels: string[]): string | null {
  const candidates = labels.map((l) => l.trim()).filter((l) => l && !/^ambos$/i.test(l));
  if (!candidates.length) return null;
  const base = text.match(/para [ao] (.+?)[.?]/i)?.[1]?.trim();
  if (base) {
    const exact = candidates.find(
      (l) => l.localeCompare(base, 'pt-BR', { sensitivity: 'base' }) === 0,
    );
    if (exact) return exact;
  }
  // Special contests are "X da Y" — strictly longer than the plain name.
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Best-effort dismissal of the terms-of-use / info modals shown before home. */
export async function acceptTermsIfPresent(page: Page, log: Logger): Promise<void> {
  for (const id of selectors.terms.acceptButtonIds) {
    const el = page.locator(id);
    if ((await el.count()) && (await el.first().isVisible().catch(() => false))) {
      await el.first().click().catch(() => {});
      await sleep(800);
    }
  }
  for (const txt of selectors.terms.acceptButtonTexts) {
    const el = page.locator(`button:has-text("${txt}")`);
    if ((await el.count()) && (await el.first().isVisible().catch(() => false))) {
      await el.first().click().catch(() => {});
      await sleep(800);
    }
  }
}

/**
 * Drive the Keycloak login up to REQUESTING the email code.
 * Order (real CAIXA flow): CPF -> "Próximo" -> pick email -> "Receber código".
 * The OTP email is sent at the end of this function.
 *
 * Returns 'ALREADY' if the persistent profile is still authenticated (in which
 * case the caller must NOT call submitOtpAndPassword), else 'CODE_REQUESTED'.
 */
export async function login(page: Page, secrets: Secrets, log: Logger): Promise<'ALREADY' | 'CODE_REQUESTED'> {
  await page.goto(CAIXA_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settleAndGuard(page, log); // promos pop on home (logged in OR out) and block all clicks

  // Persistent profile may still be logged in — skip the whole login if so.
  const loggedIn = page.locator(selectors.home.loggedInIndicator);
  if ((await loggedIn.count()) && (await loggedIn.first().isVisible().catch(() => false))) {
    log.step('login-already', 'ok');
    return 'ALREADY';
  }

  const loginLink = page.locator(selectors.home.loginLink);
  await loginLink.waitFor({ timeout: 15_000 }).catch(() => {
    throw new AbortBeforePayment('Botão "Acessar" não encontrado na home.');
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
  return 'CODE_REQUESTED';
}

/**
 * Fetch the OTP (IMAP, with manual fallback), submit it, THEN enter the password,
 * and confirm we land back on the logged-in silce-web home.
 */
export async function submitOtpAndPassword(
  page: Page,
  secrets: Secrets,
  timeoutSec: number,
  log: Logger,
  promptFallback: () => Promise<string>,
): Promise<void> {
  await page.waitForSelector(selectors.otp.codeInput, { timeout: 20_000 });

  const fetchBody = fetchLatestCaixaEmail({
    host: 'imap.gmail.com',
    user: secrets.gmailAddress,
    pass: secrets.gmailAppPassword,
    senderFilter: 'caixa.gov.br',
    sinceMs: Date.now() - 60_000, // only codes from the last minute (avoids stale backlog)
  });
  let code = await pollForOtp(fetchBody, {
    timeoutMs: timeoutSec * 1000,
    intervalMs: 3000,
    sleep,
    now: () => Date.now(),
  });
  if (!code) {
    log.info('OTP não chegou no tempo — solicitando código manual.');
    code = await promptFallback();
  }
  await page.fill(selectors.otp.codeInput, code);
  await page.click(selectors.otp.codeSubmitButton);
  log.step('otp', 'ok');

  // Keycloak: password
  await page.waitForSelector(selectors.login.passwordInput, { timeout: 20_000 });
  await page.fill(selectors.login.passwordInput, secrets.caixaPassword);
  await page.click(`button:has-text("${selectors.login.passwordSubmitText}")`);

  // Back to silce-web, logged in
  await page.waitForURL((u) => u.toString().includes(LOGGED_IN_URL_FRAGMENT), { timeout: 30_000 });
  await page.waitForSelector(selectors.home.loggedInIndicator, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Não confirmei o login (indicador "Minha Conta" ausente).');
  });
  await dismissBlockingModals(page, log); // fresh-login home is where promo modals appear most
  await recheckLateModals(page, log); // notification modal can render seconds later
  log.step('login-complete', 'ok');
}

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
  log?.info(`Modal desconhecido aberto — evidências em dom-dumps/modal_unknown_${ts}.*`);
  throw new AbortBeforePayment(
    `Modal desconhecido aberto — evidências em dom-dumps/modal_unknown_${ts}.*`,
  );
}

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

/**
 * Click the CURRENTLY VISIBLE confirmation button. The id
 * #confirmarModalConfirmacao is reused across many hidden, pre-rendered Angular
 * modals, so we must target the visible one (`:visible`), not the first match.
 */
export async function clickVisibleModalConfirm(page: Page): Promise<boolean> {
  // id-based confirms first (most specific)
  for (const sel of ['button#confirmarModalConfirmacao:visible', 'button#confirmarModalSim:visible']) {
    const loc = page.locator(sel);
    if (await loc.count()) {
      await loc.first().click().catch(() => {});
      await sleep(2000);
      return true;
    }
  }
  // Affirmative buttons on this site's confirmation modals (all learned from
  // real popups): "Confirmar", "Sim", "Continuar" (e.g. clear-cart), and
  // "Incluir no carrinho" (the "carrinho adicionado recentemente" popup).
  // EXACT match so we never hit "Continuar apostando". Click the visible one.
  for (const name of ['Confirmar', 'Sim', 'Continuar', 'Incluir no carrinho']) {
    const btn = page.getByRole('button', { name, exact: true });
    const n = await btn.count();
    for (let i = 0; i < n; i++) {
      const b = btn.nth(i);
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {});
        await sleep(2000);
        return true;
      }
    }
  }
  return false;
}

/**
 * Handle the "Existem N concursos abertos para a X" modal(s) shown after
 * including the favorite cart when a special contest (Mega da Virada,
 * Lotofácil da Independência, ...) is open. "Ambos" comes PRE-SELECTED and
 * would duplicate every game of that lottery, so: pick the plain-name radio
 * via chooseContestLabel, verify the selection, then click that modal's
 * "Incluir no carrinho". Up to 3 rounds — the favorite cart mixes lotteries,
 * so one modal per lottery can appear in sequence. If the modal is present
 * but a radio cannot be selected, save evidence and throw AbortBeforePayment:
 * aborting beats silently confirming a duplicated cart.
 */
async function handleContestChoiceModals(page: Page, log: Logger): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const modal = page
      .locator(`${selectors.promo.modalContainer}:visible`)
      .filter({ hasText: selectors.contestChoice.modalText })
      .first();
    // The modal can render late (page-entry modals were seen live taking
    // >2.5s), and a second lottery's modal can follow the first — wait
    // bounded instead of sampling once, else the generic confirm downstream
    // would OK it with "Ambos" pre-selected.
    await modal.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    if (!(await modal.count())) return;

    const text = await modal.innerText().catch(() => '');
    // Radio labels: accessible names first, then <label> text via evaluate
    // (the site's styled radios may hide the input itself).
    const radios = modal.getByRole('radio');
    const n = await radios.count();
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      const name =
        (await radios.nth(i).getAttribute('aria-label').catch(() => null)) ||
        (await radios
          .nth(i)
          .evaluate((el) => el.closest('label')?.textContent ?? '')
          .catch(() => ''));
      labels.push((name ?? '').replace(/\s+/g, ' ').trim());
    }

    const chosen = chooseContestLabel(text, labels);
    let selected = false;
    if (chosen) {
      const byRole = modal.getByRole('radio', { name: chosen, exact: true });
      if (await byRole.count()) {
        await byRole.first().check({ timeout: 2500 }).catch(() => {});
        selected = await byRole.first().isChecked().catch(() => false);
      }
      if (!selected) {
        // Anchored exact match: plain "Lotofácil" must NOT substring-match
        // the special "Lotofácil da Independência" label.
        const exactLabel = new RegExp(
          `^\\s*${chosen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
          'i',
        );
        const byLabel = modal.locator('label').filter({ hasText: exactLabel }).first();
        if (await byLabel.count()) {
          await byLabel.click({ timeout: 2500 }).catch(() => {});
          const input = byLabel.locator('input[type="radio"]');
          selected = (await input.count())
            ? await input.first().isChecked().catch(() => false)
            : false;
        }
      }
    }

    if (!selected) {
      const ts = Date.now();
      const dumpDir = path.resolve('dom-dumps');
      const base = path.join(dumpDir, `contest_modal_${ts}`);
      try {
        fs.mkdirSync(dumpDir, { recursive: true });
        fs.writeFileSync(`${base}.txt`, await debugVisibleControls(page));
      } catch {
        // evidence is best-effort; never mask the abort
      }
      await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});
      throw new AbortBeforePayment(
        `Modal de escolha de concurso não tratado (opção "${chosen ?? '?'}" não selecionável) — evidências em dom-dumps/contest_modal_${ts}.*`,
      );
    }
    log.info(`Concurso selecionado: ${chosen}`);

    // Confirm THIS modal only: visible exact-text "Incluir no carrinho".
    const btn = modal.getByRole('button', {
      name: selectors.contestChoice.includeButtonText,
      exact: true,
    });
    const bn = await btn.count();
    for (let i = 0; i < bn; i++) {
      const b = btn.nth(i);
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 2500 }).catch(() => {});
        break;
      }
    }
    await sleep(1500);
  }
}

/** Empty the cart so it holds exactly the intended bet. Handles the blocking
 * "identical bets" alert, then the "Limpar carrinho" confirmation. */
export async function clearCart(page: Page, log: Logger): Promise<void> {
  await page.goto(CARRINHO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settleAndGuard(page, log); // "existem apostas idênticas" alert blocks clicks
  // Empty cart => button rendered but DISABLED (ng-disabled="qtdApostasCarrinho
  // <= 0", seen live 2026-07-23): nothing to clear, skip instead of retrying a
  // click that can never land.
  const clear = page.locator(selectors.carrinho.clearCartButton);
  if (
    (await clear.isVisible().catch(() => false)) &&
    (await clear.isEnabled().catch(() => false))
  ) {
    await clickWithModalGuard(page, clear, log);
    await sleep(1200);
    await clickVisibleModalConfirm(page); // "deseja limpar o carrinho?" -> Confirmar
    await sleep(1500);
    await dismissBlockingModals(page, log); // any follow-up alert
    log.step('clear-cart', 'ok');
  }
}

/**
 * Empty the cart, add the configured favorite cart, go to the cart, and proceed
 * to payment (confirming the popup). Card selection is best-effort so the caller
 * can still inspect/act on the payment page. STOPS before any payment.
 */
export async function selectCarrinhoFavoritoAndCheckout(
  page: Page,
  secrets: Secrets,
  cardLast4: string,
  log: Logger,
): Promise<CheckoutInfo> {
  await clearCart(page, log);

  await page.goto(CARRINHOS_FAVORITOS_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settleAndGuard(page, log);
  await page.waitForSelector(selectors.carrinhos.includeIcon, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Página de Carrinhos Favoritos não carregou (nenhum carrinho salvo?).');
  });

  // Select the RIGHT cart: the table row whose text contains the configured name.
  const rows = page
    .locator(selectors.carrinhos.rowContainer)
    .filter({ has: page.locator(selectors.carrinhos.includeIcon) });
  const target = rows.filter({ hasText: secrets.caixaCarrinhoFavorito });
  const matched = await target.count();
  if (matched === 1) {
    await clickWithModalGuard(page, target.locator(selectors.carrinhos.includeIcon), log);
  } else if (matched === 0 && (await rows.count()) === 1) {
    await clickWithModalGuard(page, rows.locator(selectors.carrinhos.includeIcon), log);
  } else {
    throw new AbortBeforePayment(
      `Esperava exatamente 1 carrinho com o nome "${secrets.caixaCarrinhoFavorito}", encontrei ${matched} (de ${await rows.count()} carrinhos). Ajuste CAIXA_CARRINHO_FAVORITO.`,
    );
  }
  await sleep(1200);
  await handleContestChoiceModals(page, log); // special-contest choice: plain name, never "Ambos"
  await clickVisibleModalConfirm(page); // include may raise a confirm popup

  // Go to the cart page, proceed to payment, confirm the popup.
  await page.goto(CARRINHO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settleAndGuard(page, log);
  await page.waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Botão "Ir para pagamento" não apareceu no carrinho (carrinho vazio?).');
  });
  await clickWithModalGuard(page, page.locator(selectors.carrinho.goToPaymentButton), log);
  await sleep(1200);
  await clickVisibleModalConfirm(page); // "prosseguir para pagamento" popup

  // Wait for the payment page to settle, then clear any blocking alert
  // ("existem apostas idênticas") that would otherwise intercept clicks.
  await page
    .waitForURL((u) => /pagamento/i.test(u.toString()) && /loteriasonline/i.test(u.toString()), { timeout: 30_000 })
    .catch(() => {});
  await settleAndGuard(page, log);

  // Best-effort card selection (do not throw — caller inspects the page).
  await selectCardByLast4(page, cardLast4).catch((e) => log.info(`Cartão não selecionado ainda: ${(e as Error).message}`));

  const amount = await readAmount(page);
  const contest = await readContest(page);
  log.step('checkout-ready', 'ok');
  return { lottery: secrets.caixaCarrinhoFavorito, contest, amount, cardLast4 };
}

/**
 * Select the saved card by clicking the cell that shows "**** <last4>"
 * (ng-click vm.opcoesCollapse). Polls for it to appear, clearing alerts.
 */
export async function selectCardByLast4(page: Page, last4: string): Promise<void> {
  const deadline = Date.now() + 24_000;
  while (Date.now() < deadline) {
    await dismissBlockingModals(page);
    const cell = page.locator(selectors.checkout.cardCellByLast4(last4)).first();
    if ((await cell.count()) && (await cell.isVisible().catch(() => false))) {
      await clickWithModalGuard(page, cell);
      await sleep(1500);
      return;
    }
    await sleep(2000);
  }
  throw new AbortBeforePayment(`Cartão terminado em ${last4} não encontrado no checkout (após aguardar carregar).`);
}

/**
 * TASK 11 — REAL PAYMENT. Card must already be selected. Clicks "Continuar"
 * (#pay) to open the CVV popup, fills the CVV, and clicks "Confirmar"
 * (#confirmarModalConfirmacao) EXACTLY ONCE. Never retried. Returns when the
 * confirm click is submitted; the caller reconciles the result.
 */
export interface PaymentOutcome {
  status: 'SUBMITTED' | 'FAILED';
  message: string; // the on-screen confirmation text, when captured
}

export async function payAndConfirm(page: Page, cvv: string, log: Logger): Promise<PaymentOutcome> {
  await dismissBlockingModals(page, log);
  await clickWithModalGuard(page, page.locator(selectors.checkout.proceedButton), log); // "Continuar" -> opens CVV popup (retry-safe)
  await page.waitForSelector(`${selectors.payment.cvvInput}:visible`, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Popup de CVV não apareceu após "Continuar".');
  });

  // Two #securityCode inputs exist (one hidden). Target the VISIBLE one, and
  // TYPE the CVV char-by-char so Angular's ng-keyup/ui-mask handlers fire
  // (page.fill sets the DOM value without updating vm.securityCode).
  const field = page.locator(`${selectors.payment.cvvInput}:visible`).first();
  await field.click();
  await field.fill('');
  await field.pressSequentially(cvv, { delay: 90 });
  await field.blur().catch(() => {}); // ng-blur -> vm.mudaCartao()
  await sleep(1000);
  const entered = (await field.inputValue().catch(() => '')).replace(/\D/g, '');
  if (entered.length < 3) {
    throw new AbortBeforePayment(`CVV não registrou no campo (lido: "${entered}"). Aposta não feita.`);
  }
  log.step('cvv-filled', 'ok');
  await sleep(500);

  // SINGLE submit — the real payment. Never retried.
  await page.locator(`${selectors.payment.confirmButton}:visible`).first().click();
  log.step('payment-submitted', 'ok');

  // The success message appears after a delay. Poll for up to ~30s: success is
  // the CVV popup closing AND a confirmation message ("pagamento concluído /
  // comprovante / sucesso") appearing. If the CVV popup stays open, it failed.
  const SUCCESS = /(pagamento|aposta).{0,40}(conclu[ií]d|efetuad|realizad|sucesso)|comprovante|realizada com sucesso/i;
  const deadline = Date.now() + 30_000;
  let message = '';
  while (Date.now() < deadline) {
    await sleep(2500);
    const cvvOpen = await page.locator(`${selectors.payment.cvvInput}:visible`).count().catch(() => 0);
    const body = await page.evaluate(() => document.body.innerText).catch(() => '');
    const m = body.match(SUCCESS);
    if (m) message = m[0].replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!cvvOpen && message) {
      log.step('payment-confirmed', 'ok');
      return { status: 'SUBMITTED', message };
    }
  }
  const cvvStillOpen = await page.locator(`${selectors.payment.cvvInput}:visible`).count().catch(() => 0);
  if (cvvStillOpen) {
    log.step('payment-verify', 'fail');
    return { status: 'FAILED', message: '' };
  }
  // Popup closed but no explicit success text seen — treat as submitted-unknown.
  log.step('payment-verify', 'ok');
  return { status: 'SUBMITTED', message };
}

// Read best-effort; a selector still set to 'CONFIRMAR' is treated as unknown.
async function readAmount(page: Page): Promise<number> {
  if ((selectors.checkout.totalAmount as string) === 'CONFIRMAR') return NaN;
  const t = await page.locator(selectors.checkout.totalAmount).innerText().catch(() => '');
  return parseAmount(t);
}
async function readContest(page: Page): Promise<string> {
  if ((selectors.checkout.contestNumber as string) === 'CONFIRMAR') return '';
  return (await page.locator(selectors.checkout.contestNumber).innerText().catch(() => '')).trim();
}

/**
 * Save the OFFICIAL comprovante for the most recent purchase. Navigates to
 * "Compras", opens the newest purchase's "Detalhamento da compra"
 * (#/compras/{id}), and takes a FULL-PAGE screenshot. Returns the purchase
 * number and the screenshot path. Best-effort: throws only if the purchases
 * list never loads.
 */
export async function saveComprovante(
  page: Page,
  receiptsDir: string,
  log: Logger,
): Promise<{ numero: string; screenshotPath: string }> {
  await page.goto(COMPRAS_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await settleAndGuard(page, log);

  // The newest purchase is the first "Detalhamento da compra" link
  // (a[ng-click*="verDetalheCompra"]); its text is the purchase number.
  const link = page.locator('a[ng-click*="verDetalheCompra"]').first();
  await link.waitFor({ timeout: 20_000 });
  const numero = (await link.innerText().catch(() => '')).trim().replace(/\s+/g, '');
  await clickWithModalGuard(page, link, log);
  await sleep(5000);
  await dismissBlockingModals(page, log);

  const screenshotPath = path.join(receiptsDir, `comprovante-${numero || 'sem-numero'}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  log.step('comprovante-salvo', 'ok');
  return { numero, screenshotPath };
}

/**
 * Debug helper: return currently-visible controls (structural attributes + button
 * text only, never input values). Used during the dry-run to finalize the
 * remaining CONFIRMAR selectors safely.
 */
export async function debugVisibleControls(page: Page): Promise<string> {
  const items = await page.evaluate(() => {
    const sel = 'input, select, textarea, button, a, [formcontrolname]';
    const out: string[] = [];
    for (const e of Array.from(document.querySelectorAll(sel))) {
      const el = e as HTMLElement;
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      if (!visible) continue;
      const isField = e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
      out.push(
        [
          e.tagName.toLowerCase(),
          e.getAttribute('type') && `type=${e.getAttribute('type')}`,
          e.getAttribute('id') && `id=${e.getAttribute('id')}`,
          e.getAttribute('formcontrolname') && `fcn=${e.getAttribute('formcontrolname')}`,
          !isField && (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45) &&
            `txt="${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45)}"`,
        ]
          .filter(Boolean)
          .join(' '),
      );
    }
    return `URL: ${location.href}\n` + out.join('\n');
  });
  return items;
}
