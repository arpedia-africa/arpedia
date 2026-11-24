// The conversation Durable Object's moderation-critical logic: membership cache refresh,
// enforcement push-down and write retry (flow 06 "Done when").
import { describe, expect, it, vi } from 'vitest';
import type { ServerFrame } from '@arpedia/core';
import {
  ACCESS_TTL_MS,
  Conversation,
  MODERATE_TIMEOUT_MS,
  RETRY_MS,
  type Deps,
  type Peer,
  type SenderState,
} from './conversation';
import { RpcError, type Access, type ChatDb, type PersistItem, type PersistResult } from './db';

const G = '11111111-1111-4111-8111-111111111111';
const cid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function access(over: Partial<Access> = {}): Access {
  return {
    access: 'ok',
    role: 'member',
    kind: 'club',
    is_staff: false,
    post_block: null,
    post_block_until: null,
    slow_mode_seconds: 0,
    new_account: false,
    muted_words: [],
    member_count: 10,
    blocked: [],
    sender_name: 'Someone',
    sender_avatar: null,
    sender_is_author: false,
    ...over,
  };
}

function setup(moderate?: Deps['moderate']) {
  let now = 1_700_000_000_000;
  const table = new Map<string, Access>();
  const calls = { access: 0, persist: 0 };
  const stored: PersistItem[] = [];
  let failPersist = false;
  let poison: string | null = null;
  let failPush = false;
  const pushes: { ids: string[]; open: string[] }[] = [];
  const flushAt: number[] = [];
  const db: ChatDb = {
    getAccess: async (_g, u) => {
      calls.access++;
      return table.get(u) ?? access({ access: 'not_member' });
    },
    persist: async (batch) => {
      calls.persist++;
      if (failPersist) throw new Error('postgres down');
      if (batch.some((b) => b.body === poison)) throw new RpcError(400, '22P02', 'invalid input');
      return batch.map((b): PersistResult => {
        const a = table.get(b.sender_id);
        if (a?.post_block)
          return { client_id: b.client_id, sender_id: b.sender_id, status: 'rejected', reason: a.post_block };
        stored.push(b);
        return { client_id: b.client_id, sender_id: b.sender_id, id: b.id, status: 'stored' };
      });
    },
    setLiveCount: async () => undefined,
    touchLastSeen: async () => undefined,
    canQuote: async () => true,
    pushMessages: async (ids, open) => {
      if (failPush) throw new Error('push down');
      pushes.push({ ids, open });
    },
  };
  const q = new Map<string, PersistItem>();
  const parked = new Map<string, PersistItem>();
  const senders = new Map<string, SenderState>();
  const peers: (Peer & { frames: ServerFrame[]; closed?: number })[] = [];
  // A new instance over the same storage and sockets = the DO woken from hibernation.
  const make = () =>
    new Conversation({
      groupId: G,
      db,
      queue: {
        list: async () => new Map(q),
        put: async (k, v) => void q.set(k, v),
        delete: async (keys) => keys.forEach((k) => q.delete(k)),
        park: async (k, v) => void parked.set(k, v),
      },
      senders: {
        get: async (u) => senders.get(u),
        put: async (u, s) => void senders.set(u, s),
      },
      peers: () => peers.filter((p) => p.closed === undefined),
      now: () => now,
      scheduleFlush: (ms) => void flushAt.push(ms),
      moderate,
    });
  const conv = make();
  const peer = (userId: string) => {
    const p = {
      userId,
      frames: [] as ServerFrame[],
      closed: undefined as number | undefined,
      send(d: string) {
        p.frames.push(JSON.parse(d) as ServerFrame);
      },
      close(code: number) {
        p.closed = code;
      },
    };
    peers.push(p);
    return p;
  };
  const send = (p: Peer, n: number, body = `hello ${n}`) =>
    conv.onFrame(p, JSON.stringify({ type: 'send', client_id: cid(n), body }));
  return {
    conv,
    make,
    table,
    calls,
    stored,
    q,
    parked,
    peer,
    send,
    flushAt,
    tick: (ms: number) => (now += ms),
    failPersist: (v: boolean) => (failPersist = v),
    poison: (body: string) => (poison = body),
    pushes,
    failPush: (v: boolean) => (failPush = v),
  };
}

