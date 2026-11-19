import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@arpedia/core';
import { sessionCookieOptions, TRUST_COOKIE } from './cookies';

/** Supabase client for server components and actions, acting as the signed-in staff member. */
export async function serverSupabase(opts: { trusted?: boolean } = {}) {
  const store = await cookies();
  const trusted = opts.trusted ?? store.get(TRUST_COOKIE)?.value === '1';
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
