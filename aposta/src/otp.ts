import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export function extractOtp(emailBody: string): string | null {
  const m = emailBody.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

export interface PollOpts {
  timeoutMs: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export async function pollForOtp(
  fetchLatestBody: () => Promise<string | null>,
  opts: PollOpts,
): Promise<string | null> {
  const start = opts.now();
  while (opts.now() - start < opts.timeoutMs) {
    const body = await fetchLatestBody();
    if (body) {
      const code = extractOtp(body);
      if (code) return code;
    }
    await opts.sleep(opts.intervalMs);
  }
  return null;
}

export interface ImapConfig {
  host: string;   // imap.gmail.com
  user: string;
  pass: string;
  senderFilter: string; // e.g. 'caixa.gov.br'
}

// Verified manually in Task 9 (needs a live mailbox).
export function fetchLatestCaixaEmail(cfg: ImapConfig): () => Promise<string | null> {
  return async () => {
    const client = new ImapFlow({
      host: cfg.host, port: 993, secure: true,
      auth: { user: cfg.user, pass: cfg.pass }, logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ seen: false, from: cfg.senderFilter }, { uid: true });
        if (uids === false || !uids.length) return null;
        const msg = await client.fetchOne(String(uids[uids.length - 1]), { source: true }, { uid: true });
        if (msg === false || !msg.source) return null;
        const parsed = await simpleParser(msg.source);
        return (parsed.text || parsed.html || null) as string | null;
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  };
}