describe('membership cache', () => {
  it('serves access from cache for 60 s, then refreshes from Postgres', async () => {
    const t = setup();
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.conv.connect('ada');
    expect(t.calls.access).toBe(1);
    await t.send(ada, 1);
    expect(t.calls.access).toBe(1);

    // Ada is muted in Postgres; the cache still says ok until it expires.
    t.table.set('ada', access({ post_block: 'muted', post_block_until: '2026-11-19T00:00:00Z' }));
    t.tick(ACCESS_TTL_MS + 1);
    await t.send(ada, 2);
    expect(t.calls.access).toBe(2);
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'muted' });
  });

  it('refuses sockets for non-members and banned users', async () => {
    const t = setup();
    t.table.set('dee', access({ access: 'banned' }));
    expect(await t.conv.connect('dee')).toBeNull();
    expect(await t.conv.connect('stranger')).toBeNull();
    t.table.set('cy', access({ access: 'preview' }));
    expect(await t.conv.connect('cy')).toMatchObject({
      type: 'hello',
      read_only: true,
      post_block: 'not_member',
    });
  });
});

describe('send path', () => {
  it('acks, broadcasts, and never posts a retried client_id twice', async () => {
    const t = setup();
    t.table.set('ada', access({ sender_name: 'Ada' }));
    t.table.set('bola', access());
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    await t.conv.connect('ada');
    await t.conv.connect('bola');
    await t.send(ada, 1);
    await t.send(ada, 1);
    const acks = ada.frames.filter((f) => f.type === 'ack');
    expect(acks).toHaveLength(2);
    expect(acks[0]).toEqual(acks[1]);
    expect(bola.frames.filter((f) => f.type === 'message')).toHaveLength(1);
    await t.conv.flush();
    expect(t.stored).toHaveLength(1);
  });

  it('does not deliver to people who blocked the sender', async () => {
    const t = setup();
    t.table.set('ada', access());
    t.table.set('bola', access({ blocked: ['ada'] }));
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    await t.conv.connect('ada');
    await t.conv.connect('bola');
    await t.send(ada, 1);
    expect(bola.frames.some((f) => f.type === 'message')).toBe(false);
  });

  it('enforces slow mode with a countdown, except for moderators', async () => {
    const t = setup();
    t.table.set('ada', access({ slow_mode_seconds: 30 }));
    t.table.set('mod', access({ slow_mode_seconds: 30, role: 'moderator' }));
    const ada = t.peer('ada');
    const mod = t.peer('mod');
    await t.send(ada, 1);
    t.tick(18_000);
    await t.send(ada, 2);
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'slow_mode', wait_seconds: 12 });
    await t.send(mod, 3);
    await t.send(mod, 4);
    expect(mod.frames.filter((f) => f.type === 'ack')).toHaveLength(2);
  });

  it('takes two quick sends from one person one at a time (slow mode holds)', async () => {
    const t = setup();
    t.table.set('ada', access({ slow_mode_seconds: 30 }));
    const ada = t.peer('ada');
    await Promise.all([t.send(ada, 1), t.send(ada, 2)]);
    expect(ada.frames.filter((f) => f.type === 'ack')).toHaveLength(1);
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'slow_mode' });
  });

  it('hides muted-word messages before delivery and stores them auto-hidden', async () => {
    const t = setup();
    t.table.set('ada', access({ muted_words: ['scam'] }));
    t.table.set('bola', access());
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    await t.conv.connect('bola');
    await t.send(ada, 1, 'join this SCAM now');
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'rejected_by_rules' });
    expect(bola.frames.some((f) => f.type === 'message')).toBe(false);
    await t.conv.flush();
    expect(t.stored[0]?.state).toBe('auto_hidden');
    // A retry gets the same answer, not an ack that would clear the pending bubble.
    await t.send(ada, 1, 'join this SCAM now');
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'rejected_by_rules' });
  });

  it('keeps slow mode and retry dedupe across hibernation', async () => {
    const t = setup();
    t.table.set('ada', access({ slow_mode_seconds: 30 }));
    t.table.set('bola', access());
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    await t.send(ada, 1);
    const woken = t.make();
    t.tick(10_000);
    await woken.onFrame(ada, JSON.stringify({ type: 'send', client_id: cid(1), body: 'hello 1' }));
    expect(ada.frames.at(-1)).toMatchObject({ type: 'ack', client_id: cid(1) });
    await woken.onFrame(ada, JSON.stringify({ type: 'send', client_id: cid(2), body: 'hello 2' }));
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'slow_mode', wait_seconds: 20 });
    expect(bola.frames.filter((f) => f.type === 'message')).toHaveLength(1);
  });

  it('drops frames with malformed ids so they never stall the write queue', async () => {
    const t = setup();
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.conv.onFrame(ada, JSON.stringify({ type: 'send', client_id: '-'.repeat(36), body: 'x' }));
    await t.conv.onFrame(
      ada,
      JSON.stringify({ type: 'send', client_id: cid(1), body: 'x', reply_to_id: 'nope' }),
    );
    expect(t.q.size).toBe(0);
    expect(ada.frames).toHaveLength(0);
  });

  it('counts presence and filters blocks after hibernation emptied the cache', async () => {
    const t = setup();
    t.table.set('ada', access());
    t.table.set('bola', access({ blocked: ['ada'] }));
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    // Woken from hibernation: sockets exist, connect() never ran in this instance.
    await t.conv.presenceChanged();
    expect(ada.frames.at(-1)).toMatchObject({ type: 'presence', reading_now: 2 });
    await t.send(ada, 1);
    expect(bola.frames.some((f) => f.type === 'message')).toBe(false);
  });

  it('asks to remove phone numbers and blocks links from new accounts', async () => {
    const t = setup();
    t.table.set('ada', access({ new_account: true }));
    const ada = t.peer('ada');
    await t.send(ada, 1, 'call me 0803 123 4567');
    expect(ada.frames.at(-1)).toMatchObject({ error: 'phone_number' });
    await t.send(ada, 2, 'see https://example.com');
    expect(ada.frames.at(-1)).toMatchObject({ error: 'rejected_by_rules' });
  });
});

