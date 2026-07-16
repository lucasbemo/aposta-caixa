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
import { formatConfirmation, checkSpendGuardrail } from './payment.js';
import { readHistory } from './receipt.js';
import {
  login,
  submitOtpAndPassword,
  selectCarrinhoFavoritoAndCheckout,
  debugVisibleControls,
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

    // Capture the checkout DOM so the remaining CONFIRMAR selectors (amount,
    // contest, receipt) can be finalized safely.
    fs.mkdirSync(DUMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(DUMP_DIR, 'live_checkout.txt'), await debugVisibleControls(page));

    console.log(`\nNo checkout: ${formatConfirmation(info)}`);
    console.log('Dump do checkout salvo em dom-dumps/live_checkout.txt');
    console.log(
      dryRun
        ? 'DRY-RUN: parando antes do pagamento. Nenhuma aposta feita.'
        : 'PAGAMENTO REAL ainda não habilitado (Task 11 pende validação do dry-run). Parando antes de pagar.',
    );
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
