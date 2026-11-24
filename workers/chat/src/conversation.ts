// One conversation's live logic, free of Durable Object APIs so it can be tested with fakes.
// The DO (do.ts) supplies sockets, storage and the alarm.
import {
  CLOSE_FORBIDDEN,
  MESSAGE_MAX,
  QUOTE_MAX,
  uuid7,
  type ChatMessage,
  type ClientFrame,
  type SendError,
  type ServerFrame,
} from '@arpedia/core';
import { RpcError, type Access, type ChatDb, type PersistItem, type PersistResult } from './db';

export interface Peer {
  userId: string;
  send(data: string): void;
  close(code: number, reason: string): void;
}

/** Durable, ordered queue of messages not yet in Postgres (the DO's storage). */
export interface QueueStore {
  list(): Promise<Map<string, PersistItem>>;
  put(key: string, item: PersistItem): Promise<void>;
  delete(keys: string[]): Promise<void>;
  /** Set aside an item Postgres can never take, so it doesn't block the ones behind it. */
  park(key: string, item: PersistItem): Promise<void>;
}

/** Per-sender limits and recent client ids, kept in DO storage so hibernation can't reset them. */
export interface SenderState {
  last: number;
  sends: number[];
  recent: { client_id: string; id: string; created_at: string; hidden: boolean }[];
}

export interface SenderStore {
  get(userId: string): Promise<SenderState | undefined>;
  put(userId: string, s: SenderState): Promise<void>;
}

export interface Deps {
  groupId: string;
  db: ChatDb;
  queue: QueueStore;
  senders: SenderStore;
  peers(): Peer[];
  now(): number;
  /** Ask for flush() to run in `ms` (the DO alarm). */
  scheduleFlush(ms: number): void;
}

export const ACCESS_TTL_MS = 60_000;
export const FLUSH_MS = 1_000;
export const FLUSH_BATCH = 50;
export const RETRY_MS = 5_000;
export const RATE_LIMIT = { count: 20, windowMs: 60_000 };
const RECENT_PER_SENDER = 20;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|ng|net|org|africa|io|co|me|ly|link)\b/i;
const PHONE = /(?<!\d)(?:\+?234|0)[789][01]\d{8}(?!\d)/;

export class Conversation {
  private access = new Map<string, { a: Access; at: number }>();
  private senders = new Map<string, SenderState>();
  private readingNow = -1;
  private lastTs = 0;
  private flushing: Promise<void> | null = null;
  private sending = new Map<string, Promise<void>>();

  constructor(private readonly d: Deps) {}

  /** Access for a user, from cache when fresh (60 s), else from Postgres. */
  async accessFor(userId: string, force = false): Promise<Access> {
    const hit = this.access.get(userId);
    if (!force && hit && this.d.now() - hit.at < ACCESS_TTL_MS) return hit.a;
    const a = await this.d.db.getAccess(this.d.groupId, userId);
    this.access.set(userId, { a, at: this.d.now() });
    return a;
  }

  /** A new socket: allowed for members, staff and public previews (read-only). */
  async connect(userId: string): Promise<ServerFrame | null> {
    const a = await this.accessFor(userId, true);
    if (!canRead(a)) return null;
    return {
      type: 'hello',
      reading_now: Math.max(this.countReading(), 0),
      post_block: a.access === 'preview' ? 'not_member' : a.post_block,
      post_block_until: a.post_block_until,
      slow_mode_seconds: a.slow_mode_seconds,
      read_only: a.access === 'preview',
    };
  }

  /** After a socket opens or closes: push "reading now" when it changed. */
  async presenceChanged(closedUserId?: string): Promise<void> {
    await this.warm();
    const n = this.countReading();
    if (closedUserId && !this.d.peers().some((p) => p.userId === closedUserId)) {
      await this.d.db.touchLastSeen(this.d.groupId, closedUserId).catch(() => undefined);
    }
    if (n === this.readingNow) return;
    this.readingNow = n;
    const hidden = this.anyAccess()?.member_count ?? 0;
    this.broadcast({ type: 'presence', reading_now: hidden > 10_000 ? 0 : n });
    await this.d.db.setLiveCount(this.d.groupId, n).catch(() => undefined);
  }

