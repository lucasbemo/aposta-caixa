import fs from 'node:fs';

export interface Config {
  defaultCardLast4: string;
  maxAmountPerRun: number;
  otpPollTimeoutSec: number;
}

export function loadConfig(configPath: string): Config {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<Config>;
  if (!raw.defaultCardLast4) throw new Error('config.json: defaultCardLast4 é obrigatório');
  return {
    defaultCardLast4: raw.defaultCardLast4,
    maxAmountPerRun: raw.maxAmountPerRun ?? 30,
    otpPollTimeoutSec: raw.otpPollTimeoutSec ?? 90,
  };
}
