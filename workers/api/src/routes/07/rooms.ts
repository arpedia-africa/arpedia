import type { RoomProgressFrame } from '@arpedia/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../../auth';
import type { AppEnv, Env } from '../../env';
import { rpcError, userDb } from '../12/http';

// Flow 07 · reading rooms progress-sync (rule 24).
//   POST /v1/rooms/progress {book_id, percent, chapter}
// After a synced page turn (at most every 15 s, while the room's book is open) the app sends its
// progress with its JWT. update_room_progress writes room_member_progress for every live room the
// caller is in with that book (never backwards), then each room's Durable Object tells the members
// who have the room open, so headers and rings move without a reload.

const Body = z.object({
  book_id: z.guid(),
  percent: z.number().min(0).max(100),
  chapter: z.number().int().min(0).max(100_000),
});

type Synced = { room_id: string; percent: number; chapter: number; finished: boolean };

const rooms = new Hono<AppEnv>();
rooms.use('*', requireUser);

rooms.post('/progress', async (c) => {
  const body = Body.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'bad request' }, 400);
  const { data, error } = await userDb(c).rpc('update_room_progress', {
    p_book: body.data.book_id,
    p_percent: body.data.percent,
    p_chapter: body.data.chapter,
  });
  if (error) return rpcError(c, error);
  const synced = (data ?? []) as unknown as Synced[];
  const userId = c.var.user.sub;
  // Live push is best effort: the rows are saved, and members who open the room later read them.
  c.executionCtx.waitUntil(
    Promise.allSettled(
      synced.map((r) =>
        relay(c.env, r.room_id, {
          type: 'progress',
          user_id: userId,
          percent: Number(r.percent),
          chapter: r.chapter,
          finished: r.finished,
        }),
      ),
    ).then((rs) => {
      for (const r of rs) if (r.status === 'rejected') console.error('room progress relay failed', r.reason);
    }),
  );
  return c.json({ rooms: synced.map((r) => r.room_id) });
});

/** Broadcast a frame to the room's open sockets through flow 06's conversation Durable Object. */
async function relay(env: Env, roomId: string, frame: RoomProgressFrame): Promise<void> {
  if (!env.CHAT_ROOMS) return;
  const stub = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(roomId));
  const res = await stub.fetch(`https://do/c/${roomId}/relay`, {
    method: 'POST',
    headers: { 'X-Group-Id': roomId, 'Content-Type': 'application/json' },
    body: JSON.stringify(frame),
  });
  if (!res.ok) throw new Error(`relay ${res.status}`);
}

export default rooms;
