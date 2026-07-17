# `aposta` CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local TypeScript CLI (`aposta`) that repeats a saved CAIXA lottery bet — login, IMAP OTP retrieval, select the "Carrinhos Favoritos" item, checkout — pausing for the user to type the CVV, then capturing the receipt.

**Architecture:** A Commander-based CLI that runs entirely on the user's machine. Pure, unit-tested modules (secrets, config, logger, otp, payment, receipt) surround a Playwright browser layer whose site choreography lives in `flow.ts` with all DOM selectors isolated in `selectors.ts`. The browser/flow layer is verified against the real site via a `--dry-run` mode (per the spec's Phase 0 spike), not unit tests, because CAIXA's markup is only knowable from the live site.

**Tech Stack:** Node.js 20+, TypeScript, Playwright (headed, persistent profile), imapflow + mailparser (Gmail IMAP), Commander (CLI), dotenv, Vitest (tests).

## Global Constraints

Every task's requirements implicitly include these, copied verbatim from `docs/PROD.md`:

- **Never persist the CVV.** Memory only, masked input, zeroed after submit; never in disk, log, history, or screenshot. (NFR-01, FR-06)
- **Never handle the full card number.** The card lives in the CAIXA account; only masked data (brand, last 4) is read. (NFR-01)
- **Single payment submit — never retried.** A failure after the pay click is never retried automatically. (NFR-03, §11, D9)
- **Fail safe before payment.** Any selector break / unexpected page aborts before payment; retrying is only safe there. (§11)
- **All DOM selectors live in `selectors.ts`** — nowhere else. (FR-10, NFR-05)
- **Secrets in `.env` with `chmod 600`**, no OS keychain; `.env` in `.gitignore`. (D7, NFR-01)
- **Browser is headed (visible) with a persistent profile.** No headless, no stealth/anti-detection, no CAPTCHA bypass. (D8, NG7)
- **Logs redact OTP, CVV, password, token, PII.** (NFR-01, NFR-04)
- **Personal use, single account.** (D1)
- The bet target is identified by the exact **"Carrinhos Favoritos" item name** in `CAIXA_CARRINHO_FAVORITO`. (§13, FR-05)

---

## Per-Task Completion Gate (MUST — non-negotiable)

**No task is "done", and execution NEVER advances to the next task, until that task's real test passes with observed success output.** This is a hard gate, not a guideline.

- **Tasks 1–7 (pure logic):** the gate is `npm test` (the **full** suite, not only the new file) exiting green. The task's own new tests must be part of that green run. A red or skipped suite blocks the next task.
- **Tasks 8–11 (browser/flow):** these cannot be unit-tested — the real test is running the step against the **live CAIXA site** and observing the described real-world outcome (browser opens / login succeeds / checkout info is correct / one bet confirmed). That observed success **is** the gate and requires the user present. A selector that doesn't resolve = gate failed = fix before advancing.
- **Task 12 (CLI):** the gate is `npm run build` clean **and** a successful `aposta bet --dry-run` reaching the payment page and stopping.

If a gate fails: stop, fix within the current task, re-run the test, and only then proceed. Never carry a failing test forward. Never mark a checkbox complete on an unverified step.

---

## File Structure

```
aposta/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── .env.example                 # template (no real secrets)
├── config.json                  # non-sensitive: card last4, max amount, timeout
├── src/
│   ├── index.ts                 # CLI entry: commander commands (setup, bet, history)
│   ├── secrets.ts               # load/validate .env (chmod 600)
│   ├── config.ts                # load config.json
│   ├── logger.ts                # structured, redacted logging
│   ├── otp.ts                   # extract code + IMAP poll loop
│   ├── payment.ts               # CVV validation, confirmation line, spend guardrail, masked prompt
│   ├── receipt.ts               # history append/read
│   ├── browser.ts               # Playwright headed persistent context
│   ├── selectors.ts             # ALL CAIXA DOM selectors (single source)
│   └── flow.ts                  # site choreography (login → OTP → carrinho → checkout → pay → receipt)
└── tests/
    ├── secrets.test.ts
    ├── config.test.ts
    ├── logger.test.ts
    ├── otp.test.ts
    ├── payment.test.ts
    └── receipt.test.ts
```

`flow.ts` and `browser.ts` have no unit test file by design — they are verified via `aposta bet --dry-run` against the live site (Task 9–11).

---

### Task 1: Project scaffold

**Files:**
- Create: `aposta/package.json`, `aposta/tsconfig.json`, `aposta/vitest.config.ts`, `aposta/.gitignore`, `aposta/.env.example`, `aposta/config.json`
- Create: `aposta/src/index.ts` (placeholder), `aposta/tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a compiling, test-running project. `npm test` and `npm run build` both succeed.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "aposta",
  "version": "0.1.0",
  "type": "module",
  "bin": { "aposta": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "dotenv": "^16.4.5",
    "imapflow": "^1.0.164",
    "mailparser": "^3.7.1",
    "playwright": "^1.47.0"
  },
  "devDependencies": {
    "@types/mailparser": "^3.4.4",
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`, `.gitignore`, `.env.example`, `config.json`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

`.gitignore`:
```
node_modules/
dist/
.env
profile/
receipts/
```

`.env.example`:
```
CAIXA_CPF=
CAIXA_PASSWORD=
CAIXA_CARRINHO_FAVORITO=Mega da família
GMAIL_ADDRESS=
GMAIL_APP_PASSWORD=
```

`config.json`:
```json
{
  "defaultCardLast4": "1234",
  "maxAmountPerRun": 30.0,
  "otpPollTimeoutSec": 90
}
```

