import { expect, test } from 'vitest';
import { APP_NAME } from '../src/index.js';

test('app name is defined', () => {
  expect(APP_NAME).toBe('aposta');
});