  async onFrame(peer: Peer, raw: string): Promise<void> {
    let f: ClientFrame;
    try {
      f = JSON.parse(raw) as ClientFrame;
    } catch {
      return;
    }
    if (f.type === 'ping') return peer.send(json({ type: 'pong' }));
    if (f.type === 'send') {
      // One send at a time per person, so two quick frames can't both pass slow mode and the
      // rate limit on the same sender state.
      const uid = peer.userId;
      const run = (this.sending.get(uid) ?? Promise.resolve()).then(() => this.send(peer, f));
      const tail = run.catch(() => undefined);
      this.sending.set(uid, tail);
      void tail.then(() => {
        if (this.sending.get(uid) === tail) this.sending.delete(uid);
      });
      return run;
    }
  }

  private async send(peer: Peer, f: Extract<ClientFrame, { type: 'send' }>): Promise<void> {
    const uid = peer.userId;
    const err = (error: SendError, extra: Partial<Extract<ServerFrame, { type: 'error' }>> = {}) =>
      peer.send(json({ type: 'error', client_id: f.client_id, error, ...extra }));
    // Malformed ids would fail the uuid cast in persist_messages and stall the whole queue.
    if (!isUuid(f.client_id)) return;
    if (f.reply_to_id != null && !isUuid(f.reply_to_id)) return;

    // A retry of something we already took: answer the same way again, never post twice.
    const s = await this.senderState(uid);
    const dup = s.recent.find((r) => r.client_id === f.client_id);
    if (dup) {
      if (dup.hidden) return err('rejected_by_rules');
      return peer.send(json({ type: 'ack', client_id: f.client_id, id: dup.id, created_at: dup.created_at }));
    }

    const a = await this.accessFor(uid);
    if (a.access === 'banned' || a.access === 'archived' || a.access === 'not_member') {
      err(a.access === 'not_member' ? 'not_member' : a.access === 'banned' ? 'banned' : 'archived');
      if (a.access !== 'not_member') peer.close(CLOSE_FORBIDDEN, a.access);
      return;
    }
    if (a.access === 'preview' || a.access === 'staff') return err('not_member');
    if (a.post_block) return err(a.post_block, { until: a.post_block_until });

    const body = typeof f.body === 'string' ? f.body.trim() : '';
    const quote = f.quote ?? null;
    if (!body && !quote) return err('empty');
    if (body.length > MESSAGE_MAX) return err('too_long');

    const now = this.d.now();
    const mod = a.is_staff || a.role === 'owner' || a.role === 'moderator';
    if (!mod && a.slow_mode_seconds > 0) {
      const wait = s.last + a.slow_mode_seconds * 1000 - now;
      if (wait > 0) return err('slow_mode', { wait_seconds: Math.ceil(wait / 1000) });
    }
    const window = s.sends.filter((t) => now - t < RATE_LIMIT.windowMs);
    if (window.length >= RATE_LIMIT.count) return err('rate_limited');

    if (quote) {
      if (
        typeof quote.text !== 'string' ||
        quote.text.length === 0 ||
        quote.text.length > QUOTE_MAX ||
        !(await this.d.db.canQuote(uid, quote.book_id, quote.chapter).catch(() => false))
      )
        return err('quote_not_allowed');
    }
    if (a.new_account && LINK.test(body)) return err('rejected_by_rules');
    if (PHONE.test(body.replace(/[\s-]/g, ''))) return err('phone_number');

    const hidden = a.muted_words.some((w) => w && body.toLowerCase().includes(w.toLowerCase()));
    // Strictly increasing per conversation, so ids, times and the queue keep send order.
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    const id = uuid7(ts);
    const created_at = new Date(ts).toISOString();
    const item: PersistItem = {
      id,
      group_id: this.d.groupId,
      sender_id: uid,
      client_id: f.client_id,
      kind: quote ? 'quote' : 'text',
      body: body || null,
      quote,
      reply_to_id: f.reply_to_id ?? null,
      state: hidden ? 'auto_hidden' : 'visible',
      created_at,
    };
    await this.d.queue.put(`q:${String(ts).padStart(15, '0')}:${id}`, item);
    window.push(now);
    const next: SenderState = {
      last: now,
      sends: window,
      recent: [...s.recent, { client_id: f.client_id, id, created_at, hidden }].slice(-RECENT_PER_SENDER),
    };
    this.senders.set(uid, next);
    await this.d.senders.put(uid, next);

    if (hidden) {
      // Stored for moderators with an automatic report; never delivered, and the sender isn't
      // told which word matched.
      err('rejected_by_rules');
    } else {
      peer.send(json({ type: 'ack', client_id: f.client_id, id, created_at }));
      const message: ChatMessage = {
        id,
        group_id: this.d.groupId,
        sender_id: uid,
        sender_name: a.sender_name,
        sender_avatar: a.sender_avatar,
        sender_is_author: a.sender_is_author,
        kind: item.kind,
        body: item.body,
        quote,
        reply_to_id: item.reply_to_id,
        reply_to: null,
        state: 'visible',
        created_at,
        reactions: {},
        my_reaction: null,
        pinned: false,
      };
      await this.warm();
      this.broadcast({ type: 'message', message, client_id: f.client_id }, uid);
    }

    const queued = (await this.d.queue.list()).size;
    if (queued >= FLUSH_BATCH) await this.flush();
    else this.d.scheduleFlush(FLUSH_MS);
  }

