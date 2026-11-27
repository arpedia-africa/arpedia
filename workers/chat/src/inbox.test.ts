// Flow 06 InboxDO: the inbox socket's watch list, and the conversation DO's feed to it (new
// messages and "reading now"), with access checked again before each delivery.
import { describe, expect, it } from 'vitest';
import type { InboxServerFrame, ServerFrame } from '@arpedia/core';
import { Conversation, WATCH_TTL_MS, WATCHERS_MAX, type InboxLink, type Peer } from './conversation';
import type { Access, ChatDb, PersistItem } from './db';
import { Inbox, RENEW_MS, type InboxPeer } from './inbox';

const G = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
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

function conversation(opts: { closedInbox?: Set<string> } = {}) {
  let now = 1_700_000_000_000;
  const table = new Map<string, Access>();
  const db: ChatDb = {
    getAccess: async (_g, u) => table.get(u) ?? access({ access: 'not_member' }),
    persist: async (batch: PersistItem[]) =>
      batch.map((b) => ({
        client_id: b.client_id,
        sender_id: b.sender_id,
        id: b.id,
        status: 'stored' as const,
      })),
    setLiveCount: async () => undefined,
    touchLastSeen: async () => undefined,
    canQuote: async () => true,
    pushMessages: async () => undefined,
    changedStates: async () => [],
  };
  const watchers = new Map<string, number>();
  const got = new Map<string, InboxServerFrame[]>();
  const inbox: InboxLink = {
    list: async () => new Map(watchers),
    put: async (u, until) => void watchers.set(u, until),
    delete: async (us) => us.forEach((u) => watchers.delete(u)),
    notify: async (u, frames) => {
      if (opts.closedInbox?.has(u)) return false;
      got.set(u, [...(got.get(u) ?? []), ...frames]);
      return true;
    },
  };
  const peers: (Peer & { frames: ServerFrame[] })[] = [];
  const conv = new Conversation({
    groupId: G,
    db,
    queue: (() => {
      const q = new Map<string, PersistItem>();
      return {
        list: async () => new Map(q),
        put: async (k: string, v: PersistItem) => void q.set(k, v),
        delete: async (keys: string[]) => keys.forEach((k) => q.delete(k)),
        park: async () => undefined,
      };
    })(),
    senders: (() => {
      const m = new Map();
      return { get: async (u: string) => m.get(u), put: async (u: string, s: unknown) => void m.set(u, s) };
    })(),
    peers: () => peers,
    now: () => now,
    scheduleFlush: () => undefined,
    inbox,
  });
  const peer = (userId: string) => {
    const p = {
      userId,
      frames: [] as ServerFrame[],
      send: (d: string) => void p.frames.push(JSON.parse(d) as ServerFrame),
      close: () => undefined,
    };
    peers.push(p);
    return p;
  };
  const say = async (p: Peer, n: number) => {
    await conv.onFrame(p, JSON.stringify({ type: 'send', client_id: cid(n), body: `hello ${n}` }));
    await conv.flush();
  };
  return { conv, table, watchers, got, peer, say, tick: (ms: number) => (now += ms) };
}

describe('conversation feeds watching inboxes', () => {
  it('takes members and refuses people who may not read', async () => {
    const t = conversation();
    t.table.set('ada', access());
    t.table.set('ban', access({ access: 'banned' }));
    expect(await t.conv.watch('ada')).toBe(true);
    expect(await t.conv.watch('ban')).toBe(false);
    expect(await t.conv.watch('stranger')).toBe(false);
    expect([...t.watchers.keys()]).toEqual(['ada']);
  });

  it('tells others about a stored message, never the sender or someone who blocked them', async () => {
    const t = conversation();
    t.table.set('ada', access());
    t.table.set('bola', access());
    t.table.set('chi', access({ blocked: ['ada'] }));
    for (const u of ['ada', 'bola', 'chi']) await t.conv.watch(u);
    await t.say(t.peer('ada'), 1);
    expect(t.got.get('bola')).toEqual([{ type: 'activity', group_id: G, at: expect.any(String) }]);
    expect(t.got.get('ada')).toBeUndefined();
    expect(t.got.get('chi')).toBeUndefined();
  });

  it('pushes reading now to inboxes when it changes', async () => {
    const t = conversation();
    t.table.set('ada', access());
    t.table.set('bola', access());
    await t.conv.watch('bola');
    t.peer('ada');
    await t.conv.connect('ada');
    await t.conv.presenceChanged();
    expect(t.got.get('bola')).toEqual([{ type: 'reading_now', group_id: G, reading_now: 1 }]);
  });

  it('drops watchers who left, whose watch lapsed or whose inbox closed', async () => {
    const t = conversation({ closedInbox: new Set(['dayo']) });
    for (const u of ['ada', 'bola', 'chi', 'dayo']) t.table.set(u, access());
    for (const u of ['bola', 'chi', 'dayo']) await t.conv.watch(u);
    t.table.set('chi', access({ access: 'not_member' }));
    await t.conv.refresh('chi');
    t.watchers.set('bola', 0); // lapsed
    await t.say(t.peer('ada'), 1);
    const activity = [...t.got.values()].flat().filter((f) => f.type === 'activity');
    expect(activity).toEqual([]);
    expect(t.watchers.size).toBe(0);
  });

  it('renews a watch and caps how many inboxes one conversation feeds', async () => {
    const t = conversation();
    t.table.set('ada', access());
    await t.conv.watch('ada');
    const first = t.watchers.get('ada')!;
    t.tick(1000);
    await t.conv.watch('ada');
    expect(t.watchers.get('ada')).toBe(first + 1000);
    for (let i = 0; i < WATCHERS_MAX; i++) t.watchers.set(`u${i}`, first + WATCH_TTL_MS);
    t.table.set('late', access());
    expect(await t.conv.watch('late')).toBe(false);
    expect(await t.conv.watch('ada')).toBe(true); // an existing watcher still renews
  });
});

