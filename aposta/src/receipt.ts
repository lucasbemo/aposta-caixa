import fs from 'node:fs';
import path from 'node:path';

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
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(list, null, 2));
}
