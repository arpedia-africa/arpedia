#!/usr/bin/env node
// RFC 6238 TOTP code (SHA-1, 6 digits, 30 s) for a base32 secret.
//   node tools/totp.mjs [secret]   (default: the seeded staff secret in supabase/seed.sql)
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SEED_TOTP_SECRET = 'ARPEDIALOCALTOTPSEEDSECRETXXXXXX';

function base32(s) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const v = abc.indexOf(ch);
    if (v < 0) throw new Error(`bad base32 character ${ch}`);
    bits += v.toString(2).padStart(5, '0');
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totp(secret = SEED_TOTP_SECRET, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(totp(process.argv[2]));
