// Flow 08 · paid messages to authors.
//   POST /v1/authors/:id/messages {client_id, body}
//     send_author_message as the reader (one transaction: charge + store, idempotent on client_id),
//     then the thread's ConversationDO (chat Worker, flow 06) broadcasts the stored message.
// Money is written to Postgres first and only then broadcast, never batched by the DO. The DO
// refuses free reader messages in author threads (post_block_for → paid_only).
import { createClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import type { Database } from '@arpedia/core';
import { requireUser } from '../../auth';
import type { AppEnv } from '../../env';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RPC error codes the app shows, with the HTTP status for each. */
const ERRORS: Record<string, 400 | 402 | 403 | 404 | 409 | 429> = {
  bad_body: 400,
  bad_client_id: 400,
  insufficient_credits: 402,
  blocked: 403,
  author_unavailable: 403,
  ack_required: 409,
  rejected_by_rules: 400,
  rate_limited: 429,
  not_found: 404,
};

interface Sent {
  message: {
    id: string;
    group_id: string;
    body: string;
    created_at: string;
    cost_credits: number;
    sender_id: string;
    sender_name: string;
    sender_avatar: string | null;
  };
  balance: number;
  replayed: boolean;
  first_with_author?: boolean;
}

const app = new Hono<AppEnv>();

app.post('/:id/messages', requireUser, async (c) => {
  const author = c.req.param('id');
  const input = (await c.req.json().catch(() => null)) as { client_id?: unknown; body?: unknown } | null;
  if (
    !UUID.test(author) ||
    !input ||
    typeof input.client_id !== 'string' ||
    !UUID.test(input.client_id) ||
    typeof input.body !== 'string'
  )
    return c.json({ error: 'bad_request' }, 400);

  const db = createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: c.req.header('Authorization')! }, fetch: (...a) => fetch(...a) },
  });
  const { data, error } = await db.rpc('send_author_message', {
    p_author: author,
    p_client_id: input.client_id,
    p_body: input.body,
  });
  if (error) {
    const status = ERRORS[error.message];
    if (!status) throw new Error(`send_author_message: ${error.message}`);
    return c.json({ error: error.message, detail: parseDetail(error.details) }, status);
  }

  const sent = data as unknown as Sent;
  // A replay was already broadcast the first time; a failed broadcast only delays live delivery
  // (the author's app reloads the thread from Postgres), so it never fails the send.
  if (!sent.replayed)
    c.executionCtx.waitUntil(broadcast(c.env, sent, input.client_id).catch((e) => console.error(e)));
  return c.json(sent);
});

/** `insufficient_credits` carries {missing, balance, need} as JSON in the error detail. */
function parseDetail(details: string | null | undefined): unknown {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

async function broadcast(env: AppEnv['Bindings'], sent: Sent, clientId: string): Promise<void> {
  if (!env.CONVERSATION) return;
  const m = sent.message;
  const stub = env.CONVERSATION.get(env.CONVERSATION.idFromName(m.group_id));
  const frame = {
    type: 'message',
    client_id: clientId,
    message: {
      id: m.id,
      group_id: m.group_id,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      sender_avatar: m.sender_avatar,
      sender_is_author: false,
      kind: 'text',
      body: m.body,
      quote: null,
      reply_to_id: null,
      reply_to: null,
      state: 'visible',
      created_at: m.created_at,
      reactions: {},
      my_reaction: null,
      pinned: false,
      cost_credits: m.cost_credits,
    },
  };
  await stub.fetch(`https://do/c/${m.group_id}/relay`, {
    method: 'POST',
    headers: { 'X-Group-Id': m.group_id, 'Content-Type': 'application/json' },
    body: JSON.stringify(frame),
  });
}

export default app;