describe('moderate-text (flow 14)', () => {
  const acked = (p: { frames: ServerFrame[] }, n: number) =>
    p.frames.some((f) => f.type === 'ack' && f.client_id === cid(n));

  it('stores safety-rule hides auto-hidden, never delivered, and passes the surface', async () => {
    const seen: unknown[] = [];
    const t = setup(async (text, opts) => {
      seen.push({ text, ...opts });
      return text.includes('bad') ? { action: 'hide_and_report', reason: 'muted_word' } : { action: 'allow' };
    });
    t.table.set('ada', access({ kind: 'dm', new_account: true }));
    t.table.set('bola', access());
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    await t.conv.connect('bola');
    await t.send(ada, 1, 'a bad word');
    expect(ada.frames.at(-1)).toMatchObject({ type: 'error', error: 'rejected_by_rules' });
    await t.send(ada, 2, 'fine');
    expect(acked(ada, 2)).toBe(true);
    expect(bola.frames.filter((f) => f.type === 'message')).toHaveLength(1);
    await t.conv.flush();
    expect(t.stored.map((s) => s.state)).toEqual(['auto_hidden', 'visible']);
    expect(seen[0]).toEqual({ text: 'a bad word', surface: 'dm', sender_new: true });
  });

  it('asks to edit phone numbers and refuses blocked links, storing neither', async () => {
    const t = setup(async (text) =>
      text.includes('0803') ? { action: 'hide', reason: 'phone_number' } : { action: 'hide', reason: 'link' },
    );
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.send(ada, 1, 'call 08031234567');
    expect(ada.frames.at(-1)).toMatchObject({ error: 'phone_number' });
    await t.send(ada, 2, 'see example.com');
    expect(ada.frames.at(-1)).toMatchObject({ error: 'rejected_by_rules' });
    expect(t.q.size).toBe(0);
  });

  it('follows the rules: phone numbers allowed there are not caught by the local check', async () => {
    const t = setup(async () => ({ action: 'allow' }));
    t.table.set('ada', access({ new_account: true }));
    const ada = t.peer('ada');
    await t.send(ada, 1, 'call me 0803 123 4567');
    expect(acked(ada, 1)).toBe(true);
  });

  it('delivers Blur and Warn, and still applies the channel muted words', async () => {
    const t = setup(async (text) => ({ action: text.includes('meh') ? 'warn' : 'blur' }));
    t.table.set('ada', access({ muted_words: ['spoiler'] }));
    const ada = t.peer('ada');
    await t.send(ada, 1, 'meh');
    expect(acked(ada, 1)).toBe(true);
    await t.send(ada, 2, 'big SPOILER here');
    expect(ada.frames.at(-1)).toMatchObject({ error: 'rejected_by_rules' });
  });

  it('counts slow mode from when the message is sent, after the check', async () => {
    let tick: (ms: number) => void = () => undefined;
    const t = setup(async () => {
      tick(1_500);
      return { action: 'allow' };
    });
    tick = t.tick;
    t.table.set('ada', access({ slow_mode_seconds: 30 }));
    const ada = t.peer('ada');
    await t.send(ada, 1);
    t.tick(29_000);
    await t.send(ada, 2);
    expect(ada.frames.at(-1)).toMatchObject({ error: 'slow_mode', wait_seconds: 1 });
  });

  it('falls back to its own checks when the Worker is down or slow', async () => {
    vi.useFakeTimers();
    try {
      const down = setup(async () => {
        throw new Error('api down');
      });
      down.table.set('ada', access());
      const ada = down.peer('ada');
      await down.send(ada, 1, 'call me 0803 123 4567');
      expect(ada.frames.at(-1)).toMatchObject({ error: 'phone_number' });

      const slow = setup(() => new Promise(() => undefined));
      slow.table.set('bola', access());
      const bola = slow.peer('bola');
      const sent = slow.send(bola, 1, 'hello');
      await vi.advanceTimersByTimeAsync(MODERATE_TIMEOUT_MS);
      await sent;
      expect(acked(bola, 1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('enforcement push-down', () => {
  it('closes sockets of removed users and tells the rest about a lock', async () => {
    const t = setup();
    t.table.set('ada', access());
    t.table.set('dee', access());
    const ada = t.peer('ada');
    const dee = t.peer('dee');
    await t.conv.connect('ada');
    await t.conv.connect('dee');
    t.table.set('dee', access({ access: 'banned' }));
    t.table.set('ada', access({ post_block: 'locked' }));
    await t.conv.refresh();
    expect(dee.closed).toBe(4403);
    expect(ada.closed).toBeUndefined();
    expect(ada.frames.find((f) => f.type === 'group')).toMatchObject({ post_block: 'locked' });
  });

  it('lets a plain member refresh only themselves', async () => {
    const t = setup();
    t.table.set('ada', access());
    t.table.set('dee', access());
    t.peer('ada');
    const dee = t.peer('dee');
    t.table.set('dee', access({ access: 'banned' }));
    await t.conv.refresh(undefined, 'ada');
    expect(dee.closed).toBeUndefined();
    t.table.set('mod', access({ role: 'moderator' }));
    await t.conv.refresh(undefined, 'mod');
    expect(dee.closed).toBe(4403);
  });
});

describe('write retry', () => {
  it('keeps messages queued while Postgres is down and writes them once it is back', async () => {
    const t = setup();
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.send(ada, 1);
    await t.send(ada, 2);
    t.failPersist(true);
    await t.conv.flush();
    expect(t.q.size).toBe(2);
    expect(t.flushAt.at(-1)).toBe(RETRY_MS);
    t.failPersist(false);
    await t.conv.flush();
    expect(t.q.size).toBe(0);
    expect(t.stored.map((s) => s.client_id)).toEqual([cid(1), cid(2)]);
  });

  it('takes back a message Postgres refuses (sender muted meanwhile)', async () => {
    const t = setup();
    t.table.set('ada', access());
    t.table.set('bola', access());
    const ada = t.peer('ada');
    const bola = t.peer('bola');
    await t.conv.connect('bola');
    await t.send(ada, 1);
    t.table.set('ada', access({ post_block: 'muted' }));
    await t.conv.flush();
    expect(bola.frames.at(-1)).toMatchObject({ type: 'state', state: 'removed' });
  });

  it('sets aside a row Postgres can never take, and writes the rest', async () => {
    const t = setup();
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.send(ada, 1);
    await t.send(ada, 2, 'bad row');
    await t.send(ada, 3);
    t.poison('bad row');
    await t.conv.flush();
    expect(t.q.size).toBe(0);
    expect([...t.parked.values()].map((p) => p.client_id)).toEqual([cid(2)]);
    expect(t.stored.map((s) => s.client_id)).toEqual([cid(1), cid(3)]);
  });
});

describe('push (flow 15)', () => {
  it('asks for pushes for stored messages only, naming who has the chat open', async () => {
    const t = setup();
    t.table.set('ada', access());
    t.table.set('bola', access());
    const ada = t.peer('ada');
    t.peer('bola');
    await t.send(ada, 1);
    await t.send(ada, 2);
    await t.conv.flush();
    expect(t.pushes).toHaveLength(1);
    expect(t.pushes[0]!.ids).toEqual(t.stored.map((s) => s.id));
    expect(t.pushes[0]!.open.sort()).toEqual(['ada', 'bola']);

    // Refused rows (sender muted meanwhile) are never pushed.
    await t.send(ada, 3);
    t.table.set('ada', access({ post_block: 'muted' }));
    await t.conv.flush();
    expect(t.pushes).toHaveLength(1);
  });

  it('pushes rows written one by one after a bad batch', async () => {
    const t = setup();
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.send(ada, 1);
    await t.send(ada, 2, 'bad row');
    t.poison('bad row');
    await t.conv.flush();
    expect(t.pushes.flatMap((p) => p.ids)).toEqual(t.stored.map((s) => s.id));
  });

  it('a failed push never keeps messages queued', async () => {
    const t = setup();
    t.table.set('ada', access());
    const ada = t.peer('ada');
    await t.send(ada, 1);
    t.failPush(true);
    await t.conv.flush();
    expect(t.q.size).toBe(0);
    expect(t.stored).toHaveLength(1);
  });
});