- [ ] **Step 4: Create placeholder `src/index.ts` and `tests/smoke.test.ts`**

`src/index.ts`:
```ts
export const APP_NAME = 'aposta';
```

`tests/smoke.test.ts`:
```ts
import { expect, test } from 'vitest';
import { APP_NAME } from '../src/index.js';

test('app name is defined', () => {
  expect(APP_NAME).toBe('aposta');
});
```

- [ ] **Step 5: Install and verify**

Run: `cd aposta && npm install && npx playwright install chromium && npm test && npm run build`
Expected: install succeeds; `npm test` shows 1 passing test; `npm run build` produces `dist/` with no errors.

- [ ] **Step 6: Commit**

```bash
cd aposta && git init && git add -A && git commit -m "chore: scaffold aposta CLI project"
```

---

### Task 2: Secrets module (`.env` loading + permission gate)

**Files:**
- Create: `aposta/src/secrets.ts`
- Test: `aposta/tests/secrets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Secrets { caixaCpf: string; caixaPassword: string; caixaCarrinhoFavorito: string; gmailAddress: string; gmailAppPassword: string }` and `loadSecrets(envPath: string): Secrets`. Throws on wrong file permission or a missing variable.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSecrets } from '../src/secrets.js';

const tmp: string[] = [];
function writeEnv(content: string, mode: number): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aposta-')), '.env');
  fs.writeFileSync(p, content);
  fs.chmodSync(p, mode);
  tmp.push(p);
  return p;
}
afterEach(() => { tmp.forEach((p) => fs.rmSync(path.dirname(p), { recursive: true, force: true })); tmp.length = 0; });

const FULL = [
  'CAIXA_CPF=12345678900',
  'CAIXA_PASSWORD=secret',
  'CAIXA_CARRINHO_FAVORITO=Mega da família',
  'GMAIL_ADDRESS=me@gmail.com',
  'GMAIL_APP_PASSWORD=abcd efgh ijkl mnop',
].join('\n');

test('loads all secrets from a 600 .env', () => {
  const s = loadSecrets(writeEnv(FULL, 0o600));
  expect(s.caixaCarrinhoFavorito).toBe('Mega da família');
  expect(s.gmailAppPassword).toBe('abcd efgh ijkl mnop');
});

test('rejects a world-readable .env', () => {
  expect(() => loadSecrets(writeEnv(FULL, 0o644))).toThrow(/600/);
});

