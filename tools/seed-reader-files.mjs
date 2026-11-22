#!/usr/bin/env node
// Give the seed books real sealed files so the reader (flow 04) can open them on a local stack.
//   node tools/seed-reader-files.mjs [--supabase http://127.0.0.1:55621] [book-id ...]
// Needs the stack up and reset (`pnpm db:reset` or `node tools/db2.mjs reset`) and the matching
// workers/api/.dev.vars (`pnpm dev:vars` or `node tools/db2.mjs vars`): the Supabase URL, service
// key and BOOK_MASTER_KEY are read from there (never printed). --supabase overrides the URL only.
// For every live book (or the ids given) whose live revision has chapters it
//   1. writes plausible chapter text, one paragraph per paragraph anchor (same ids, same word counts),
//   2. seals it exactly as the flow 12 seal stage does (packages/convert seal-book.ts: c{n}.full.xhtml,
//      c{n}.free.xhtml for the 10% preview and later peeks, package files, manifest.json plain, every
//      other file AES-256-GCM `IV | ciphertext | tag` with AAD `revision_id:path`, one key per chapter,
//      K_free for the preview and the free chapters),
//   3. puts the files in the api Worker's LOCAL R2 (workers/api/.wrangler/state, what `wrangler dev` serves)
//      under books/{revision}/g0-seed/, and
//   4. replaces chapter_keys, chapters.free_file/full_file and book_revisions.artifact_prefix/manifest_key.
// Idempotent: run it again for fresh keys and files. Stop `wrangler dev` first if it complains about locks.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { getPlatformProxy } from 'wrangler';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--supabase');
const only = args.filter((a, i) => !a.startsWith('--') && i !== flag + 1);

const vars = Object.fromEntries(
  readFileSync(join(root, 'workers/api/.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = (flag >= 0 ? args[flag + 1] : vars.SUPABASE_URL).replace(/\/$/, '');
const service = vars.SERVICE_ROLE_KEY ?? vars.SUPABASE_SERVICE_ROLE_KEY;
const master = Uint8Array.from(atob(vars.BOOK_MASTER_KEY), (c) => c.charCodeAt(0));
if (!url || !service || !vars.BOOK_MASTER_KEY) {
  console.error('workers/api/.dev.vars is missing (run `pnpm dev:vars` or `node tools/db2.mjs vars`).');
  process.exit(1);
}

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
      Prefer: 'return=minimal',
      ...init.headers,
    },
  });
const get = async (path) => {
  const r = await rest(path, { headers: { Prefer: '' } });
  if (!r.ok) fail(`GET ${path} ${r.status} ${await r.text()}`);
  return r.json();
};
const send = async (path, method, body) => {
  const r = await rest(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) fail(`${method} ${path} ${r.status} ${await r.text()}`);
};

// The seal code is TypeScript with extensionless imports: bundle it once, import the bundle.
const tmp = mkdtempSync(join(tmpdir(), 'arpedia-seed-reader-'));
const bundle = join(tmp, 'seal.mjs');
await build({
  stdin: {
    contents: "export { sealBook } from './seal-book.ts'; export { countWords } from '@arpedia/core';",
    resolveDir: join(root, 'packages/convert/src'),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'error',
});
const { sealBook, countWords } = await import(pathToFileURL(bundle).href);

// ─── Chapter text ───────────────────────────────────────────────────────────
const names = ['Ngozi', 'Chidi', 'Amaka', 'Tunde', 'Ifeoma', 'Emeka', 'Hauwa', 'Segun', 'Adaeze', 'Bisi'];
const places = ['the market', 'the compound', 'the veranda', 'the bus park', 'the kitchen', 'the church'];
const things = ['a tin of biscuits', 'a pot of jollof', 'a folded letter', 'a transistor radio', 'a wrapper'];
const feelings = ['quiet', 'restless', 'proud', 'afraid', 'hopeful', 'tired', 'certain'];
const openers = [
  (r) => `${r(names)} stood in ${r(places)} for a long time, holding ${r(things)}.`,
  (r) => `The dust of the harmattan lay on everything, even the words nobody said.`,
  (r) => `"You are late again," ${r(names)} said, and did not look up.`,
  (r) => `By evening the whole street knew what ${r(names)} had done.`,
  (r) => `${r(names)} felt ${r(feelings)}, the way one does before rain.`,
  (r) => `Somewhere beyond ${r(places)}, a generator coughed and went on.`,
  (r) => `Nobody in the house spoke of ${r(things)} after that day.`,
  (r) => `"It is not what you think," ${r(names)} said, though both of them knew it was.`,
  (r) => `${r(names)} counted the money twice, then a third time, as if it might change.`,
  (r) => `Morning came slowly, with the smell of fried akara and the sound of a neighbour's radio.`,
];
const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2 ** 31, 7);

