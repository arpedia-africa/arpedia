import type { ConversationDO } from './do';
import type { InboxDO } from './inbox-do';

export interface Env {
  APP_ENV: 'local' | 'staging' | 'production';
  SUPABASE_URL: string;
  /** PostgREST apikey for calls made as the signed-in user. */
  SUPABASE_ANON_KEY: string;
  /** The Durable Object's Postgres access (persist_messages, get_group_access). */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Local CLI stack only (HS256). */
  SUPABASE_JWT_SECRET?: string;
  CONVERSATION: DurableObjectNamespace<ConversationDO>;
  /** One per reader: live inbox counts and "reading now" (absent: the inbox polls). */
  INBOX?: DurableObjectNamespace<InboxDO>;
  /** The api Worker (service binding), for the flow 14 `moderate-text` check. */
  API?: Fetcher;
}
