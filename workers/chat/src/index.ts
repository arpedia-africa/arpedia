// Arpedia chat Worker: verifies the Supabase JWT and routes to the conversation's Durable Object.
//   GET  /c/{group_id}           WebSocket (token in Authorization or ?token=)
//   POST /c/{group_id}/actions   react | delete | pin | unpin | report | block | unblock, as the user,
//                                then pushed to live clients
//   POST /c/{group_id}/refresh   re-read access after a change in Postgres (join, leave, staff actions)
//   POST /c/{group_id}/enforce   refresh, then take messages moderated in Postgres out of live clients
//   GET  /inbox                  WebSocket to the reader's InboxDO (Community tab: live counts)
import { AuthError, bearer, verifySupabaseJwt } from '@arpedia/core/jwt';
import type { ServerFrame } from '@arpedia/core';
import { RpcError, rpc } from './db';
import type { Env } from './env';

export { ConversationDO } from './do';
export { InboxDO } from './inbox-do';
export type { Env } from './env';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROUTE = new RegExp(`^/c/(${UUID})(?:/(actions|refresh|enforce))?$`, 'i');

type Action =
  | { type: 'react'; message_id: string; emoji: string | null }
  | { type: 'delete'; message_id: string }
  | { type: 'pin' | 'unpin'; message_id: string }
  | { type: 'report'; message_id: string; reason: string; details?: string | null; also_block?: boolean }
  | { type: 'block' | 'unblock'; user_id: string; at?: string | null };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'chat', env: env.APP_ENV });

    const isInbox = url.pathname === '/inbox';
    const m = isInbox ? null : url.pathname.match(ROUTE);
    if (!isInbox && !m) return new Response('not found', { status: 404 });
    const groupId = m ? m[1]!.toLowerCase() : '';
    const sub = m?.[2];

    // Browsers and React Native can't set headers on a WebSocket, so the token may come as ?token=.
    const token =
      bearer(request.headers.get('Authorization')) ?? (sub ? null : url.searchParams.get('token'));
    if (!token) return json({ error: 'unauthorized' }, 401);
    let userId: string;
    try {
      const claims = await verifySupabaseJwt(token, {
        supabaseUrl: env.SUPABASE_URL,
        hsSecret: env.APP_ENV === 'local' ? env.SUPABASE_JWT_SECRET : undefined,
      });
      userId = claims.sub;
    } catch (e) {
      if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
      throw e;
    }

    if (isInbox) {
      if (!env.INBOX) return json({ error: 'not found' }, 404);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
      const headers = new Headers(request.headers);
      headers.set('X-User-Id', userId);
      return env.INBOX.get(env.INBOX.idFromName(userId)).fetch(new Request('https://inbox/ws', { headers }));
    }

    const stub = env.CONVERSATION.get(env.CONVERSATION.idFromName(groupId));
    const toDo = (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('X-Group-Id', groupId);
      headers.set('X-User-Id', userId);
      return stub.fetch(`https://do/c/${groupId}/${path}`, { ...init, headers });
    };

    if (!sub) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
      const headers = new Headers(request.headers);
      headers.set('X-Group-Id', groupId);
      headers.set('X-User-Id', userId);
      return stub.fetch(new Request(`https://do/c/${groupId}/ws`, { headers }));
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    if (sub === 'refresh' || sub === 'enforce') {
      // The DO re-reads Postgres. Only staff and the group's owner or moderators may refresh
      // everyone; anyone else refreshes just themselves (checked in the DO). `enforce` also takes
      // messages moderated in Postgres out of live clients (moderation push-down).
      const body = (await request.json().catch(() => ({}))) as { self?: boolean };
      await toDo(sub, { method: 'POST', body: JSON.stringify(body.self ? { user_id: userId } : {}) });
      return json({ ok: true });
    }

    const action = (await request.json().catch(() => null)) as Action | null;
    if (!action || typeof action !== 'object') return json({ error: 'bad request' }, 400);
    const asUser = <T>(fn: string, args: Record<string, unknown>) =>
      rpc<T>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, token, fn, args);
    const relay = (frame: ServerFrame) => toDo('relay', { method: 'POST', body: JSON.stringify(frame) });

    try {
      switch (action.type) {
        case 'react': {
          await toDo('flush', { method: 'POST' });
          const r = await asUser<{ group_id: string; message_id: string; reactions: Record<string, number> }>(
            'react',
            { p_message: action.message_id, p_emoji: action.emoji, p_group: groupId },
          );
          await relay({ type: 'reactions', message_id: r.message_id, reactions: r.reactions });
          return json({ reactions: r.reactions });
        }
        case 'delete': {
          await toDo('flush', { method: 'POST' });
          const r = await asUser<{ group_id: string; message_id: string }>('delete_message', {
            p_message: action.message_id,
            p_group: groupId,
          });
          await relay({ type: 'state', message_id: r.message_id, state: 'deleted' });
          return json({ ok: true });
        }
        case 'pin':
        case 'unpin': {
          await toDo('flush', { method: 'POST' });
          await asUser(action.type === 'pin' ? 'pin_message' : 'unpin_message', {
            p_group: groupId,
            p_message: action.message_id,
          });
          const g = await asUser<{ pins: string[] }>('get_group', { p_group: groupId });
          await relay({ type: 'pins', pins: g.pins });
          return json({ pins: g.pins });
        }
        case 'report': {
          await toDo('flush', { method: 'POST' });
          const ref = await asUser<string>('report_message', {
            p_message: action.message_id,
            p_reason: action.reason,
            p_details: action.details ?? null,
            p_also_block: action.also_block ?? false,
          });
          if (action.also_block)
            await toDo('refresh', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
          return json({ ref });
        }
        case 'block':
        case 'unblock': {
          const r =
            action.type === 'block'
              ? await asUser<string>('block_user', {
                  p_user: action.user_id,
                  p_source_group: groupId,
                  p_at: action.at ?? null,
                })
              : await asUser<unknown>('unblock_user', { p_user: action.user_id });
          await toDo('refresh', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
          return json({ result: r });
        }
        default:
          return json({ error: 'bad request' }, 400);
      }
    } catch (e) {
      if (e instanceof RpcError) return json({ error: e.message, code: e.code }, e.status >= 500 ? 502 : 400);
      throw e;
    }
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