function inbox() {
  let now = 1_700_000_000_000;
  let store = new Map<string, number>();
  const calls: string[] = [];
  const refuse = new Set<string>();
  const peers: (InboxPeer & { frames: InboxServerFrame[] })[] = [];
  const box = new Inbox({
    userId: 'ada',
    peers: () => peers,
    now: () => now,
    store: { get: async () => new Map(store), set: async (m) => void (store = new Map(m)) },
    conversations: {
      watch: async (g) => {
        calls.push(`watch ${g}`);
        return !refuse.has(g);
      },
      unwatch: async (g) => void calls.push(`unwatch ${g}`),
    },
  });
  const peer = () => {
    const p = { frames: [] as InboxServerFrame[], send: (d: string) => void p.frames.push(JSON.parse(d)) };
    peers.push(p);
    return p;
  };
  return {
    box,
    peer,
    calls,
    refuse,
    peers,
    store: () => store,
    tick: (ms: number) => (now += ms),
    watch: (p: InboxPeer, groups: unknown[]) => box.onFrame(p, JSON.stringify({ type: 'watch', groups })),
  };
}

describe('inbox socket', () => {
  it('watches valid ids once, keeps refused ones out, and unwatches what left the screen', async () => {
    const t = inbox();
    const p = t.peer();
    t.refuse.add(G2);
    await t.watch(p, [G, G.toUpperCase(), G2, 'not-a-uuid', 7]);
    expect(t.calls).toEqual([`watch ${G}`, `watch ${G2}`]);
    expect([...t.store().keys()]).toEqual([G]);
    t.calls.length = 0;
    await t.watch(p, [G]); // fresh: no new registration
    expect(t.calls).toEqual([]);
    await t.watch(p, []);
    expect(t.calls).toEqual([`unwatch ${G}`]);
    expect(t.store().size).toBe(0);
  });

  it('renews lapsing watches on the alarm and drops all when no socket is left', async () => {
    const t = inbox();
    const p = t.peer();
    await t.watch(p, [G]);
    t.calls.length = 0;
    t.tick(RENEW_MS);
    expect(await t.box.renew()).toBe(true);
    expect(t.calls).toEqual([`watch ${G}`]);
    t.peers.length = 0;
    t.calls.length = 0;
    await t.box.closed();
    expect(t.calls).toEqual([`unwatch ${G}`]);
    expect(await t.box.renew()).toBe(false);
  });

  it('delivers frames to every socket, and says when none is open', async () => {
    const t = inbox();
    const a = t.peer();
    const b = t.peer();
    const f: InboxServerFrame = { type: 'activity', group_id: G, at: '2026-11-27T10:00:00.000Z' };
    expect(t.box.deliver([f])).toBe(true);
    expect(a.frames).toEqual([f]);
    expect(b.frames).toEqual([f]);
    t.peers.length = 0;
    expect(t.box.deliver([f])).toBe(false);
  });

  it('answers ping and ignores junk', async () => {
    const t = inbox();
    const p = t.peer();
    await t.box.onFrame(p, 'not json');
    await t.box.onFrame(p, 'null');
    await t.box.onFrame(p, JSON.stringify({ type: 'ping' }));
    expect(p.frames).toEqual([{ type: 'pong' }]);
  });
});
