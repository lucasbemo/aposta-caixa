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
