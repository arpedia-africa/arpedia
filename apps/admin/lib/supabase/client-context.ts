// Flow 16 rule 22: the console reaches Supabase from its own server, so PostgREST sees the
// server's address and user agent. These headers carry the staff browser's own, which
// write_audit prefers (see migration 16_audit_client). Values are trimmed and capped; anything
// that isn't there is left out.

/** Headers to send to Supabase for the staff browser behind this request. */
export function clientContextHeaders(h: Pick<Headers, 'get'>): Record<string, string> {
  const out: Record<string, string> = {};
  // Vercel puts the browser's address first in x-forwarded-for (and in x-real-ip).
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '').trim();
  if (ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip)) out['x-client-ip'] = ip;
  const ua = h.get('user-agent')?.trim();
  if (ua) out['x-client-user-agent'] = ua.slice(0, 300);
  const id = (h.get('x-vercel-id') ?? h.get('x-request-id'))?.trim();
  if (id) out['x-client-request-id'] = id.slice(0, 200);
  return out;
}