test('rejects a .env missing a required variable', () => {
  const partial = FULL.split('\n').filter((l) => !l.startsWith('GMAIL_APP_PASSWORD')).join('\n');
  expect(() => loadSecrets(writeEnv(partial, 0o600))).toThrow(/GMAIL_APP_PASSWORD/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/secrets.test.ts`
Expected: FAIL — cannot find module `../src/secrets.js`.

- [ ] **Step 3: Write minimal implementation**

`src/secrets.ts`:
```ts
import fs from 'node:fs';
import dotenv from 'dotenv';

export interface Secrets {
  caixaCpf: string;
  caixaPassword: string;
  caixaCarrinhoFavorito: string;
  gmailAddress: string;
  gmailAppPassword: string;
}

const REQUIRED = [
  'CAIXA_CPF',
  'CAIXA_PASSWORD',
  'CAIXA_CARRINHO_FAVORITO',
  'GMAIL_ADDRESS',
  'GMAIL_APP_PASSWORD',
] as const;

export function loadSecrets(envPath: string): Secrets {
  const mode = fs.statSync(envPath).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(`.env deve ter permissão 600 (atual: ${mode.toString(8)}). Rode: chmod 600 ${envPath}`);
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const key of REQUIRED) {
    if (!parsed[key]) throw new Error(`Variável ausente no .env: ${key}`);
  }
  return {
    caixaCpf: parsed.CAIXA_CPF,
    caixaPassword: parsed.CAIXA_PASSWORD,
    caixaCarrinhoFavorito: parsed.CAIXA_CARRINHO_FAVORITO,
    gmailAddress: parsed.GMAIL_ADDRESS,
    gmailAppPassword: parsed.GMAIL_APP_PASSWORD,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/secrets.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/secrets.ts tests/secrets.test.ts && git commit -m "feat: load and permission-gate .env secrets"
```

---

### Task 3: Config module

**Files:**
- Create: `aposta/src/config.ts`
- Test: `aposta/tests/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Config { defaultCardLast4: string; maxAmountPerRun: number; otpPollTimeoutSec: number }` and `loadConfig(configPath: string): Config`. Missing optional fields fall back to defaults (`maxAmountPerRun: 30`, `otpPollTimeoutSec: 90`); `defaultCardLast4` is required.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

function writeConfig(obj: unknown): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aposta-cfg-')), 'config.json');
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

test('applies defaults for optional fields', () => {
  const c = loadConfig(writeConfig({ defaultCardLast4: '1234' }));
  expect(c.maxAmountPerRun).toBe(30);
  expect(c.otpPollTimeoutSec).toBe(90);
});

test('keeps provided values', () => {
  const c = loadConfig(writeConfig({ defaultCardLast4: '9999', maxAmountPerRun: 10, otpPollTimeoutSec: 60 }));
  expect(c).toEqual({ defaultCardLast4: '9999', maxAmountPerRun: 10, otpPollTimeoutSec: 60 });
});

test('throws when defaultCardLast4 is missing', () => {
  expect(() => loadConfig(writeConfig({}))).toThrow(/defaultCardLast4/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 3: Write minimal implementation**

`src/config.ts`:
```ts
import fs from 'node:fs';

export interface Config {
  defaultCardLast4: string;
  maxAmountPerRun: number;
  otpPollTimeoutSec: number;
}

export function loadConfig(configPath: string): Config {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<Config>;
  if (!raw.defaultCardLast4) throw new Error('config.json: defaultCardLast4 é obrigatório');
  return {
    defaultCardLast4: raw.defaultCardLast4,
    maxAmountPerRun: raw.maxAmountPerRun ?? 30,
    otpPollTimeoutSec: raw.otpPollTimeoutSec ?? 90,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts && git commit -m "feat: load config.json with defaults"
```

---

### Task 4: Logger + redaction

**Files:**
- Create: `aposta/src/logger.ts`
- Test: `aposta/tests/logger.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `redact(text: string): string` — masks CPF patterns and any run of 4+ consecutive digits (covers OTP and CVV-shaped values).
  - `createLogger(sink?: (line: string) => void): Logger` where `interface Logger { step(name: string, status: 'ok' | 'fail'): void; info(msg: string): void; error(msg: string): void }`. Every line passes through `redact` before reaching the sink. Default sink is `console.log`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { redact, createLogger } from '../src/logger.js';

test('redact masks CPF and 4+ digit runs', () => {
  expect(redact('cpf 123.456.789-00 ok')).not.toContain('123.456.789-00');
  expect(redact('code 481529')).not.toContain('481529');
  expect(redact('cvv 123')).toContain('123'); // 3 digits left as-is; CVV is never logged by design
});

test('logger routes lines through redact', () => {
  const lines: string[] = [];
  const log = createLogger((l) => lines.push(l));
  log.info('otp is 481529');
  expect(lines[0]).not.toContain('481529');
});

test('logger.step formats name and status', () => {
  const lines: string[] = [];
  const log = createLogger((l) => lines.push(l));
  log.step('login', 'ok');
  expect(lines[0]).toMatch(/login.*ok/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/logger.test.ts`
Expected: FAIL — cannot find module `../src/logger.js`.

- [ ] **Step 3: Write minimal implementation**

`src/logger.ts`:
```ts
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const DIGIT_RUN = /\d{4,}/g;

export function redact(text: string): string {
  return text.replace(CPF, '[REDACTED_CPF]').replace(DIGIT_RUN, '[REDACTED]');
}

export interface Logger {
  step(name: string, status: 'ok' | 'fail'): void;
  info(msg: string): void;
  error(msg: string): void;
}

export function createLogger(sink: (line: string) => void = console.log): Logger {
  const emit = (line: string) => sink(redact(line));
  return {
    step: (name, status) => emit(`[step] ${name} — ${status}`),
    info: (msg) => emit(`[info] ${msg}`),
    error: (msg) => emit(`[error] ${msg}`),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/logger.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/logger.ts tests/logger.test.ts && git commit -m "feat: redacted structured logger"
```

---

### Task 5: OTP extraction + poll loop

**Files:**
- Create: `aposta/src/otp.ts`
- Test: `aposta/tests/otp.test.ts`

**Interfaces:**
- Consumes: nothing (the IMAP fetch is injected for testability).
- Produces:
  - `extractOtp(emailBody: string): string | null` — returns the first standalone 6-digit run, else null. **Phase 0 note:** confirm CAIXA's real code length during the codegen walkthrough; adjust the `{6}` quantifier here if it differs.
  - `pollForOtp(fetchLatestBody, opts): Promise<string | null>` where `fetchLatestBody: () => Promise<string | null>` returns the newest matching email body (or null), and `opts: { timeoutMs: number; intervalMs: number; sleep: (ms: number) => Promise<void>; now: () => number }`. Loops until a code is found or the timeout elapses.
  - `fetchLatestCaixaEmail(imap): () => Promise<string | null>` — a factory that binds IMAP config into a `fetchLatestBody`. Verified manually in Task 9 (needs a live mailbox), not unit-tested.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, vi } from 'vitest';
import { extractOtp, pollForOtp } from '../src/otp.js';

test('extractOtp finds a 6-digit code', () => {
  expect(extractOtp('Seu código é 481529. Não compartilhe.')).toBe('481529');
  expect(extractOtp('sem código aqui')).toBeNull();
});

test('pollForOtp returns as soon as a code appears', async () => {
  let calls = 0;
  const fetch = vi.fn(async () => (++calls >= 2 ? 'código 481529' : null));
  const code = await pollForOtp(fetch, {
    timeoutMs: 10_000, intervalMs: 1, sleep: async () => {}, now: () => calls * 1000,
  });
  expect(code).toBe('481529');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('pollForOtp returns null on timeout', async () => {
  let t = 0;
  const code = await pollForOtp(async () => null, {
    timeoutMs: 100, intervalMs: 10, sleep: async () => {}, now: () => (t += 30),
  });
  expect(code).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/otp.test.ts`
Expected: FAIL — cannot find module `../src/otp.js`.

- [ ] **Step 3: Write minimal implementation**

`src/otp.ts`:
```ts
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export function extractOtp(emailBody: string): string | null {
  const m = emailBody.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

export interface PollOpts {
  timeoutMs: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export async function pollForOtp(
  fetchLatestBody: () => Promise<string | null>,
  opts: PollOpts,
): Promise<string | null> {
  const start = opts.now();
  while (opts.now() - start < opts.timeoutMs) {
    const body = await fetchLatestBody();
    if (body) {
      const code = extractOtp(body);
      if (code) return code;
    }
    await opts.sleep(opts.intervalMs);
  }
  return null;
}

export interface ImapConfig {
  host: string;   // imap.gmail.com
  user: string;
  pass: string;
  senderFilter: string; // e.g. 'caixa.gov.br'
}

// Verified manually in Task 9 (needs a live mailbox).
export function fetchLatestCaixaEmail(cfg: ImapConfig): () => Promise<string | null> {
  return async () => {
    const client = new ImapFlow({
      host: cfg.host, port: 993, secure: true,
      auth: { user: cfg.user, pass: cfg.pass }, logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ seen: false, from: cfg.senderFilter }, { uid: true });
        if (!uids.length) return null;
        const msg = await client.fetchOne(String(uids[uids.length - 1]), { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        const parsed = await simpleParser(msg.source);
        return parsed.text ?? parsed.html ?? null;
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/otp.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/otp.ts tests/otp.test.ts && git commit -m "feat: OTP extraction and injectable poll loop"
```

---

### Task 6: Payment logic (CVV validation, confirmation line, spend guardrail, masked prompt)

**Files:**
- Create: `aposta/src/payment.ts`
- Test: `aposta/tests/payment.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `validateCvv(input: string): boolean` — true for exactly 3 or 4 digits.
  - `checkSpendGuardrail(amount: number, max: number): void` — throws if `amount > max`.
  - `interface ConfirmationDetails { lottery: string; contest: string; amount: number; cardLast4: string }`
  - `formatConfirmation(d: ConfirmationDetails): string` — e.g. `"Mega-Sena #2870 · R$ 6.00 · cartão •••• 1234"`.
  - `promptHiddenCvv(question?: string): Promise<string>` — masked TTY input; returned string is the CVV, held only in the caller's memory. Verified manually (needs a TTY), not unit-tested.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { validateCvv, checkSpendGuardrail, formatConfirmation } from '../src/payment.js';

test('validateCvv accepts 3-4 digits only', () => {
  expect(validateCvv('123')).toBe(true);
  expect(validateCvv('1234')).toBe(true);
  expect(validateCvv('12')).toBe(false);
  expect(validateCvv('12a')).toBe(false);
});

test('checkSpendGuardrail throws above the limit', () => {
  expect(() => checkSpendGuardrail(31, 30)).toThrow(/limite/);
  expect(() => checkSpendGuardrail(30, 30)).not.toThrow();
});

test('formatConfirmation renders all fields', () => {
  const line = formatConfirmation({ lottery: 'Mega-Sena', contest: '2870', amount: 6, cardLast4: '1234' });
  expect(line).toContain('Mega-Sena');
  expect(line).toContain('#2870');
  expect(line).toContain('6.00');
  expect(line).toContain('1234');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/payment.test.ts`
Expected: FAIL — cannot find module `../src/payment.js`.

- [ ] **Step 3: Write minimal implementation**

`src/payment.ts`:
```ts
import readline from 'node:readline';

export function validateCvv(input: string): boolean {
  return /^\d{3,4}$/.test(input);
}

export function checkSpendGuardrail(amount: number, max: number): void {
  if (amount > max) {
    throw new Error(`Valor R$ ${amount.toFixed(2)} excede o limite por execução R$ ${max.toFixed(2)}.`);
  }
}

export interface ConfirmationDetails {
  lottery: string;
  contest: string;
  amount: number;
  cardLast4: string;
}

export function formatConfirmation(d: ConfirmationDetails): string {
  return `${d.lottery} #${d.contest} · R$ ${d.amount.toFixed(2)} · cartão •••• ${d.cardLast4}`;
}

// Masked TTY input. Verified manually (Task 11). Never logged or persisted.
export function promptHiddenCvv(question = 'Digite o CVV: '): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = () => {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(question + '*'.repeat((rl as unknown as { line: string }).line.length));
    };
    process.stdin.on('data', onData);
    rl.question(question, (value) => {
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      rl.close();
      resolve(value.trim());
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/payment.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/payment.ts tests/payment.test.ts && git commit -m "feat: CVV validation, confirmation line, spend guardrail, masked prompt"
```

---

### Task 7: Receipt history

**Files:**
- Create: `aposta/src/receipt.ts`
- Test: `aposta/tests/receipt.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ReceiptRecord { id: string; lottery: string; contest: string; amount: number; cardLast4: string; confirmationNumber: string; screenshotPath: string; pdfPath: string; placedAt: string; status: 'CONFIRMED' | 'NOT_PLACED' | 'UNKNOWN' }`
  - `appendHistory(historyPath: string, record: ReceiptRecord): void`
  - `readHistory(historyPath: string): ReceiptRecord[]` — returns `[]` if the file does not exist.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendHistory, readHistory, type ReceiptRecord } from '../src/receipt.js';

function tmpHistory(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aposta-rec-')), 'history.json');
}
const rec = (id: string): ReceiptRecord => ({
  id, lottery: 'Mega-Sena', contest: '2870', amount: 6, cardLast4: '1234',
  confirmationNumber: 'ABC123', screenshotPath: '/s.png', pdfPath: '/s.pdf',
  placedAt: '2026-07-16T18:40:00-03:00', status: 'CONFIRMED',
});

test('readHistory on a missing file returns empty', () => {
  expect(readHistory(tmpHistory())).toEqual([]);
});

test('appendHistory accumulates records', () => {
  const p = tmpHistory();
  appendHistory(p, rec('a'));
  appendHistory(p, rec('b'));
  const all = readHistory(p);
  expect(all.map((r) => r.id)).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/receipt.test.ts`
Expected: FAIL — cannot find module `../src/receipt.js`.

- [ ] **Step 3: Write minimal implementation**

`src/receipt.ts`:
```ts
import fs from 'node:fs';

export interface ReceiptRecord {
  id: string;
  lottery: string;
  contest: string;
  amount: number;
  cardLast4: string;
  confirmationNumber: string;
  screenshotPath: string;
  pdfPath: string;
  placedAt: string;
  status: 'CONFIRMED' | 'NOT_PLACED' | 'UNKNOWN';
}

export function readHistory(historyPath: string): ReceiptRecord[] {
  if (!fs.existsSync(historyPath)) return [];
  return JSON.parse(fs.readFileSync(historyPath, 'utf8')) as ReceiptRecord[];
}

export function appendHistory(historyPath: string, record: ReceiptRecord): void {
  const list = readHistory(historyPath);
  list.push(record);
  fs.mkdirSync(historyPath.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(list, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/receipt.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/receipt.ts tests/receipt.test.ts && git commit -m "feat: local receipt history read/append"
```

---

### Task 8: Browser layer + selectors skeleton

**Files:**
- Create: `aposta/src/browser.ts`, `aposta/src/selectors.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `launchBrowser(profileDir: string): Promise<{ context: BrowserContext; page: Page }>` — headed persistent context, 1280×900.
  - `closeBrowser(context: BrowserContext): Promise<void>`
  - `selectors` object with typed groups: `login`, `otp`, `carrinhos`, `checkout`, `payment`, `receipt`. Values are **placeholders to be filled from the live site during the Phase 0 codegen walkthrough** — this task creates the shape; Task 9–11 fill and verify the values.

> This task has no unit test. Its verification is running the browser and seeing a real Chromium window open to the CAIXA site.

- [ ] **Step 1: Create `src/selectors.ts`**

```ts
// SINGLE SOURCE OF TRUTH for CAIXA DOM selectors.
// Values marked CONFIRMAR are placeholders — fill from `npx playwright codegen`
// against loteriasonline.caixa.gov.br during the Phase 0 walkthrough (Task 9).
export const CAIXA_URL = 'https://loteriasonline.caixa.gov.br/';

export const selectors = {
  login: {
    cpfInput: 'input[name="cpf"]',          // CONFIRMAR
    passwordInput: 'input[name="senha"]',   // CONFIRMAR
    submitButton: 'button[type="submit"]',  // CONFIRMAR
  },
  otp: {
    codeInput: 'input[name="codigo"]',      // CONFIRMAR
    submitButton: 'button[type="submit"]',  // CONFIRMAR
  },
  carrinhos: {
    menuLink: 'text=Carrinhos Favoritos',   // CONFIRMAR
    itemByName: (name: string) => `text=${name}`, // CONFIRMAR
    addToCartButton: 'text=Adicionar',      // CONFIRMAR
  },
  checkout: {
    goToCheckoutButton: 'text=Ir para pagamento', // CONFIRMAR
    totalAmount: '.total',                  // CONFIRMAR
    contestNumber: '.concurso',             // CONFIRMAR
    cardOptionByLast4: (l4: string) => `text=•••• ${l4}`, // CONFIRMAR
  },
  payment: {
    cvvInput: 'input[name="cvv"]',          // CONFIRMAR
    payButton: 'text=Confirmar pagamento',  // CONFIRMAR
  },
  receipt: {
    confirmationNumber: '.comprovante-numero', // CONFIRMAR
  },
} as const;
```

- [ ] **Step 2: Create `src/browser.ts`**

```ts
import { chromium, type BrowserContext, type Page } from 'playwright';

export async function launchBrowser(profileDir: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close();
}
```

- [ ] **Step 3: Manually verify the browser opens**

Create a throwaway `src/scratch-browser.ts`:
```ts
import { launchBrowser, closeBrowser } from './browser.js';
import { CAIXA_URL } from './selectors.js';
const { context, page } = await launchBrowser('./profile');
await page.goto(CAIXA_URL);
await page.waitForTimeout(4000);
await closeBrowser(context);
```
Run: `npx tsx src/scratch-browser.ts`
Expected: a visible Chromium window opens to the CAIXA site for ~4s, then closes. Delete `src/scratch-browser.ts` afterward.

- [ ] **Step 4: Commit**

```bash
git add src/browser.ts src/selectors.ts && git commit -m "feat: headed browser launcher and selectors skeleton"
```

---

### Task 9: Flow — login + OTP submit (Phase 0 codegen + real-site verification)

**Files:**
- Create: `aposta/src/flow.ts`
- Modify: `aposta/src/selectors.ts` (fill `login` + `otp` values from codegen)

**Interfaces:**
- Consumes: `launchBrowser`, `selectors`, `Secrets`, `fetchLatestCaixaEmail`, `pollForOtp`, `Logger`.
- Produces:
  - `login(page: Page, secrets: Secrets, log: Logger): Promise<void>`
  - `submitOtp(page: Page, secrets: Secrets, timeoutSec: number, log: Logger, promptFallback: () => Promise<string>): Promise<void>` — polls IMAP; on timeout calls `promptFallback` for a manually-pasted code.
  - `AbortBeforePayment` error class thrown by any flow step on an unexpected page.

- [ ] **Step 1: Codegen walkthrough to fill selectors**

Run: `npx playwright codegen https://loteriasonline.caixa.gov.br/`
Manually log in once. Copy the real selectors Playwright generates for the CPF input, password input, login submit, OTP code input, and OTP submit into `src/selectors.ts` (`login` and `otp` groups), replacing the CONFIRMAR placeholders. Also confirm the OTP digit count and adjust `extractOtp`'s `\d{6}` in `src/otp.ts` if needed.

- [ ] **Step 2: Implement `login` and `submitOtp`**

`src/flow.ts`:
```ts
import { type Page } from 'playwright';
import { selectors, CAIXA_URL } from './selectors.js';
import { type Secrets } from './secrets.js';
import { type Logger } from './logger.js';
import { fetchLatestCaixaEmail, pollForOtp } from './otp.js';

export class AbortBeforePayment extends Error {}

export async function login(page: Page, secrets: Secrets, log: Logger): Promise<void> {
  await page.goto(CAIXA_URL);
  await page.fill(selectors.login.cpfInput, secrets.caixaCpf);
  await page.fill(selectors.login.passwordInput, secrets.caixaPassword);
  await page.click(selectors.login.submitButton);
  log.step('login', 'ok');
}

export async function submitOtp(
  page: Page,
  secrets: Secrets,
  timeoutSec: number,
  log: Logger,
  promptFallback: () => Promise<string>,
): Promise<void> {
  const fetchBody = fetchLatestCaixaEmail({
    host: 'imap.gmail.com', user: secrets.gmailAddress,
    pass: secrets.gmailAppPassword, senderFilter: 'caixa.gov.br',
  });
  let code = await pollForOtp(fetchBody, {
    timeoutMs: timeoutSec * 1000, intervalMs: 3000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(),
  });
  if (!code) {
    log.info('OTP não chegou no tempo — solicitando código manual.');
    code = await promptFallback();
  }
  await page.fill(selectors.otp.codeInput, code);
  await page.click(selectors.otp.submitButton);
  log.step('otp', 'ok');
}
```

- [ ] **Step 3: Verify against the real site**

Create a throwaway `src/scratch-login.ts` that loads secrets/config, calls `login` then `submitOtp` (fallback = a `readline` question), and stops. Run: `npx tsx src/scratch-login.ts`
Expected: browser logs in; the tool auto-fills the OTP fetched from Gmail (or prompts you to paste it) and reaches the logged-in dashboard. Delete the scratch file.

- [ ] **Step 4: Commit**

```bash
git add src/flow.ts src/selectors.ts src/otp.ts && git commit -m "feat: login + OTP submit flow verified against live site"
```

---

### Task 10: Flow — select Carrinho Favorito + checkout to payment

**Files:**
- Modify: `aposta/src/flow.ts`, `aposta/src/selectors.ts` (fill `carrinhos` + `checkout` values)

**Interfaces:**
- Consumes: `login`, `submitOtp` (Task 9), `selectors`, `checkSpendGuardrail`.
- Produces:
  - `interface CheckoutInfo { lottery: string; contest: string; amount: number; cardLast4: string }`
  - `selectCarrinhoFavoritoAndCheckout(page: Page, secrets: Secrets, cardLast4: string, log: Logger): Promise<CheckoutInfo>` — navigates to Carrinhos Favoritos, selects the item named `secrets.caixaCarrinhoFavorito`, adds to cart, goes to checkout, selects the saved card, and scrapes lottery/contest/amount. Throws `AbortBeforePayment` if the named item or checkout controls are absent.

- [ ] **Step 1: Codegen to fill `carrinhos` + `checkout` selectors**

Continue the `npx playwright codegen` session (or re-run it) through: opening Carrinhos Favoritos, selecting the item, adding to cart, going to checkout, selecting the saved card. Fill the `carrinhos` and `checkout` groups in `src/selectors.ts`, and confirm the selectors that expose the contest number and total amount.

- [ ] **Step 2: Implement the checkout navigation**

Append to `src/flow.ts`:
```ts
import { checkSpendGuardrail } from './payment.js';

export interface CheckoutInfo {
  lottery: string;
  contest: string;
  amount: number;
  cardLast4: string;
}

export async function selectCarrinhoFavoritoAndCheckout(
  page: Page,
  secrets: Secrets,
  cardLast4: string,
  log: Logger,
): Promise<CheckoutInfo> {
  await page.click(selectors.carrinhos.menuLink);
  const item = page.locator(selectors.carrinhos.itemByName(secrets.caixaCarrinhoFavorito));
  if ((await item.count()) === 0) {
    throw new AbortBeforePayment(`Item "${secrets.caixaCarrinhoFavorito}" não encontrado em Carrinhos Favoritos.`);
  }
  await item.first().click();
  await page.click(selectors.carrinhos.addToCartButton);
  await page.click(selectors.checkout.goToCheckoutButton);
  await page.click(selectors.checkout.cardOptionByLast4(cardLast4));

  const amountText = (await page.locator(selectors.checkout.totalAmount).innerText()).trim();
  const contest = (await page.locator(selectors.checkout.contestNumber).innerText()).trim();
  const amount = parseAmount(amountText);
  log.step('checkout', 'ok');
  return { lottery: secrets.caixaCarrinhoFavorito, contest, amount, cardLast4 };
}

export function parseAmount(text: string): number {
  // "R$ 6,00" -> 6.00
  const cleaned = text.replace(/[^\d,]/g, '').replace(',', '.');
  return Number(cleaned);
}
```

- [ ] **Step 3: Verify with `--dry-run` behavior manually**

Extend the throwaway scratch script to call `selectCarrinhoFavoritoAndCheckout` after login/OTP and `console.log` the returned `CheckoutInfo`, then stop **before** any payment. Run it: `npx tsx src/scratch-login.ts`
Expected: reaches the payment page, prints correct lottery/contest/amount/card last-4, and stops without paying. Delete the scratch file.

- [ ] **Step 4: Commit**

```bash
git add src/flow.ts src/selectors.ts && git commit -m "feat: carrinho favorito selection + checkout to payment"
```

---

### Task 11: Flow — payment submit, receipt capture, reconciliation

**Files:**
- Modify: `aposta/src/flow.ts`, `aposta/src/selectors.ts` (fill `payment` + `receipt` values)

**Interfaces:**
- Consumes: `CheckoutInfo`, `selectors`, `promptHiddenCvv`, `validateCvv`, `ReceiptRecord`, `appendHistory`.
- Produces:
  - `submitPaymentAndCapture(page, info, cvv, receiptsDir, log): Promise<ReceiptRecord>` — fills CVV, clicks pay **exactly once**, waits for the confirmation page, captures screenshot + PDF + confirmation number, returns a `CONFIRMED` record. On post-submit timeout it does **not** retry — it calls `reconcileViaHistory`.
  - `reconcileViaHistory(page, info, log): Promise<'CONFIRMED' | 'NOT_PLACED' | 'UNKNOWN'>` — navigates to the account's bet history and checks whether the contest bet exists.

- [ ] **Step 1: Codegen to fill `payment` + `receipt` selectors**

**Do this with a real, cheap bet you intend to place.** Continue codegen through the CVV field, the pay button, the confirmation page (confirmation number location), and the account bet-history page. Fill the `payment` and `receipt` selector groups.

- [ ] **Step 2: Implement payment + capture + reconciliation**

Append to `src/flow.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { promptHiddenCvv, validateCvv } from './payment.js';
import { appendHistory, type ReceiptRecord } from './receipt.js';

export async function submitPaymentAndCapture(
  page: Page,
  info: CheckoutInfo,
  cvv: string,
  receiptsDir: string,
  log: Logger,
): Promise<ReceiptRecord> {
  if (!validateCvv(cvv)) throw new AbortBeforePayment('CVV inválido (esperado 3–4 dígitos).');
  await page.fill(selectors.payment.cvvInput, cvv);

  const id = `${info.contest}-${Date.now()}`;
  fs.mkdirSync(receiptsDir, { recursive: true });
  const screenshotPath = path.join(receiptsDir, `${id}.png`);
  const pdfPath = path.join(receiptsDir, `${id}.pdf`);

  // SINGLE submit — never retried.
  await page.click(selectors.payment.payButton);

  try {
    await page.waitForSelector(selectors.receipt.confirmationNumber, { timeout: 30_000 });
  } catch {
    log.step('payment', 'fail');
    const status = await reconcileViaHistory(page, info, log);
    return buildRecord(id, info, '', screenshotPath, pdfPath, status);
  }

  const confirmationNumber = (await page.locator(selectors.receipt.confirmationNumber).innerText()).trim();
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.pdf({ path: pdfPath }).catch(() => { /* pdf only in chromium headless; screenshot is the source of truth */ });
  log.step('payment', 'ok');
  return buildRecord(id, info, confirmationNumber, screenshotPath, pdfPath, 'CONFIRMED');
}

function buildRecord(
  id: string, info: CheckoutInfo, confirmationNumber: string,
  screenshotPath: string, pdfPath: string, status: ReceiptRecord['status'],
): ReceiptRecord {
  return {
    id, lottery: info.lottery, contest: info.contest, amount: info.amount,
    cardLast4: info.cardLast4, confirmationNumber, screenshotPath, pdfPath,
    placedAt: new Date().toISOString(), status,
  };
}

export async function reconcileViaHistory(
  page: Page, info: CheckoutInfo, log: Logger,
): Promise<'CONFIRMED' | 'NOT_PLACED' | 'UNKNOWN'> {
  try {
    await page.goto('https://loteriasonline.caixa.gov.br/silce-web/#/mch/carrinho-favorito'); // CONFIRMAR histórico URL
    const found = await page.locator(`text=${info.contest}`).count();
    const status = found > 0 ? 'CONFIRMED' : 'NOT_PLACED';
    log.info(`Reconciliação: ${status}`);
    return status;
  } catch {
    log.info('Reconciliação inconclusiva — verifique manualmente antes de rodar de novo.');
    return 'UNKNOWN';
  }
}
```

- [ ] **Step 3: Verify with a real bet**

Wire a throwaway scratch that runs the full chain and calls `submitPaymentAndCapture` with a CVV from `promptHiddenCvv()`. Run it and place one real, low-cost bet.
Expected: CVV prompt is masked; exactly one payment submit occurs; a receipt PNG is written to `receipts/`; the returned record is `CONFIRMED` with a real confirmation number. Delete the scratch file.

- [ ] **Step 4: Commit**

```bash
git add src/flow.ts src/selectors.ts && git commit -m "feat: single-submit payment, receipt capture, history reconciliation"
```

---

### Task 12: CLI wiring (`setup`, `bet`, `bet --dry-run`, `history`)

**Files:**
- Modify: `aposta/src/index.ts`

**Interfaces:**
- Consumes: every module above.
- Produces: the `aposta` executable with four commands, orchestration, and the §11 error handling (abort-before-payment surfaces a clear message; CAPTCHA/unexpected page never crashes into a retry).

- [ ] **Step 1: Implement the CLI**

`src/index.ts`:
```ts
#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { loadSecrets } from './secrets.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { launchBrowser, closeBrowser } from './browser.js';
import { promptHiddenCvv, formatConfirmation, checkSpendGuardrail } from './payment.js';
import { readHistory, appendHistory } from './receipt.js';
import {
  login, submitOtp, selectCarrinhoFavoritoAndCheckout,
  submitPaymentAndCapture, AbortBeforePayment,
} from './flow.js';

export const APP_NAME = 'aposta';

const HOME = path.join(os.homedir(), 'aposta');
const ENV_PATH = path.resolve('.env');
const CONFIG_PATH = path.resolve('config.json');
const PROFILE_DIR = path.resolve('profile');
const RECEIPTS_DIR = path.join(HOME, 'receipts');
const HISTORY_PATH = path.join(RECEIPTS_DIR, 'history.json');

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
    await login(page, secrets, log);
    await submitOtp(page, secrets, config.otpPollTimeoutSec, log, () => askLine('Cole o código do e-mail: '));
    const info = await selectCarrinhoFavoritoAndCheckout(page, secrets, config.defaultCardLast4, log);
    checkSpendGuardrail(info.amount, config.maxAmountPerRun);

    console.log(`\n${formatConfirmation(info)}`);
    if (dryRun) { console.log('DRY-RUN: parando antes do pagamento.'); return; }

    const proceed = await askLine('Confirmar e pagar? (s/N) ');
    if (proceed.toLowerCase() !== 's') { console.log('Cancelado pelo usuário.'); return; }

    const cvv = await promptHiddenCvv('Digite o CVV: ');
    const record = await submitPaymentAndCapture(page, info, cvv, RECEIPTS_DIR, log);
    appendHistory(HISTORY_PATH, record);
    console.log(
      record.status === 'CONFIRMED'
        ? `✅ Aposta confirmada — comprovante ${record.confirmationNumber} salvo em ${record.screenshotPath}`
        : `⚠️ Status ${record.status}. Verifique antes de rodar de novo.`,
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

program.command('bet')
  .description('Executa a aposta')
  .option('--dry-run', 'Para antes do pagamento', false)
  .action((opts) => runBet(Boolean(opts.dryRun)));

program.command('history')
  .description('Lista apostas anteriores')
  .action(() => {
    for (const r of readHistory(HISTORY_PATH)) {
      console.log(`${r.placedAt} · ${r.lottery} #${r.contest} · R$ ${r.amount.toFixed(2)} · ${r.status} · ${r.confirmationNumber}`);
    }
  });

program.command('setup')
  .description('Instruções de configuração inicial')
  .action(() => {
    console.log('1. Copie .env.example para .env e preencha os valores.');
    console.log(`2. Rode: chmod 600 .env`);
    console.log('3. Ajuste config.json (defaultCardLast4, maxAmountPerRun).');
    console.log('4. Rode: aposta bet --dry-run  (para validar o fluxo sem pagar).');
  });

// Only parse argv when executed directly (keeps APP_NAME importable in tests).
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  program.parse();
}
```

- [ ] **Step 2: Verify the smoke test still passes**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS (the `APP_NAME` export is preserved).

- [ ] **Step 3: Verify the CLI end-to-end with `--dry-run`**

Run: `npm run build && node dist/index.js bet --dry-run`
Expected: browser opens, logs in, fetches OTP, reaches the payment page, prints the confirmation line, then prints "DRY-RUN: parando antes do pagamento." and closes without paying.

- [ ] **Step 4: Verify `history`**

Run: `node dist/index.js history`
Expected: prints one line per past bet (the real bet from Task 11), or nothing if none.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts && git commit -m "feat: wire CLI commands setup/bet/bet --dry-run/history"
```

---

## Self-Review

**Spec coverage** (each `docs/PROD.md` item → task):

- FR-01 secrets in .env chmod 600 → Task 2 ✓
- FR-02 IMAP OTP poll → Task 5 (+ live wiring Task 9) ✓
- FR-03 OTP manual fallback → Task 9 (`promptFallback`) + Task 12 (`askLine`) ✓
- FR-04 browser automation login→checkout → Tasks 8–10 ✓
- FR-05 select Carrinho Favorito by exact name → Task 10 ✓
- FR-06 CVV memory-only, masked, never persisted → Task 6 + Task 11 ✓
- FR-07 explicit confirmation before pay → Task 6 `formatConfirmation` + Task 12 confirm prompt ✓
- FR-08 receipt capture + history → Task 7 + Task 11 ✓
- FR-09 notifications (success/failure/action) → Task 12 console output ✓
- FR-10 selectors centralized → Task 8 `selectors.ts` (enforced throughout) ✓
- FR-11 `--dry-run` → Task 12 ✓
- FR-12 contest cutoff → **partially**: reconciliation/abort covers closed-contest errors, but an explicit pre-check isn't a separate step. Acceptable — it is a "Should", surfaced via `AbortBeforePayment` when the site rejects a closed contest. Noted as a follow-up.
- FR-13 spend guardrail → Task 6 `checkSpendGuardrail` + Task 12 ✓
- NFR-01 security (CVV/PAN/redaction) → Tasks 4, 6, 11 ✓
- NFR-03 single submit, no retry → Task 11 ✓
- §11 fail-before-payment + reconciliation → `AbortBeforePayment` (Tasks 9–11) + `reconcileViaHistory` (Task 11) ✓
- §16 Phase 0 codegen spike → embedded in Tasks 9–11 Step 1 ✓

**Placeholder scan:** Selector *values* marked CONFIRMAR are intentional — they can only come from the live site and are filled during Tasks 9–11 Step 1 (codegen). Every code step otherwise contains complete, runnable code. No "TODO/implement later" in logic.

**Type consistency:** `CheckoutInfo` (Task 10) is consumed unchanged by Task 11 and Task 12. `ReceiptRecord` (Task 7) is produced by Task 11 and read by Task 12. `Secrets` (Task 2) / `Config` (Task 3) field names match every consumer. `AbortBeforePayment` is defined once (Task 9) and caught in Task 12. `promptHiddenCvv`, `validateCvv`, `checkSpendGuardrail`, `formatConfirmation` signatures are consistent between Task 6 and their consumers.

**Open follow-up (non-blocking):** FR-12 explicit cutoff pre-check and the Teimosinha viability question (§17) remain Phase 0 research items to confirm before or during Task 9.
