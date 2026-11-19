import { CLOSE_FORBIDDEN, type ServerFrame } from '@arpedia/core';
import { DurableObject } from 'cloudflare:workers';
import { Conversation, type Peer, type SenderState } from './conversation';
import { serviceDb, type PersistItem } from './db';
import type { Env } from './env';

interface Attachment {
  userId: string;
}

/**
 * One Durable Object per group, DM thread or reading room (WebSocket Hibernation API, so idle
 * sockets cost nothing). Live delivery only: history is read from Postgres over HTTPS.
 */
export class ConversationDO extends DurableObject<Env> {
  private conv: Conversation | null = null;

  private conversation(groupId: string): Conversation {
    if (this.conv) return this.conv;
    const storage = this.ctx.storage;
    this.conv = new Conversation({
      groupId,
      db: serviceDb(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY),
      queue: {
        list: () => storage.list<PersistItem>({ prefix: 'q:' }),
        put: (k, v) => storage.put(k, v),
        delete: async (keys) => {
          await storage.delete(keys);
        },
        park: (k, v) => storage.put(`dead:${k}`, v),
      },
      senders: {
        get: (uid) => storage.get<SenderState>(`s:${uid}`),
        put: (uid, s) => storage.put(`s:${uid}`, s),
      },
      peers: () =>
        this.ctx.getWebSockets().map((ws): Peer => ({
          userId: (ws.deserializeAttachment() as Attachment).userId,
          send: (d) => ws.send(d),
          close: (c, r) => ws.close(c, r),
        })),
      now: () => Date.now(),
      scheduleFlush: (ms) => {
        void storage.getAlarm().then((at) => {
          if (at === null || at > Date.now() + ms) return storage.setAlarm(Date.now() + ms);
        });
      },
    });
    return this.conv;
  }

  private async groupId(fromHeader?: string | null): Promise<string> {
    if (fromHeader) {
      const stored = await this.ctx.storage.get<string>('gid');
      if (!stored) await this.ctx.storage.put('gid', fromHeader);
      return fromHeader;
    }
    const stored = await this.ctx.storage.get<string>('gid');
    if (!stored) throw new Error('conversation has no group id yet');
    return stored;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const conv = this.conversation(await this.groupId(request.headers.get('X-Group-Id')));

    if (url.pathname.endsWith('/ws')) {
      const userId = request.headers.get('X-User-Id');
      if (!userId) return new Response('missing user', { status: 400 });
      const hello = await conv.connect(userId);
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      if (!hello) {
        // Not hibernated: accept only to tell the client why, then close.
        server.accept();
        server.close(CLOSE_FORBIDDEN, 'not_member');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.ctx.acceptWebSocket(server, [userId]);
      server.serializeAttachment({ userId } satisfies Attachment);
      server.send(JSON.stringify(hello));
      await conv.presenceChanged();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method !== 'POST') return new Response('not found', { status: 404 });
    if (url.pathname.endsWith('/refresh')) {
      const body = (await request.json().catch(() => ({}))) as { user_id?: string };
      await conv.refresh(body.user_id, request.headers.get('X-User-Id') ?? undefined);
      return Response.json({ ok: true });
    }
    if (url.pathname.endsWith('/flush')) {
      await conv.flush();
      return Response.json({ ok: true });
    }
    if (url.pathname.endsWith('/relay')) {
      conv.relay((await request.json()) as ServerFrame);
      return Response.json({ ok: true });
    }
    return new Response('not found', { status: 404 });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 16_384) return;
    const userId = (ws.deserializeAttachment() as Attachment).userId;
    const conv = this.conversation(await this.groupId());
    await conv.onFrame({ userId, send: (d) => ws.send(d), close: (c, r) => ws.close(c, r) }, message);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const userId = (ws.deserializeAttachment() as Attachment).userId;
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    const conv = this.conversation(await this.groupId());
    await conv.presenceChanged(userId);
  }

  override async alarm(): Promise<void> {
    const conv = this.conversation(await this.groupId());
    await conv.flush();
  }
}
