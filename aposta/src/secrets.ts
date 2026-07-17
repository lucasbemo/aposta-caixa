import fs from 'node:fs';
import dotenv from 'dotenv';

export interface Secrets {
  caixaCpf: string;
  caixaPassword: string;
  caixaCarrinhoFavorito: string;
  gmailAddress: string;
  gmailAppPassword: string;
  /** OPTIONAL card CVV for auto-fill. Storing it reverses the "CVV never
   * persisted" design — plaintext in .env. If unset, the CLI prompts for it. */
  caixaCardCvv?: string;
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
    caixaCardCvv: parsed.CAIXA_CARD_CVV || undefined, // optional
  };
}
