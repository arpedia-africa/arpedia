#!/usr/bin/env node
// Smoke test the book pipeline end to end against the local stack (flow 12):
// author upload → signed PUTs → finalize → verify → confirm → submit → seal → Publisher publishes,
// then the sealed files in R2: the manifest is there, the preview opens with K_free, a locked
// chapter does not.
//   node tools/smoke-books.mjs   (needs `pnpm db:start`, `pnpm db:reset` and `pnpm dev:vars`)
// Starts the api Worker in-process (wrangler unstable_startWorker) and stops it at the end.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy, unstable_startWorker } from 'wrangler';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { strToU8, zipSync } = createRequire(join(root, 'packages/convert/package.json'))('fflate');
const config = join(root, 'workers/api/wrangler.jsonc');

const out = execSync('pnpm -s exec supabase status -o env', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const sb = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!sb.API_URL) {
  console.error('Local Supabase is not running. Start it with `pnpm db:start`.');
  process.exit(1);
}
const devVars = Object.fromEntries(
  readFileSync(join(root, 'workers/api/.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const persist = mkdtempSync(join(tmpdir(), 'arpedia-smoke-books-'));
let worker;
const done = async (code) => {
  await worker?.dispose().catch(() => {});
  rmSync(persist, { recursive: true, force: true });
  process.exit(code);
};
const fail = async (msg) => {
  console.error('FAIL', msg);
  await done(1);
};
const ok = (msg) => console.log('ok ', msg);

// ─── A small, clean EPUB and cover ─────────────────────────────────────────
const vocab = (
  'the river ran past the old market where traders called out prices for yams pepper and cloth ' +
  'while children chased a goat between the stalls and an old woman laughed at the noise ' +
  'evening came slowly over the town and lamps were lit one by one along the dusty road'
).split(' ');
let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const sentence = () => {
  const n = 10 + Math.floor(rand() * 8);
  const w = Array.from({ length: n }, () => vocab[Math.floor(rand() * vocab.length)]);
  return w[0][0].toUpperCase() + w.join(' ').slice(1) + '.';
};
const paragraph = () => `<p>${Array.from({ length: 6 }, sentence).join(' ')}</p>`;
const chapter = (title, paras) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>` +
  `<body><h1>${title}</h1>${Array.from({ length: paras }, paragraph).join('')}</body></html>`;
const titles = ['The Market', 'The River', 'The Lamps', 'The Road'];
const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:smoke</dc:identifier><dc:title>Smoke Test</dc:title><dc:language>en</dc:language></metadata>
<manifest>${titles.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine>${titles.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`;
const epub = zipSync({
  mimetype: [strToU8('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': strToU8(
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  ),
  'OEBPS/content.opf': strToU8(opf),
  ...Object.fromEntries(titles.map((t, i) => [`OEBPS/c${i}.xhtml`, strToU8(chapter(t, 14))])),
});
// A PNG header is all the cover checks read (magic bytes and IHDR size).
const cover = new Uint8Array(33);
cover.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
new DataView(cover.buffer).setUint32(16, 1600);
new DataView(cover.buffer).setUint32(20, 2560);

// ─── Helpers ───────────────────────────────────────────────────────────────
const signIn = async (email) => {
  const tok = await fetch(`${sb.API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: sb.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'arpedia-local' }),
  }).then((r) => r.json());
  if (!tok.access_token) await fail(`sign-in ${email}: ${tok.error_description ?? tok.msg ?? 'unknown'}`);
  return tok.access_token;
};
let api;
const call = async (jwt, method, path, body) => {
  const res = await fetch(`${api}/v1/books${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) await fail(`${method} ${path} ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const rest = async (path, { jwt, method = 'GET', body } = {}) => {
  const key = jwt ? sb.ANON_KEY : sb.SERVICE_ROLE_KEY;
  const res = await fetch(`${sb.API_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt ?? key}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};
const put = async (url, bytes) => {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Content-SHA256': createHash('sha256').update(bytes).digest('hex') },
    body: bytes,
  });
  if (!res.ok) await fail(`PUT ${new URL(url).pathname.slice(0, 40)}… ${res.status} ${await res.text()}`);
};
const waitFor = async (jwt, rev, want, label) => {
  for (let i = 0; i < 60; i++) {
    const s = await call(jwt, 'GET', `/status/${rev}`);
    if (want(s)) return s;
    if (['sent_back', 'with_desk', 'rejected'].includes(s.status))
      await fail(`${label}: revision went to ${s.status} (${s.desk_reason ?? s.sent_back_note ?? ''})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  await fail(`${label}: timed out`);
};
const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const unhex = (s) => Uint8Array.from(Buffer.from(s.replace(/^\\x/, ''), 'hex'));
const aesOpen = async (key, sealed, aad) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.subarray(0, 12), additionalData: new TextEncoder().encode(aad) },
      await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']),
      sealed.subarray(12),
    ),
  );

// ─── Run ───────────────────────────────────────────────────────────────────
worker = await unstable_startWorker({
  config,
  dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, watch: false, persist },
});
api = (await worker.url).origin;
ok(`api Worker on ${api}`);

const author = await signIn('ifeoma@example.com');
const publisher = await signIn('tunde@arpedia.africa');

const up = await call(author, 'POST', '/upload', {
  meta: {
    source_type: 'epub',
    title: 'Smoke Test',
    description: 'A short story set in a busy market town, used to test the book pipeline.',
    genres: ['Literary fiction'],
    language: 'en',
  },
});
const rev = up.revision_id;
ok(`upload: revision ${rev}`);

await put(up.uploads.source, epub);
await put(up.uploads.converted, epub);
await put(up.uploads.cover, cover);
ok('signed PUTs: source, converted, cover');

const bad = await fetch(up.uploads.cover, {
  method: 'PUT',
  headers: { 'X-Content-SHA256': '0'.repeat(64) },
  body: cover,
});
if (bad.ok) await fail('a PUT with the wrong sha256 was accepted');
ok(`a wrong sha256 is refused (${bad.status})`);

const fin = await call(author, 'POST', '/finalize', { revision_id: rev, converted: true });
if (fin.status !== 'processing') await fail(`finalize ${JSON.stringify(fin)}`);
const dup = await call(author, 'POST', '/finalize', { revision_id: rev, converted: true });
if (!dup.duplicate) await fail(`a repeat finalize was not a no-op ${JSON.stringify(dup)}`);
ok('finalize (a repeat is a no-op)');

const checked = await waitFor(author, rev, (s) => s.draft_step === 'chapters', 'verify');
ok(
  `verify: ${checked.words} words, ${checked.pages} pages, ${checked.price_credits} credits, ` +
    `readiness ${checked.readiness}, ${checked.flags.length} flags` +
    (checked.flags.length ? ` (${checked.flags.map((f) => f.check_key).join(', ')})` : ''),
);

const conf = await call(author, 'POST', '/confirm', {
  revision_id: rev,
  edits: [{ op: 'rename', ord: 0, title: 'At the Market' }],
});
if (conf.chapters[0].title !== 'At the Market') await fail(`confirm ${JSON.stringify(conf.chapters[0])}`);
ok(`confirm: ${conf.chapters.length} chapters, first renamed`);

await call(author, 'POST', '/submit', { revision_id: rev });
const routed = await waitFor(
  author,
  rev,
  (s) => s.status === 'ready_for_review' || s.status === 'needs_fixes',
  'seal',
);
if (routed.status !== 'ready_for_review')
  await fail(
    `routed to ${routed.status}, readiness ${routed.readiness}, flags ${JSON.stringify(routed.flags)}`,
  );
ok(`seal + route: ready_for_review at readiness ${routed.readiness}`);

const self = await rest('rpc/publish_revision', { jwt: author, method: 'POST', body: { p_rev: rev } });
if (self.status < 400) await fail('an author published their own book');
const pub = await rest('rpc/publish_revision', { jwt: publisher, method: 'POST', body: { p_rev: rev } });
if (pub.status !== 200 || pub.json?.status !== 'live')
  await fail(`publish ${pub.status} ${JSON.stringify(pub.json)}`);
ok('Publisher published it (the author cannot)');

const { json: rows } = await rest(
  `book_revisions?id=eq.${rev}&select=book_id,manifest_key,artifact_prefix,price_credits,books!book_revisions_book_id_fkey(status,current_revision_id)`,
);
const live = rows?.[0];
if (live?.books?.status !== 'live' || live.books.current_revision_id !== rev)
  await fail(`book not live ${JSON.stringify(live)}`);
const { json: keys } = await rest(
  `chapter_keys?revision_id=eq.${rev}&revoked_at=is.null&select=chapter_uid,wrapped_key`,
);
ok(`book live; ${keys.length} active keys`);

await worker.dispose();
worker = undefined;

// ─── The sealed files ──────────────────────────────────────────────────────
const proxy = await getPlatformProxy({ configPath: config, persist: { path: join(persist, 'v3') } });
try {
  const get = async (k) => {
    const o = await proxy.env.BOOKS.get(k);
    return o ? new Uint8Array(await o.arrayBuffer()) : null;
  };
  const raw = await get(live.manifest_key);
  if (!raw) await fail(`manifest missing at ${live.manifest_key}`);
  const manifest = JSON.parse(new TextDecoder().decode(raw));
  if (manifest.revision_id !== rev || manifest.price_credits !== live.price_credits)
    await fail(`manifest ${JSON.stringify({ ...manifest, chapters: undefined })}`);
  const sum = manifest.chapters.reduce((a, c) => a + c.price_credits, 0);
  if (sum !== manifest.price_credits)
    await fail(`chapter prices sum to ${sum}, book is ${manifest.price_credits}`);
  ok(`manifest in R2: ${manifest.chapters.length} chapters, ${manifest.price_credits} credits`);

  const master = unb64(devVars.BOOK_MASTER_KEY);
  const keyOf = async (uid) => {
    const row = keys.find((k) => k.chapter_uid === uid);
    if (!row) await fail(`no key for ${uid ?? 'free'}`);
    return aesOpen(master, unhex(row.wrapped_key), `wrap:${rev}:${uid ?? 'free'}`);
  };
  const kFree = await keyOf(null);
  const file = async (path) => {
    const b = await get(live.artifact_prefix + path);
    if (!b) await fail(`sealed file missing: ${path}`);
    return b;
  };
  const opens = (key, bytes, path) =>
    aesOpen(key, bytes, `${rev}:${path}`).then(
      (b) => new TextDecoder().decode(b),
      () => null,
    );

  const preview = manifest.chapters.find((c) => c.free_file);
  const locked = manifest.chapters.filter((c) => c.price_credits > 0);
  if (!locked.length) await fail('no locked chapter to check');
  if (preview) {
    const html = await opens(kFree, await file(preview.free_file), preview.free_file);
    if (!html?.includes('<p')) await fail(`${preview.free_file} does not open with K_free`);
    ok(`${preview.free_file} (preview) opens with K_free`);
  }
  if (!(await opens(kFree, await file('nav.xhtml'), 'nav.xhtml')))
    await fail('nav.xhtml does not open with K_free');
  for (const c of locked) {
    const bytes = await file(c.full_file);
    if (await opens(kFree, bytes, c.full_file)) await fail(`${c.full_file} opens with K_free`);
    const html = await opens(await keyOf(c.chapter_uid), bytes, c.full_file);
    if (!html?.includes(c.title)) await fail(`${c.full_file} does not open with its own key`);
  }
  ok(`${locked.length} locked chapters do not open with K_free; each opens with its own key`);
} finally {
  await proxy.dispose();
}
console.log('PASS smoke-books');
await done(0);
