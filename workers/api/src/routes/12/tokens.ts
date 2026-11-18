// Signed URLs (rules 5, 19, 21). The Worker signs {R2 key, size limit, expiry} with UPLOAD_SIGNING_KEY;
// PUT /v1/books/objects/:token streams the body into R2, and a read token serves the files under a
// prefix (GET /v1/books/objects/:token/<path>). No S3 credentials leave the Worker.

export interface UploadClaim {
  /** R2 object key. */
  k: string;
  /** Largest body accepted, in bytes. */
  max: number;
  /** Expiry, seconds since the epoch. */
  exp: number;
  /** 'get': read files under the prefix `k` (previews, desk downloads). Absent: one upload. */
  use?: 'get';
}

const enc = new TextEncoder();
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);

export async function signUpload(secret: string, claim: UploadClaim): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claim)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The claim if the token is genuine and unexpired, else null. */
export async function verifyUpload(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<UploadClaim | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const claim = JSON.parse(new TextDecoder().decode(unb64url(body))) as UploadClaim;
    return claim.exp * 1000 > now ? claim : null;
  } catch {
    return null;
  }
}
