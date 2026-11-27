// One reader's inbox socket logic (flow 06 rule 25 and Server: InboxDO), free of Durable Object
// APIs so it can be tested with fakes. The InboxDO (inbox-do.ts) supplies sockets, storage and
// the alarm. The app opens `GET /inbox` on the Community tab and says which conversations are on
// screen; their ConversationDOs then tell it about new messages and "reading now".
import { INBOX_WATCH_MAX, type InboxClientFrame, type InboxServerFrame } from '@arpedia/core';
import { WATCH_TTL_MS } from './conversation';

export interface InboxPeer {
  send(data: string): void;
}

export interface InboxDeps {
  userId: string;
  peers(): InboxPeer[];
  now(): number;
  /** Conversations watched, with when each watch was last registered (DO storage). */
  store: {
    get(): Promise<Map<string, number>>;
    set(m: Map<string, number>): Promise<void>;
  };
  /** The conversation DOs: register or drop this user's watch. `watch` is false when refused. */
  conversations: {
    watch(groupId: string, userId: string): Promise<boolean>;
    unwatch(groupId: string, userId: string): Promise<void>;
  };
}

/** Watches are renewed at half their life, so they never lapse while the socket is open. */
export const RENEW_MS = WATCH_TTL_MS / 2;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Inbox {
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly d: InboxDeps) {}

  async onFrame(peer: InboxPeer, raw: string): Promise<void> {
    let f: InboxClientFrame;
    try {
      f = JSON.parse(raw) as InboxClientFrame;
    } catch {
      return;
    }
    if (f?.type === 'ping') return peer.send(json({ type: 'pong' }));
    if (f?.type === 'watch' && Array.isArray(f.groups)) {
      const groups = [
        ...new Set(f.groups.filter((g): g is string => typeof g === 'string' && UUID.test(g)).map(lower)),
      ].slice(0, INBOX_WATCH_MAX);
      return this.serial(() => this.watch(groups));
    }
  }

  /** Frames from a conversation DO. False when no socket is open, so it stops sending. */
  deliver(frames: InboxServerFrame[]): boolean {
    const peers = this.d.peers();
    if (!peers.length) return false;
    for (const f of frames) {
      const data = json(f);
      for (const p of peers) {
        try {
          p.send(data);
        } catch {
          // socket already closing
        }
      }
    }
    return true;
  }

  /** The alarm: renew watches about to lapse. False when no socket is open (stop the alarm). */
  renew(): Promise<boolean> {
    return this.serial(async () => {
      if (!this.d.peers().length) {
        await this.dropAll();
        return false;
      }
      const m = await this.d.store.get();
      await this.watch([...m.keys()]);
      return true;
    });
  }

  /** A socket closed: with none left, every watch is dropped. */
  closed(): Promise<void> {
    return this.serial(async () => {
      if (!this.d.peers().length) await this.dropAll();
    });
  }

  private async watch(groups: string[]): Promise<void> {
    const before = await this.d.store.get();
    const now = this.d.now();
    const next = new Map<string, number>();
    const uid = this.d.userId;
    await Promise.all(
      groups.map(async (g) => {
        const at = before.get(g);
        if (at !== undefined && now - at < RENEW_MS) return void next.set(g, at);
        const ok = await this.d.conversations.watch(g, uid).catch(() => false);
        if (ok) next.set(g, now);
      }),
    );
    const gone = [...before.keys()].filter((g) => !groups.includes(g));
    await Promise.all(gone.map((g) => this.d.conversations.unwatch(g, uid).catch(() => undefined)));
    await this.d.store.set(next);
  }

  private async dropAll(): Promise<void> {
    const m = await this.d.store.get();
    if (!m.size) return;
    const uid = this.d.userId;
    await Promise.all([...m.keys()].map((g) => this.d.conversations.unwatch(g, uid).catch(() => undefined)));
    await this.d.store.set(new Map());
  }

  /** One change at a time, so a watch list and a close can't interleave over the store. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.running.then(fn);
    this.running = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function lower(s: string): string {
  return s.toLowerCase();
}

function json(f: InboxServerFrame): string {
  return JSON.stringify(f);
}
