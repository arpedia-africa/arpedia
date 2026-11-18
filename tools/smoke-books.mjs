#!/usr/bin/env node
// Smoke test the book pipeline end to end against the local stack (flow 12):
// author upload → signed PUTs → finalize → verify → confirm → submit → seal → Needs fixes → staff
// preview, fixes with Undo, release (reseal) → Publisher publishes; then the sealed files in R2: the
// manifest is there, the preview opens with K_free, a locked chapter does not. Last, a PDF goes
// through the desk endpoints back to chapter confirmation.
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
const chapter = (title, paras, heading = true) =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>` +
  `<body>${heading ? `<h1>${title}</h1>` : ''}${Array.from({ length: paras }, paragraph).join('')}</body></html>`;
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
  // the second chapter has no heading, so it gets a chapter_title flag
  ...Object.fromEntries(titles.map((t, i) => [`OEBPS/c${i}.xhtml`, strToU8(chapter(t, 14, i !== 1))])),
});
// A PNG header is all the cover checks read (magic bytes and IHDR size). 600 px wide is too small
// (cover_too_small), so with the missing copyright page and the untitled chapter the book scores 82.
const cover = new Uint8Array(33);
cover.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
new DataView(cover.buffer).setUint32(16, 600);
new DataView(cover.buffer).setUint32(20, 900);

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
const send = async (jwt, method, path, body) => {
  const res = await fetch(`${api}/v1/books${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
};
const call = async (jwt, method, path, body) => {
  const res = await send(jwt, method, path, body);
  if (!res.ok) await fail(`${method} ${path} ${res.status} ${JSON.stringify(res.json)}`);
  return res.json;
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
const waitFor = async (jwt, rev, want, label, stops = ['sent_back', 'with_desk', 'rejected']) => {
  for (let i = 0; i < 60; i++) {
    const s = await call(jwt, 'GET', `/status/${rev}`);
    if (want(s)) return s;
    if (stops.includes(s.status))
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
const ops = await signIn('femi@arpedia.africa');
const tolu = await signIn('tolu@example.com');

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
if (routed.status !== 'needs_fixes')
  await fail(
    `routed to ${routed.status}, readiness ${routed.readiness}, flags ${JSON.stringify(routed.flags)}`,
  );
ok(`seal + route: needs_fixes at readiness ${routed.readiness}`);

// ─── Staff: preview, fixes, Undo, release ──────────────────────────────────
const preview = await call(publisher, 'POST', '/preview-url', { revision_id: rev });
const copy = await fetch(preview.book_url).then((r) => r.json());
if (copy.chapters?.length !== 4) await fail(`preview working copy ${JSON.stringify(copy).slice(0, 200)}`);
const stranger = await send(tolu, 'POST', '/preview-url', { revision_id: rev });
if (stranger.status !== 403) await fail(`another author got a preview link (${stranger.status})`);
const tampered = await fetch(preview.book_url.replace(/\/objects\/[^.]+/, '/objects/eyJrIjoid29yay8ifQ'));
if (tampered.ok) await fail('a tampered read link worked');
ok('preview-url: staff read the working copy; another author and a tampered link cannot');

const flag = (s, key) => s.flags.find((f) => f.check_key === key);
const version = async () =>
  (await rest(`book_revisions?id=eq.${rev}&select=work_version`, { jwt: publisher })).json[0].work_version;
const notStaff = await send(author, 'POST', '/fix', {
  revision_id: rev,
  flag_id: flag(routed, 'chapter_title').id,
  expected_version: await version(),
});
if (notStaff.status !== 403) await fail(`an author applied a staff fix (${notStaff.status})`);
const stale = await send(publisher, 'POST', '/fix', {
  revision_id: rev,
  flag_id: flag(routed, 'chapter_title').id,
  expected_version: (await version()) + 1,
});
if (stale.status !== 409) await fail(`a fix on an old version was accepted (${stale.status})`);

let fixed = await call(publisher, 'POST', '/fix', {
  revision_id: rev,
  flag_id: flag(routed, 'chapter_title').id,
  expected_version: await version(),
});
fixed = await call(publisher, 'POST', '/fix', {
  revision_id: rev,
  flag_id: flag(routed, 'copyright_missing').id,
  expected_version: fixed.work_version,
});
if (fixed.readiness !== 92) await fail(`after two fixes readiness is ${fixed.readiness}, want 92`);
ok(`fix: chapter title and copyright page accepted, readiness ${fixed.readiness}`);

const dismissed = await call(publisher, 'POST', '/fix', {
  revision_id: rev,
  flag_id: flag(routed, 'cover_too_small').id,
  op: { op: 'dismiss_flag', reason: 'Smoke test' },
  expected_version: fixed.work_version,
});
if (dismissed.readiness !== 100) await fail(`dismiss left readiness at ${dismissed.readiness}`);
const undone = await call(publisher, 'POST', '/fix/undo', {
  fix_id: dismissed.fix_id,
  expected_version: dismissed.work_version,
});
if (undone.readiness !== 92) await fail(`undo left readiness at ${undone.readiness}`);
const afterFixes = await call(publisher, 'GET', `/status/${rev}`);
if (afterFixes.flags.map((f) => f.check_key).join() !== 'cover_too_small')
  await fail(`open flags after fixes: ${afterFixes.flags.map((f) => f.check_key)}`);
ok('fix: dismiss then Undo puts the cover flag back (readiness 100 → 92)');

const released = await call(publisher, 'POST', '/release', { revision_id: rev });
if (released.status !== 'ready_for_review') await fail(`release ${JSON.stringify(released)}`);
const { json: chapterRows } = await rest(
  `chapters?revision_id=eq.${rev}&select=ord,title,price_credits,full_file&order=ord`,
);
if (chapterRows[0].title !== 'Copyright' || chapterRows[0].price_credits !== 0 || !chapterRows[0].full_file)
  await fail(`chapters after release ${JSON.stringify(chapterRows)}`);
if (chapterRows[2].title !== 'Chapter 2') await fail(`renamed chapter is "${chapterRows[2].title}"`);
ok(`release: resealed, ready_for_review; ${chapterRows.length} chapters, Copyright first at 0 credits`);

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
// ─── Desk: a PDF goes to the desk and back to chapter confirmation ──────────
worker = await unstable_startWorker({
  config,
  dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, watch: false, persist },
});
api = (await worker.url).origin;
const pdf = strToU8('%PDF-1.4\n% smoke test source\n');
const pdfUp = await call(tolu, 'POST', '/upload', {
  meta: { source_type: 'pdf', title: 'Desk Smoke', description: 'A PDF for the desk.', language: 'en' },
});
if (pdfUp.uploads.converted) await fail('a PDF upload got a converted link');
await put(pdfUp.uploads.source, pdf);
const toDesk = await call(tolu, 'POST', '/finalize', { revision_id: pdfUp.revision_id, converted: false });
if (toDesk.status !== 'with_desk') await fail(`PDF finalize ${JSON.stringify(toDesk)}`);
const notDesk = await send(tolu, 'POST', '/desk/claim', {});
if (notDesk.status !== 403) await fail(`an author claimed a desk job (${notDesk.status})`);
const { job } = await call(ops, 'POST', '/desk/claim', { revision_id: pdfUp.revision_id });
if (job?.revision_id !== pdfUp.revision_id) await fail(`desk claim ${JSON.stringify(job)}`);
const src = await call(ops, 'POST', '/desk/source', { revision_id: job.revision_id });
const got = new Uint8Array(await fetch(src.url).then((r) => r.arrayBuffer()));
if (Buffer.compare(got, pdf) !== 0) await fail('desk source download differs from the upload');
const stolen = await send(publisher, 'POST', '/desk/source', { revision_id: job.revision_id });
if (stolen.status !== 409) await fail(`someone without the lease got the source (${stolen.status})`);
await call(ops, 'POST', '/desk/heartbeat', { revision_id: job.revision_id });
const deskUp = await call(ops, 'POST', '/desk/upload', { revision_id: job.revision_id });
await put(deskUp.url, epub);
const pushed = await call(ops, 'POST', '/finalize', { revision_id: job.revision_id, converted: true });
if (pushed.status !== 'processing') await fail(`desk push ${JSON.stringify(pushed)}`);
const deskChecked = await waitFor(tolu, job.revision_id, (s) => s.draft_step === 'chapters', 'desk verify', [
  'sent_back',
  'rejected',
]);
const keysFound = deskChecked.flags.map((f) => f.check_key);
if (!keysFound.includes('pdf_source') || !keysFound.includes('low_structure_confidence'))
  await fail(`PDF flags missing: ${keysFound}`);
ok(`desk: claim, source, heartbeat, upload, push → chapters ready (${keysFound.join(', ')})`);

console.log('PASS smoke-books');
await done(0);
