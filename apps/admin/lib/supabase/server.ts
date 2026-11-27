import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import type { Database } from '@arpedia/core';
import { clientContextHeaders } from './client-context';
import { sessionCookieOptions, TRUST_COOKIE } from './cookies';

/** Supabase client for server components and actions, acting as the signed-in staff member. */
export async function serverSupabase(opts: { trusted?: boolean } = {}) {
  const store = await cookies();
  const trusted = opts.trusted ?? store.get(TRUST_COOKIE)?.value === '1';
  // The audit log records the staff browser's address and device, not this server's (rule 22).
  const context = clientContextHeaders(await headers());
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: context },
      cookies: {
        getAll: () => store.getAll(),
        setAll: list => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, sessionCookieOptions(options, trusted)));
          } catch {
            // Server components cannot set cookies; proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
