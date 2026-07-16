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
