import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arpedia/core';
import type { Env } from './env';

/**
 * Service-role client. It bypasses RLS, so use it only to call RPCs that check their own rules
 * (ledger, keys, verification). Never write money tables directly: the database refuses anyway.
 */
export function serviceDb(env: Env, headers?: Record<string, string>): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args) => fetch(...args), headers },
  });
}
