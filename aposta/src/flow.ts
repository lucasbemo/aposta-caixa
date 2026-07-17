import { type Page } from 'playwright';
import {
  selectors,
  CAIXA_URL,
  CARRINHOS_FAVORITOS_URL,
  CARRINHO_URL,
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
  await sleep(2500);
  await acceptTermsIfPresent(page, log);

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
  log.step('login-complete', 'ok');
}

/**
 * Close blocking ALERT/INFO/ERROR modals (the "Fechar" ones). This site pops
 * many of them (e.g. "existem apostas idênticas no carrinho") and a visible
 * `<div id="alert" class="modal in">` intercepts ALL clicks until dismissed.
 * Call this before any action. Loops a few times since closing one can reveal
 * another.
 */
export async function dismissBlockingModals(page: Page): Promise<void> {
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
    if (!closedAny) return;
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

/** Empty the cart so it holds exactly the intended bet. Handles the blocking
 * "identical bets" alert, then the "Limpar carrinho" confirmation. */
export async function clearCart(page: Page, log: Logger): Promise<void> {
  await page.goto(CARRINHO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page); // "existem apostas idênticas" alert blocks clicks
  const clear = page.locator(selectors.carrinho.clearCartButton);
  if (await clear.count()) {
    await clear.click().catch(() => {});
    await sleep(1200);
    await clickVisibleModalConfirm(page); // "deseja limpar o carrinho?" -> Confirmar
    await sleep(1500);
    await dismissBlockingModals(page); // any follow-up alert
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
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page);
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
    await target.locator(selectors.carrinhos.includeIcon).click();
  } else if (matched === 0 && (await rows.count()) === 1) {
    await rows.locator(selectors.carrinhos.includeIcon).click();
  } else {
    throw new AbortBeforePayment(
      `Esperava exatamente 1 carrinho com o nome "${secrets.caixaCarrinhoFavorito}", encontrei ${matched} (de ${await rows.count()} carrinhos). Ajuste CAIXA_CARRINHO_FAVORITO.`,
    );
  }
  await sleep(1200);
  await clickVisibleModalConfirm(page); // include may raise a confirm popup

  // Go to the cart page, proceed to payment, confirm the popup.
  await page.goto(CARRINHO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await dismissBlockingModals(page);
  await page.waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Botão "Ir para pagamento" não apareceu no carrinho (carrinho vazio?).');
  });
  await page.click(selectors.carrinho.goToPaymentButton);
  await sleep(1200);
  await clickVisibleModalConfirm(page); // "prosseguir para pagamento" popup

  // Wait for the payment page to settle, then clear any blocking alert
  // ("existem apostas idênticas") that would otherwise intercept clicks.
  await page
    .waitForURL((u) => /pagamento/i.test(u.toString()) && /loteriasonline/i.test(u.toString()), { timeout: 30_000 })
    .catch(() => {});
  await sleep(2500);
  await dismissBlockingModals(page);

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
      await cell.click().catch(() => {});
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
  await dismissBlockingModals(page);
  await page.click(selectors.checkout.proceedButton); // "Continuar" -> opens CVV popup
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
