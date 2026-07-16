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