  /**
   * Write queued messages to Postgres in order. On failure everything stays queued and the
   * alarm retries; messages are never dropped. Rows Postgres refuses (the sender was muted or
   * removed meanwhile) are taken back from live clients.
   */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      try {
        for (;;) {
          const all = await this.d.queue.list();
          if (all.size === 0) return;
          const keys = [...all.keys()].sort().slice(0, FLUSH_BATCH);
          const batch = keys.map((k) => all.get(k)!);
          let results: PersistResult[];
          try {
            results = await this.d.db.persist(batch);
          } catch (e) {
            if (!permanent(e)) {
              this.d.scheduleFlush(RETRY_MS);
              return;
            }
            // Postgres refused the batch itself: find the bad rows one by one and set them aside,
            // so they can't hold back every message behind them.
            const done = await this.persistEach(keys, batch);
            if (!done) return;
            continue;
          }
          await this.d.queue.delete(keys);
          this.takeBack(batch, results);
          await this.push(results);
        }
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** One row at a time; false when Postgres became unreachable (retry later). */
  private async persistEach(keys: string[], batch: PersistItem[]): Promise<boolean> {
    for (const [i, item] of batch.entries()) {
      const key = keys[i]!;
      try {
        const results = await this.d.db.persist([item]);
        this.takeBack([item], results);
        await this.push(results);
      } catch (e) {
        if (!permanent(e)) {
          this.d.scheduleFlush(RETRY_MS);
          return false;
        }
        await this.d.queue.park(key, item);
        if (item.state === 'visible')
          this.broadcast({ type: 'state', message_id: item.id, state: 'removed' });
      }
      await this.d.queue.delete([key]);
    }
    return true;
  }

  /**
   * Push newly stored messages to members without the chat open (flow 15 decides who gets one).
   * Duplicates were pushed the first time. A failed push never holds back the queue.
   */
  private async push(results: PersistResult[]): Promise<void> {
    const ids = results.filter((r) => r.status === 'stored' && r.id).map((r) => r.id!);
    if (!ids.length) return;
    const open = [...new Set(this.d.peers().map((p) => p.userId))];
    await this.d.db.pushMessages(ids, open).catch((e: unknown) => console.error('chat push failed', e));
  }

  /** Rows Postgres refused (sender muted or removed meanwhile) are taken back from live clients. */
  private takeBack(batch: PersistItem[], results: PersistResult[]): void {
    for (const r of results) {
      if (r.status !== 'rejected') continue;
      const item = batch.find((b) => b.client_id === r.client_id && b.sender_id === r.sender_id);
      if (item && item.state === 'visible')
        this.broadcast({ type: 'state', message_id: item.id, state: 'removed' });
    }
  }

  /**
   * Moderation push-down, after Postgres changed: re-read access (one user or everyone), close
   * sockets of people who may no longer be here, and tell the rest about the new composer state.
   */
  async refresh(userId?: string, requester?: string): Promise<void> {
    // Re-reading everyone costs a Postgres call per person here: only staff and the group's
    // owner or moderators may ask for that; anyone else refreshes just themselves.
    if (!userId && requester) {
      const r = await this.accessFor(requester, true);
      if (!(r.is_staff || r.role === 'owner' || r.role === 'moderator')) userId = requester;
    }
    if (userId) this.access.delete(userId);
    else this.access.clear();
    const seen = new Set<string>();
    for (const p of this.d.peers()) {
      if (userId && p.userId !== userId) continue;
      const a = await this.accessFor(p.userId, !seen.has(p.userId));
      seen.add(p.userId);
      if (!canRead(a)) {
        p.close(CLOSE_FORBIDDEN, a.access);
        continue;
      }
      p.send(
        json({
          type: 'group',
          post_block: a.access === 'preview' ? 'not_member' : a.post_block,
          post_block_until: a.post_block_until,
          slow_mode_seconds: a.slow_mode_seconds,
        }),
      );
    }
    await this.presenceChanged();
  }

  /** Relay a change made over HTTPS (reaction, pin, delete) to live clients. */
  relay(frame: ServerFrame): void {
    this.broadcast(frame);
  }

  /** Send to every socket, skipping people who blocked `fromUser`. */
  broadcast(frame: ServerFrame, fromUser?: string): void {
    const data = json(frame);
    for (const p of this.d.peers()) {
      if (fromUser && p.userId !== fromUser && this.access.get(p.userId)?.a.blocked.includes(fromUser))
        continue;
      try {
        p.send(data);
      } catch {
        // socket already closing
      }
    }
  }

  /**
   * After hibernation the cache is empty while sockets live on: load access for peers we don't
   * know yet, so presence counts and block filtering see everyone.
   */
  private async warm(): Promise<void> {
    const missing = new Set(
      this.d
        .peers()
        .map((p) => p.userId)
        .filter((u) => !this.access.has(u)),
    );
    await Promise.all([...missing].map((u) => this.accessFor(u).catch(() => undefined)));
  }

  private async senderState(userId: string): Promise<SenderState> {
    let s = this.senders.get(userId);
    if (!s) {
      s = (await this.d.senders.get(userId)) ?? { last: 0, sends: [], recent: [] };
      this.senders.set(userId, s);
    }
    return s;
  }

  private countReading(): number {
    const users = new Set<string>();
    for (const p of this.d.peers()) {
      const a = this.access.get(p.userId)?.a;
      if (a && (a.access === 'ok' || a.access === 'staff')) users.add(p.userId);
    }
    return users.size;
  }

  private anyAccess(): Access | undefined {
    return this.access.values().next().value?.a;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/**
 * Postgres refused the data itself: PostgREST answers 400 for bad values and raised errors, 409
 * for constraint conflicts. Anything else (404 from a stale schema cache or a deploy ahead of
 * the migration, auth, timeouts, 5xx) is the service, not the row: keep it queued and retry.
 */
function permanent(e: unknown): boolean {
  return e instanceof RpcError && (e.status === 400 || e.status === 409);
}

function canRead(a: Access): boolean {
  return a.access === 'ok' || a.access === 'staff' || a.access === 'preview';
}

function json(f: ServerFrame): string {
  return JSON.stringify(f);
}
