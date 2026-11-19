/** Set to "1" when the staff member ticked "Trust this browser for 12 hours" at two-step. */
export const TRUST_COOKIE = 'arp_trust';
export const TRUST_SECONDS = 12 * 60 * 60;

type CookieOptions = { maxAge?: number; expires?: Date | string } & Record<string, unknown>;

/**
 * Session cookies live at most 12 hours when the browser is trusted, and end with the browser
 * otherwise (flow 16 rule 4). Used by serverSupabase and proxy.ts, which refresh the same cookies.
 */
export function sessionCookieOptions<T extends CookieOptions>(options: T, trusted: boolean): T {
  const { maxAge, expires: _expires, ...rest } = options;
  if (!trusted || !maxAge) return rest as T;
  return { ...rest, maxAge: Math.min(maxAge, TRUST_SECONDS) } as T;
}
