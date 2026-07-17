#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { loadSecrets } from './secrets.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { launchBrowser, closeBrowser } from './browser.js';
import { formatConfirmation, checkSpendGuardrail, promptHiddenCvv, validateCvv } from './payment.js';
import { readHistory, appendHistory, type ReceiptRecord } from './receipt.js';
import {
  login,
  submitOtpAndPassword,
  selectCarrinhoFavoritoAndCheckout,
  payAndConfirm,
  AbortBeforePayment,
} from './flow.js';

export const APP_NAME = 'aposta';

const ENV_PATH = path.resolve('.env');
const CONFIG_PATH = path.resolve('config.json');
const PROFILE_DIR = path.resolve('profile');
const HOME = path.join(os.homedir(), 'aposta');
const RECEIPTS_DIR = path.join(HOME, 'receipts');
const HISTORY_PATH = path.join(RECEIPTS_DIR, 'history.json');
const DUMP_DIR = path.resolve('dom-dumps');

function askLine(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

async function runBet(dryRun: boolean): Promise<void> {
  const log = createLogger();
  const secrets = loadSecrets(ENV_PATH);
  const config = loadConfig(CONFIG_PATH);
  const { context, page } = await launchBrowser(PROFILE_DIR);
  try {
    const state = await login(page, secrets, log);
    if (state === 'CODE_REQUESTED') {
      await submitOtpAndPassword(page, secrets, config.otpPollTimeoutSec, log, () =>
        askLine('Cole o código do e-mail: '),
      );
    }

    const info = await selectCarrinhoFavoritoAndCheckout(page, secrets, config.defaultCardLast4, log);
    if (Number.isFinite(info.amount)) checkSpendGuardrail(info.amount, config.maxAmountPerRun);

    console.log(`\n${formatConfirmation(info)}`);

    if (dryRun) {
      console.log('DRY-RUN: cartão selecionado, parando antes do pagamento. Nenhuma aposta feita.');
      return;
    }

    // --- REAL PAYMENT (Task 11) ---
    const proceed = await askLine(`Confirmar e PAGAR ${formatConfirmation(info)}? Digite SIM para pagar: `);
    if (proceed.trim().toUpperCase() !== 'SIM') {
      console.log('Cancelado pelo usuário. Nenhuma aposta feita.');
      return;
    }
    let cvv = secrets.caixaCardCvv;
    if (cvv) {
      console.log('CVV carregado do .env (auto-preenchimento).');
    } else {
      cvv = await promptHiddenCvv('Digite o CVV do cartão (não é armazenado): ');
    }
    if (!validateCvv(cvv)) {
      console.log('CVV inválido (esperado 3–4 dígitos). Verifique CAIXA_CARD_CVV no .env. Nenhuma aposta feita.');
      return;
    }
    await payAndConfirm(page, cvv, log);

    // Capture proof (screenshot) — the confirmation-number selector is not yet
    // pinned, so the screenshot + the official channel are the source of truth.
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    const id = `${info.contest || 'sem-concurso'}-${Date.now()}`;
    const screenshotPath = path.join(RECEIPTS_DIR, `${id}.png`);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const record: ReceiptRecord = {
      id, lottery: info.lottery, contest: info.contest, amount: info.amount,
      cardLast4: info.cardLast4, confirmationNumber: '', screenshotPath, pdfPath: '',
      placedAt: new Date().toISOString(), status: 'CONFIRMED',
    };
    appendHistory(HISTORY_PATH, record);
    console.log(`\n✅ Pagamento enviado. Comprovante (screenshot) salvo em ${screenshotPath}`);
    console.log('   Confira a confirmação oficial no site/app das Loterias CAIXA.');
  } catch (err) {
    if (err instanceof AbortBeforePayment) {
      console.error(`Abortado com segurança antes do pagamento: ${(err as Error).message}`);
    } else {
      console.error(`Erro: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  } finally {
    await closeBrowser(context);
  }
}

const program = new Command();
program.name(APP_NAME).description('Repete uma aposta salva nas Loterias CAIXA');

program
  .command('bet')
  .description('Executa a aposta (por enquanto para antes do pagamento)')
  .option('--dry-run', 'Para explicitamente antes do pagamento', false)
  .action((opts) => runBet(Boolean(opts.dryRun)));

program
  .command('history')
  .description('Lista apostas anteriores')
  .action(() => {
    const rows = readHistory(HISTORY_PATH);
    if (!rows.length) { console.log('Nenhuma aposta registrada ainda.'); return; }
    for (const r of rows) {
      console.log(`${r.placedAt} · ${r.lottery} #${r.contest} · R$ ${r.amount.toFixed(2)} · ${r.status} · ${r.confirmationNumber}`);
    }
  });

program
  .command('setup')
  .description('Instruções de configuração inicial')
  .action(() => {
    console.log('1. Copie .env.example para .env e preencha CPF, senha, nome do carrinho, Gmail e app password.');
    console.log('2. Rode: chmod 600 .env');
    console.log('3. Ajuste config.json (defaultCardLast4, maxAmountPerRun).');
    console.log('4. Rode: node dist/index.js bet --dry-run   (valida o fluxo sem pagar).');
  });

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  program.parse();
}
