import { DurableObject } from 'cloudflare:workers';
import type { InboxServerFrame } from '@arpedia/core';
import { Inbox, RENEW_MS } from './inbox';
import type { Env } from './env';

/**
 * One Durable Object per reader (flow 06 Server): the Community tab's socket. Conversation DOs
 * push "activity" and "reading now" for the conversations the app says are on screen. Hibernation
 * API, so an idle socket costs nothing; an alarm renews the watches while a socket is open.
 */
export class InboxDO extends DurableObject<Env> {
  private inbox: Inbox | null = null;

  private get(userId: string): Inbox {
    if (this.inbox) return this.inbox;
    const storage = this.ctx.storage;
    const conv = this.env.CONVERSATION;
    const call = (groupId: string, userId: string, path: 'watch' | 'unwatch') =>
      conv.get(conv.idFromName(groupId)).fetch(`https://do/c/${groupId}/${path}`, {
        method: 'POST',
        headers: { 'X-Group-Id': groupId, 'X-User-Id': userId },
      });
    this.inbox = new Inbox({
      userId,
      peers: () => this.ctx.getWebSockets().map((ws) => ({ send: (d: string) => ws.send(d) })),
      now: () => Date.now(),
      store: {
        get: async () =>
          new Map(Object.entries((await storage.get<Record<string, number>>('watched')) ?? {})),
        set: (m) => storage.put('watched', Object.fromEntries(m)),
      },
      conversations: {
        watch: async (g, u) => {
          const res = await call(g, u, 'watch');
          return res.ok && ((await res.json()) as { ok: boolean }).ok;
        },
        unwatch: async (g, u) => {
          await call(g, u, 'unwatch');
        },
      },
    });
    return this.inbox;
  }

  /** The user id is the DO's name: kept in storage so hibernation and alarms know it. */
  private async userId(fromHeader?: string | null): Promise<string> {
    const stored = await this.ctx.storage.get<string>('uid');
    if (fromHeader) {
      if (!stored) await this.ctx.storage.put('uid', fromHeader);
      return fromHeader;
    }
    if (!stored) throw new Error('inbox has no user id yet');
    return stored;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const inbox = this.get(await this.userId(request.headers.get('X-User-Id')));
    if (url.pathname.endsWith('/ws')) {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + RENEW_MS);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname.endsWith('/push') && request.method === 'POST') {
      const frames = (await request.json().catch(() => [])) as InboxServerFrame[];
      return Response.json({ open: inbox.deliver(Array.isArray(frames) ? frames : []) });
    }
    return new Response('not found', { status: 404 });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 16_384) return;
    const inbox = this.get(await this.userId());
    await inbox.onFrame({ send: (d) => ws.send(d) }, message);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    await this.get(await this.userId()).closed();
  }

  override async alarm(): Promise<void> {
    const open = await this.get(await this.userId()).renew();
    if (open) await this.ctx.storage.setAlarm(Date.now() + RENEW_MS);
  }
}