/** One paragraph of exactly `words` words (countWords), ending on a full stop. */
function paragraph(words, rand) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const out = [];
  let n = 0;
  while (n < words) {
    let s = pick(openers)(pick);
    if (rand() < 0.5) s += ` ${pick(names)} felt ${pick(feelings)}, and ${pick(names)} said nothing.`;
    const w = s.split(/\s+/);
    const take = Math.min(w.length, words - n);
    let part = w.slice(0, take).join(' ');
    if (!/[.!?"]$/.test(part)) part = part.replace(/[,;:]$/, '') + '.';
    out.push(part);
    n += countWords(part);
  }
  const text = out.join(' ');
  if (countWords(text) !== words) fail(`word count drifted: ${countWords(text)} vs ${words}`);
  return text;
}

// ─── Books ──────────────────────────────────────────────────────────────────
const books = await get('books?select=id,title,current_revision_id&current_revision_id=not.is.null');
const proxy = await getPlatformProxy({
  configPath: join(root, 'workers/api/wrangler.jsonc'),
  persist: { path: join(root, 'workers/api/.wrangler/state/v3') },
});
const r2 = proxy.env.BOOKS;
let seeded = 0;

for (const book of books) {
  if (only.length && !only.includes(book.id)) continue;
  const rev = (await get(`book_revisions?id=eq.${book.current_revision_id}&select=*`))[0];
  const chapters = await get(`chapters?revision_id=eq.${rev.id}&select=*&order=ord`);
  if (!chapters.length) continue;
  const anchors = [];
  for (let from = 0; ; from += 1000) {
    const page = await get(
      `paragraph_anchors?revision_id=eq.${rev.id}&select=para_id,chapter_uid,words,fingerprint,ord&order=ord&limit=1000&offset=${from}`,
    );
    anchors.push(...page);
    if (page.length < 1000) break;
  }
  if (!anchors.length) {
    console.log(`skip ${book.title}: no paragraph anchors (flow 04 seed not loaded)`);
    continue;
  }

  // One block per anchor, in anchor order, with the anchor's exact word count.
  const rand = rng(hash(rev.id));
  const per = chapters.map((c) => anchors.filter((a) => a.chapter_uid === c.chapter_uid));
  const work = chapters.map((c, i) => {
    const blocks = per[i].map((a) => {
      const text = paragraph(a.words, rand);
      return { html: `<p>${text}</p>`, text, words: a.words };
    });
    return {
      title: c.title,
      titled: true,
      kind: c.kind,
      parentOrd: c.parent_ord,
      front: c.front,
      blocks,
      words: c.words,
      wordsBefore: c.words_before,
      imagePages: 0,
      pages: Number(c.pages),
      priceCredits: c.price_credits,
    };
  });

  // The preview cut the database already holds (free_through_ord, preview_cut_para_id).
  const m = /^c(\d+)p(\d+)$/.exec(rev.preview_cut_para_id ?? '');
  if (!m) fail(`${book.title}: no preview cut on the revision`);
  const cutChapter = Number(m[1]);
  const cutPara = Number(m[2]);
  const total = work.reduce((a, c) => a + c.words, 0);
  const cutWords =
    work.slice(0, cutChapter).reduce((a, c) => a + c.words, 0) +
    work[cutChapter].blocks.slice(0, cutPara + 1).reduce((a, b) => a + b.words, 0);
  const preview = {
    chapter: cutChapter,
    paragraph: cutPara,
    words: cutWords,
    percent: Math.round((cutWords / total) * 1000) / 10,
    freeThrough: rev.free_through_ord,
  };

  const out = await sealBook({
    bookId: book.id,
    revisionId: rev.id,
    title: book.title,
    chapters: work,
    images: {},
    preview,
    price: rev.price_credits,
    pages: rev.pages,
    masterKey: master,
    anchors: {
      uids: chapters.map((c) => c.chapter_uid),
      ids: per.map((list) => list.map((a) => a.para_id)),
      fps: per.map((list) => list.map((a) => a.fingerprint)),
      migrations: [],
    },
  });

  // R2: drop what an earlier run left, then write the new generation.
  const prefix = `books/${rev.id}/g${rev.generation}-seed/`;
  let cursor;
  do {
    const list = await r2.list({ prefix: `books/${rev.id}/`, cursor });
    if (list.objects.length) await r2.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  for (const [path, bytes] of Object.entries(out.files)) await r2.put(prefix + path, bytes);

  // Database: keys, file names, artifact location (what complete_seal writes).
  await send(`chapter_keys?revision_id=eq.${rev.id}`, 'DELETE');
  await send(
    'chapter_keys',
    'POST',
    out.keys.map((k) => ({
      revision_id: rev.id,
      chapter_uid: k.chapter_uid,
      wrapped_key: '\\x' + Buffer.from(k.wrapped_key, 'base64').toString('hex'),
      generation: 1,
    })),
  );
  for (const c of out.chapters)
    await send(`chapters?revision_id=eq.${rev.id}&chapter_uid=eq.${c.chapter_uid}`, 'PATCH', {
      free_file: c.free_file,
      full_file: c.full_file,
    });
  await send(`book_revisions?id=eq.${rev.id}`, 'PATCH', {
    artifact_prefix: prefix,
    manifest_key: prefix + 'manifest.json',
  });
  seeded++;
  console.log(
    `ok  ${book.title}: ${chapters.length} chapters, ${Object.keys(out.files).length} files, ` +
      `${out.keys.length} keys, free to ${preview.percent}% (c${cutChapter}p${cutPara}) at ${prefix}`,
  );
}

await proxy.dispose();
rmSync(tmp, { recursive: true, force: true });
if (!seeded) fail('no book was seeded (is the stack reset, with the flow 04 seed?)');
