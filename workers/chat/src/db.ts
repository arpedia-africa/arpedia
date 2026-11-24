// PostgREST RPC calls. The Durable Object uses the service role (persist, access, presence);
// the HTTPS action routes call as the signed-in user, so the RPCs' own auth.uid() checks apply.
import type { PostBlock, QuotePayload } from '@arpedia/core';

export interface Access {
  access: 'ok' | 'staff' | 'preview' | 'not_member' | 'banned' | 'archived';
  role: 'owner' | 'moderator' | 'member' | null;
  kind: string | null;
  is_staff: boolean;
  post_block: PostBlock | null;
  post_block_until: string | null;
  slow_mode_seconds: number;
  new_account: boolean;
  muted_words: string[];
  member_count: number;
  blocked: string[];
  sender_name: string;
  sender_avatar: string | null;
  sender_is_author: boolean;
}

export interface PersistItem {
  id: string;
  group_id: string;
  sender_id: string;
  client_id: string;
  kind: 'text' | 'quote';
  body: string | null;
  quote: QuotePayload | null;
  reply_to_id: string | null;
  state: 'visible' | 'auto_hidden';
  created_at: string;
}

export interface PersistResult {
  client_id: string;
  sender_id: string;
  id?: string;
  status: 'stored' | 'duplicate' | 'rejected';
  reason?: string;
}

/** What the conversation needs from Postgres (faked in tests). */
export interface ChatDb {
  getAccess(groupId: string, userId: string): Promise<Access>;
  persist(batch: PersistItem[]): Promise<PersistResult[]>;
  setLiveCount(groupId: string, count: number): Promise<void>;
  touchLastSeen(groupId: string, userId: string): Promise<void>;
  canQuote(userId: string, bookId: string, chapter: number): Promise<boolean>;
  /** Push for stored messages (flow 15 push_fanout); readers with the chat open are skipped. */
  pushMessages(messageIds: string[], openIds: string[]): Promise<void>;
}

export class RpcError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export async function rpc<T>(
  url: string,
  apikey: string,
  token: string,
  fn: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal,
  });
  const text = await res.text();
  if (!res.ok) {
    let code: string | undefined;
    let message = text;
    try {
      const j = JSON.parse(text) as { code?: string; message?: string };
      code = j.code;
      message = j.message ?? text;
    } catch {
      // not JSON
    }
    throw new RpcError(res.status, code, message);
  }
  return (text ? JSON.parse(text) : null) as T;
}

const PUSH_TIMEOUT_MS = 5_000;

export function serviceDb(url: string, serviceKey: string): ChatDb {
  const call = <T>(fn: string, args: Record<string, unknown>) =>
    rpc<T>(url, serviceKey, serviceKey, fn, args);
  return {
    getAccess: (g, u) => call<Access>('get_group_access', { p_group: g, p_user: u }),
    persist: (batch) => call<PersistResult[]>('persist_messages', { p_batch: batch }),
    setLiveCount: (g, n) => call<void>('set_live_count', { p_group: g, p_count: n }),
    touchLastSeen: (g, u) => call<void>('touch_last_seen', { p_group: g, p_user: u }),
    canQuote: (u, b, c) => call<boolean>('can_quote', { p_user: u, p_book: b, p_chapter: c }),
    // Bounded, so a slow push can't hold up the next flush.
    pushMessages: async (ids, open) => {
      await rpc<number>(
        url,
        serviceKey,
        serviceKey,
        'chat_pushes',
        { p_message_ids: ids, p_open: open },
        AbortSignal.timeout(PUSH_TIMEOUT_MS),
      );
    },
  };
}
