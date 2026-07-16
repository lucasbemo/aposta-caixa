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
