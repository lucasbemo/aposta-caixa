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
 * Navigate to Carrinhos Favoritos, add the configured cart, go to the cart,
 * proceed to payment, and select the saved card. STOPS before any payment
 * action (does not click the "Continuar"/pay button).
 *
 * NOTE: the exact cart-row selector is finalized during the live dry-run; this
 * uses a defensive text match on the configured cart name.
 */
export async function selectCarrinhoFavoritoAndCheckout(
  page: Page,
  secrets: Secrets,
  cardLast4: string,
  log: Logger,
): Promise<CheckoutInfo> {
  await page.goto(CARRINHOS_FAVORITOS_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(3000);
  await acceptTermsIfPresent(page, log);
  await page.waitForSelector(selectors.carrinhos.includeIcon, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Página de Carrinhos Favoritos não carregou (nenhum carrinho salvo?).');
  });

  // Select the RIGHT cart: the table row whose text contains the configured
  // cart name, then click the include icon within that row.
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
      `Esperava exatamente 1 carrinho com o nome "${secrets.caixaCarrinhoFavorito}", encontrei ${matched} (de ${await rows.count()} carrinhos). Ajuste CAIXA_CARRINHO_FAVORITO para bater com a linha certa.`,
    );
  }
  await sleep(1500);

  // Go to the cart page, then proceed to payment.
  await page.goto(CARRINHO_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await sleep(2500);
  await acceptTermsIfPresent(page, log);
  await page.waitForSelector(selectors.carrinho.goToPaymentButton, { timeout: 20_000 }).catch(() => {
    throw new AbortBeforePayment('Botão "Ir para pagamento" não apareceu no carrinho (carrinho vazio?).');
  });
  await page.click(selectors.carrinho.goToPaymentButton);

  // Select the saved card by last-4 within the <select>
  await page.waitForSelector(selectors.checkout.cardSelect, { timeout: 20_000 });
  await selectCardByLast4(page, cardLast4);

  const amount = await readAmount(page);
  const contest = await readContest(page);
  log.step('checkout-ready', 'ok');
  return { lottery: secrets.caixaCarrinhoFavorito, contest, amount, cardLast4 };
}

/** Choose the option in select#cardId whose label contains the last 4 digits. */
export async function selectCardByLast4(page: Page, last4: string): Promise<void> {
  const options = await page.locator(`${selectors.checkout.cardSelect} option`).all();
  for (const opt of options) {
    const label = (await opt.innerText()).trim();
    if (label.includes(last4)) {
      const value = await opt.getAttribute('value');
      if (value !== null) {
        await page.selectOption(selectors.checkout.cardSelect, value);
        return;
      }
    }
  }
  throw new AbortBeforePayment(`Cartão terminado em ${last4} não encontrado no checkout.`);
}

// Amount/contest selectors are still CONFIRMAR — read best-effort; the dry-run pins them down.
async function readAmount(page: Page): Promise<number> {
  if (selectors.checkout.totalAmount === 'CONFIRMAR') return NaN;
  const t = await page.locator(selectors.checkout.totalAmount).innerText().catch(() => '');
  return parseAmount(t);
}
async function readContest(page: Page): Promise<string> {
  if (selectors.checkout.contestNumber === 'CONFIRMAR') return '';
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
