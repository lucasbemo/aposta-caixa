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
