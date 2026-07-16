const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const DIGIT_RUN = /\d{4,}/g;

export function redact(text: string): string {
  return text.replace(CPF, '[REDACTED_CPF]').replace(DIGIT_RUN, '[REDACTED]');
}

export interface Logger {
  step(name: string, status: 'ok' | 'fail'): void;
  info(msg: string): void;
  error(msg: string): void;
}

export function createLogger(sink: (line: string) => void = console.log): Logger {
  const emit = (line: string) => sink(redact(line));
  return {
    step: (name, status) => emit(`[step] ${name} — ${status}`),
    info: (msg) => emit(`[info] ${msg}`),
    error: (msg) => emit(`[error] ${msg}`),
  };
}
