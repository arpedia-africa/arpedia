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
  // Spec check 16-27: the place in "IP and place", from Vercel's geolocation of the browser.
  const city = asciiCity(h.get('x-vercel-ip-city'));
  if (city) out['x-client-city'] = city;
  const country = h.get('x-vercel-ip-country')?.trim().toUpperCase();
  if (country && /^[A-Z]{2}$/.test(country)) out['x-client-country'] = country;
  return out;
}

/**
 * Vercel sends the city URI-encoded ("Port%20Harcourt", "Lom%C3%A9"). Header values must stay
 * ASCII, so accents are dropped ("Lomé" → "Lome") and anything else odd is left out.
 */
function asciiCity(raw: string | null): string | null {
  if (!raw) return null;
  let city: string;
  try {
    city = decodeURIComponent(raw);
  } catch {
    return null;
  }
  city = city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return city ? city.slice(0, 80) : null;
}
