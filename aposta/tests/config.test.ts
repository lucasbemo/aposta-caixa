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
