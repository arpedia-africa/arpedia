import { AuthError, bearer, verifySupabaseJwt } from '@arpedia/core/jwt';
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  APP_ENV: 'local' | 'staging' | 'production';
  SUPABASE_URL: string;
  /** Local CLI stack only (HS256). */
  SUPABASE_JWT_SECRET?: string;
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
}

interface Attachment {
  userId: string;
  joinedAt: number;
}

/**
 * One conversation. Uses the WebSocket Hibernation API so idle sockets cost nothing.
 * Skeleton only: flow 06 adds membership checks, batching to Postgres, typing and presence.
 */
export class ChatRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get('X-User-Id');
    if (!userId) return new Response('missing user', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, joinedAt: Date.now() } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    const from = (ws.deserializeAttachment() as Attachment).userId;
    if (message === 'ping') {
      ws.send('pong');
      return;
    }
    const out = JSON.stringify({ type: 'echo', from, body: message });
    for (const peer of this.ctx.getWebSockets()) peer.send(out);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'chat', env: env.APP_ENV });

    const m = url.pathname.match(/^\/rooms\/([A-Za-z0-9_-]{1,64})\/ws$/);
    if (!m) return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });

    // Browsers cannot set headers on a WebSocket, so the token may also come as ?token=.
    const token = bearer(request.headers.get('Authorization')) ?? url.searchParams.get('token');
    if (!token) return new Response('unauthorized', { status: 401 });
    let userId: string;
    try {
      const claims = await verifySupabaseJwt(token, {
        supabaseUrl: env.SUPABASE_URL,
        hsSecret: env.APP_ENV === 'local' ? env.SUPABASE_JWT_SECRET : undefined,
      });
      userId = claims.sub;
    } catch (e) {
      if (e instanceof AuthError) return new Response('unauthorized', { status: 401 });
      throw e;
    }

    const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(m[1]!));
    const headers = new Headers(request.headers);
    headers.set('X-User-Id', userId);
    return stub.fetch(new Request(request.url, { headers }));
  },
} satisfies ExportedHandler<Env>;
