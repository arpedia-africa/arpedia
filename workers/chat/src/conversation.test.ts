// The conversation Durable Object's moderation-critical logic: membership cache refresh,
// enforcement push-down and write retry (flow 06 "Done when").
import { describe, expect, it } from 'vitest';
import type { ServerFrame } from '@arpedia/core';
import { ACCESS_TTL_MS, Conversation, RETRY_MS, type Peer } from './conversation';
import type { Access, ChatDb, PersistItem, PersistResult } from './db';

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

function setup() {
  let now = 1_700_000_000_000;
  const table = new Map<string, Access>();
  const calls = { access: 0, persist: 0 };
  const stored: PersistItem[] = [];
  let failPersist = false;
  const flushAt: number[] = [];
  const db: ChatDb = {
    getAccess: async (_g, u) => {
      calls.access++;
      return table.get(u) ?? access({ access: 'not_member' });
    },
    persist: async (batch) => {
      calls.persist++;
      if (failPersist) throw new Error('postgres down');
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
  };
  const q = new Map<string, PersistItem>();
  const peers: (Peer & { frames: ServerFrame[]; closed?: number })[] = [];
  const conv = new Conversation({
    groupId: G,
    db,
    queue: {
      list: async () => new Map(q),
      put: async (k, v) => void q.set(k, v),
      delete: async (keys) => keys.forEach((k) => q.delete(k)),
    },
    peers: () => peers.filter((p) => p.closed === undefined),
    now: () => now,
    scheduleFlush: (ms) => void flushAt.push(ms),
  });
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
    table,
    calls,
    stored,
    q,
    peer,
    send,
    flushAt,
    tick: (ms: number) => (now += ms),
    failPersist: (v: boolean) => (failPersist = v),
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
});
