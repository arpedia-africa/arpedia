#!/usr/bin/env node
// Smoke test flow 04's reader routes against the local stack (pnpm db:reset, pnpm dev:workers).
//   node tools/smoke-reader.mjs [apiUrl]   (default http://127.0.0.1:8787)
// Seeds chapter keys for Harmattan Letters wrapped with the local BOOK_MASTER_KEY (never printed),
// registers a test device as Ngozi, asks /v1/reader/keys and checks every released key opens with
// the device's private key and matches the seeded key. Then checks the refusals.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyLabel, newKey, wrapKey } from '../packages/core/src/seal.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = process.argv[2] ?? 'http://127.0.0.1:8787';
const BOOK = '00000000-0000-4000-c000-000000000001';

const env = Object.fromEntries(
  execSync('pnpm -s exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const vars = Object.fromEntries(
  readFileSync(join(root, 'workers/api/.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = env.API_URL;
const anon = env.ANON_KEY;
const service = env.SERVICE_ROLE_KEY;
const master = Uint8Array.from(atob(vars.BOOK_MASTER_KEY), (c) => c.charCodeAt(0));
const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
const hex = (u) => '\\x' + Buffer.from(u).toString('hex');

const fail = (msg) => {
  console.error('FAIL', msg);
  process.exit(1);
};
const rest = (path, init = {}) =>
  fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

// 1. Seed keys for the live revision (the free key plus one per chapter).
const [book] = await rest(`books?id=eq.${BOOK}&select=current_revision_id`).then((r) => r.json());
const rev = book?.current_revision_id;
if (!rev) fail('Harmattan Letters has no live revision (run pnpm db:reset)');
const chapters = await rest(`chapters?revision_id=eq.${rev}&select=chapter_uid,ord&order=ord`).then((r) =>
  r.json(),
);
await rest(`chapter_keys?revision_id=eq.${rev}`, { method: 'DELETE' });
const plain = new Map();
const rows = [];
for (const uid of [null, ...chapters.map((c) => c.chapter_uid)]) {
  const k = newKey();
  plain.set(uid, b64(k));
  rows.push({
    revision_id: rev,
    chapter_uid: uid,
    wrapped_key: hex(await wrapKey(master, k, keyLabel(rev, uid))),
    generation: 1,
  });
}
const ins = await rest('chapter_keys', { method: 'POST', body: JSON.stringify(rows) });
if (!ins.ok) fail(`seed chapter_keys ${ins.status} ${await ins.text()}`);
console.log(`ok  seeded ${rows.length} keys for revision ${rev}`);

// 2. Sign in as Ngozi and register a device.
const tok = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ngozi@example.com', password: 'arpedia-local' }),
}).then((r) => r.json());
if (!tok.access_token) fail('sign-in failed');
const call = (path, body, token = tok.access_token) =>
  fetch(`${api}/v1/reader${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const pair = await crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['encrypt', 'decrypt'],
);
const spki = b64(await crypto.subtle.exportKey('spki', pair.publicKey));
const dev = await call('/devices', { name: 'Smoke test', public_key: spki });
const { device_id } = await dev.json();
if (dev.status !== 200 || !device_id) fail(`/devices ${dev.status}`);
console.log('ok  /devices registers a device');

const badKey = await call('/devices', { name: 'Smoke test', public_key: 'A'.repeat(200) });
if (badKey.status !== 400) fail(`/devices with a bad key returned ${badKey.status}`);
console.log('ok  /devices rejects a bad public key');

// 3. Keys: every released key opens with the device's private key and matches the seeded one.
const res = await call('/keys', { book_id: BOOK, revision_id: rev, device_id });
const body = await res.json();
if (res.status !== 200) fail(`/keys ${res.status} ${JSON.stringify(body)}`);
for (const k of body.keys) {
  const raw = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    pair.privateKey,
    Uint8Array.from(atob(k.key), (c) => c.charCodeAt(0)),
  );
  if (b64(raw) !== plain.get(k.chapter_uid)) fail(`key for ${k.chapter_uid ?? 'free'} does not match`);
}
if (!body.keys.some((k) => k.chapter_uid === null)) fail('/keys did not release the preview key');
if (!body.signature || !body.licence?.valid_until) fail('/keys returned no signed licence');
console.log(`ok  /keys releases ${body.keys.length} of ${rows.length} keys, all open on the device`);

// After Unlock all (flow 03's RPC, as Ngozi) every key is released.
const page = await fetch(`${url}/rest/v1/rpc/get_book_page`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_book: BOOK }),
}).then((r) => r.json());
const unlock = await fetch(`${url}/rest/v1/rpc/unlock_book`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_book: BOOK,
    p_expected_price: page.price_credits ?? page.price,
    p_key: crypto.randomUUID(),
  }),
});
if (!unlock.ok && !(await unlock.text()).includes('already')) fail(`unlock_book ${unlock.status}`);
const all = await call('/keys', { book_id: BOOK, revision_id: rev, device_id }).then((r) => r.json());
if (all.keys?.length !== rows.length)
  fail(`/keys after unlock released ${all.keys?.length} of ${rows.length}`);
console.log(`ok  /keys after Unlock all releases all ${rows.length} keys`);

// 4. Refusals: no token, someone else's device, a stale revision.
const noAuth = await fetch(`${api}/v1/reader/keys`, { method: 'POST' });
if (noAuth.status !== 401) fail(`/keys without a token returned ${noAuth.status}`);
console.log('ok  /keys rejects no token');
const other = await call('/keys', { book_id: BOOK, revision_id: rev, device_id: crypto.randomUUID() });
if (other.status !== 403) fail(`/keys with an unknown device returned ${other.status}`);
console.log("ok  /keys rejects a device that is not the reader's");
const stale = await call('/keys', { book_id: BOOK, revision_id: crypto.randomUUID(), device_id });
if (![404, 409].includes(stale.status)) fail(`/keys with a wrong revision returned ${stale.status}`);
console.log(`ok  /keys rejects a wrong revision (${stale.status})`);
