// Per-key request limits through Cloudflare's Workers Rate Limiting binding (wrangler.jsonc
// `ratelimits`). The binding counts per Cloudflare location, so the limit is a brake on
// scraping and loops, not an exact quota. No binding (unit tests, old local config): allowed.

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** True when this key is over its limit. A limiter that errors lets the request through. */
export async function overLimit(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

/** Flow 04 `/keys` and `/download`: one bucket per reader and device. */
export const keysLimitKey = (userId: string, deviceId: string) => `keys:${userId}:${deviceId}`;
