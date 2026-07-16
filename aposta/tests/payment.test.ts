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
