// Flow 15 · push sender behind an interface: Expo push service (FCM on Android) or a mock that
// logs. Expo takes up to 100 messages per send and 1,000 ids per receipt call.
import { EXPO_BATCH, chunks } from '@arpedia/core';
import type { Env } from '../../env';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  ttl: number;
  priority: 'default' | 'high';
  channelId: string;
}

export type Ticket = { ok: true; id: string } | { ok: false; error: string };
export type Receipt = { status: 'delivered' } | { status: 'failed'; error: string };

export interface PushSender {
  /** One ticket per message, in order. Throws when the service stays down after retries. */
  send(messages: PushMessage[]): Promise<Ticket[]>;
  receipts(ids: string[]): Promise<Record<string, Receipt>>;
}

const EXPO = 'https://exp.host/--/api/v2/push';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST with 3 tries and backoff on 5xx, 429 and network errors. */
async function postJson(url: string, body: unknown, token?: string): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(500 * 2 ** attempt);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (r.ok) return await r.json();
      last = new Error(`expo ${r.status}`);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
type ExpoReceipt = { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } };

export function expoSender(token?: string): PushSender {
  return {
    async send(messages) {
      const out: Ticket[] = [];
      for (const batch of chunks(messages, EXPO_BATCH)) {
        const res = (await postJson(`${EXPO}/send`, batch, token)) as { data: ExpoTicket[] };
        for (const t of res.data)
          out.push(
            t.status === 'ok' ? { ok: true, id: t.id } : { ok: false, error: t.details?.error ?? t.message },
          );
      }
      return out;
    },
    async receipts(ids) {
      const out: Record<string, Receipt> = {};
      for (const batch of chunks(ids, 1000)) {
        const res = (await postJson(`${EXPO}/getReceipts`, { ids: batch }, token)) as {
          data: Record<string, ExpoReceipt>;
        };
        for (const [id, r] of Object.entries(res.data))
          out[id] =
            r.status === 'ok'
              ? { status: 'delivered' }
              : { status: 'failed', error: r.details?.error ?? r.message };
      }
      return out;
    },
  };
}

/** Local and tests: every push "succeeds" and is delivered; tokens starting with `bad` are dead. */
export function mockSender(): PushSender {
  return {
    async send(messages) {
      return messages.map((m) => {
        console.log(`[push] ${m.to.slice(0, 24)}… ${m.title} | ${m.body}`);
        return m.to.startsWith('bad')
          ? { ok: false, error: 'DeviceNotRegistered' }
          : { ok: true, id: `mock-${crypto.randomUUID()}` };
      });
    },
    async receipts(ids) {
      return Object.fromEntries(ids.map((id) => [id, { status: 'delivered' } as Receipt]));
    },
  };
}

/** Mock unless PUSH_MODE=expo, and never real pushes from the local stack by accident. */
export const pushSender = (env: Env): PushSender =>
  env.PUSH_MODE === 'expo' || (env.APP_ENV !== 'local' && env.PUSH_MODE !== 'mock')
    ? expoSender(env.EXPO_ACCESS_TOKEN)
    : mockSender();
