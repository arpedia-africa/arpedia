#!/usr/bin/env node
// Sample content for an empty staging database (owner approved, 24 Nov): 6 original sample books
// (several genres, a 10% free preview, chapters of different lengths, covers) with real sealed
// files in R2, 2 author profiles, 1 public club and a Home that isn't empty.
//   node tools/launch/staging-content.mjs            staging (the coordinator runs this)
//   node tools/launch/staging-content.mjs --local    a local stack (builders, tests)
//   --reseal                                         seal every book again (new keys and files)
// Environment (never read from a file; nothing here is printed):
//   APP_ENV=staging                      required unless --local
//   SUPABASE_URL                         staging: the host in workers/api/wrangler.jsonc env.staging;
//                                        --local: 127.0.0.1 or localhost
//   SUPABASE_SERVICE_ROLE_KEY            service role (REST and the Auth admin API)
//   BOOK_MASTER_KEY                      the api Worker's master key for that environment (base64)
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,     staging only: an R2 API token that can write the api
//   R2_SECRET_ACCESS_KEY                 Worker's staging books bucket (R2_ENDPOINT optional)
// --local writes the files to the api Worker's local R2 (workers/api/.wrangler/state, what
// `wrangler dev` serves); stop `wrangler dev` first if it complains about locks.
// Staging is on the internet: no account gets a known password and no staff account is made. The
// two authors get a random password that is thrown away (nobody signs in as them), @example.com
// addresses (never delivered) and a verified email, so no verify email is sent.
// Safe to repeat: fixed ids, upserts, and books already sealed are left alone (unless --reseal).
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { parseArgs, requireEnv, ROOT, runIfMain, wranglerConfig } from './lib.mjs';
import { r2FromEnv } from './r2.mjs';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * Where the tool may write. Throws (nothing written) unless it is the staging project with
 * APP_ENV=staging, or --local against a local stack.
 */
export function guard(env, args, stagingUrl = wranglerConfig('api').env.staging.vars.SUPABASE_URL) {
  let host;
  try {
    host = new URL(env.SUPABASE_URL ?? '').hostname;
  } catch {
    throw new Error('Refused: SUPABASE_URL is missing or not a URL.');
  }
  if (args.local) {
    if (!LOCAL_HOSTS.includes(host))
      throw new Error(`Refused: --local needs a local SUPABASE_URL, not ${host}.`);
    return 'local';
  }
  if (env.APP_ENV !== 'staging')
    throw new Error('Refused: set APP_ENV=staging (or pass --local for a local stack).');
  const staging = new URL(stagingUrl).hostname;
  if (host !== staging)
    throw new Error(`Refused: SUPABASE_URL must be the staging project (${staging}), not ${host}.`);
  return 'staging';
}

// ─── Content ────────────────────────────────────────────────────────────────
export const AUTHORS = [
  {
    key: 'adaora',
    email: 'sample-author-adaora@example.com',
    name: 'Adaora Eze',
    location: 'Enugu',
    bio: 'Sample author on Arpedia staging. Writes quiet novels about families, faith and small towns.',
  },
  {
    key: 'kunle',
    email: 'sample-author-kunle@example.com',
    name: 'Kunle Bakare',
    location: 'Lagos',
    bio: 'Sample author on Arpedia staging. Writes love stories, ferries and short reads for the bus.',
  },
];

// Chapter word targets differ on purpose: short, long and uneven books, so the preview cut falls
// inside a chapter for some books and after whole chapters for others.
export const BOOKS = [
  {
    key: 'rain-keeper',
    author: 'adaora',
    title: 'The Rain Keeper',
    genres: ['Fiction', 'African literature', 'Nigerian books'],
    description:
      'In a town that has not seen rain for two years, a schoolgirl inherits her grandmother’s old job: keeping the rain. A sample book for testing Arpedia.',
    cover: [
      [38, 70, 83],
      [233, 196, 106],
    ],
    chapters: [1200, 2400, 900, 3100, 1800, 2600, 700, 2200],
  },
  {
    key: 'morning-prayers',
    author: 'adaora',
    title: 'Morning Prayers for Busy People',
    genres: ['Faith', 'Personal growth', 'Short reads'],
    description:
      'Twelve short readings for the first ten minutes of the day, before the phone and the traffic. A sample book for testing Arpedia.',
    cover: [
      [106, 76, 147],
      [244, 162, 97],
    ],
    chapters: [320, 450, 380, 600, 300, 520, 410, 350, 480, 560, 330, 440],
  },
  {
    key: 'wedding-owerri',
    author: 'kunle',
    title: 'A Wedding in Owerri',
    genres: ['Romance', 'Nigerian books', 'Fiction'],
    description:
      'Two families, one wedding and a best man who has never once been on time. A sample book for testing Arpedia.',
    cover: [
      [188, 71, 73],
      [255, 214, 165],
    ],
    chapters: [1500, 2200, 3500, 1800, 2600, 3000, 1700, 2900, 2100, 3300],
  },
  {
    key: 'last-ferry',
    author: 'kunle',
    title: 'The Last Ferry',
    genres: ['Drama', 'Fiction'],
    description:
      'The last ferry of the night leaves at ten. Six passengers, one storm and a secret in the cargo hold. A sample book for testing Arpedia.',
    cover: [
      [29, 53, 87],
      [168, 218, 220],
    ],
    chapters: [2800, 1900, 6000, 2400, 1500, 3200],
  },
  {
    key: 'bus-stories',
    author: 'kunle',
    title: 'Small Stories for the Bus',
    genres: ['Short reads', 'African literature'],
    description:
      'Fourteen stories, each one short enough to finish between two bus stops. A sample book for testing Arpedia.',
    cover: [
      [42, 157, 143],
      [233, 216, 166],
    ],
    chapters: [600, 900, 400, 1200, 750, 500, 1100, 650, 800, 450, 1000, 700, 550, 950],
  },
  {
    key: 'grace-ledger',
    author: 'adaora',
    title: 'The Grace Ledger',
    genres: ['Christian', 'Fiction', 'Drama'],
    description:
      'A church treasurer finds a ledger of debts nobody ever collected, and decides to pay them back. A sample book for testing Arpedia.',
    cover: [
      [93, 64, 55],
      [242, 204, 143],
    ],
    chapters: [2000, 1600, 2700, 1300, 3400, 2100, 1800],
  },
];

export const CLUB = {
  key: 'club',
  name: 'Staging Readers',
  description: 'A public club for trying Arpedia on staging. This week: The Rain Keeper ch. 1–3.',
  weekly: { book: 'rain-keeper', from: 1, to: 3, note: 'Say hello and share a line you liked' },
};

/** A fixed uuid for a staging object, so every run writes the same rows. */
export function fixedId(name) {
  const h = createHash('sha256').update(`arpedia-staging-content:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// mulberry32: 32-bit integer maths, so no precision is lost.
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2 ** 31, 7);

const CAST = [
  'Ngozi',
  'Chidi',
  'Amaka',
  'Tunde',
  'Ifeoma',
  'Emeka',
  'Hauwa',
  'Segun',
  'Adaeze',
  'Bisi',
  'Musa',
  'Yemi',
];
const PLACES = [
  'the market',
  'the compound',
  'the veranda',
  'the bus park',
  'the kitchen',
  'the church hall',
  'the jetty',
  'the school gate',
  'the junction',
  'the roof',
];
const THINGS = [
  'a tin of biscuits',
  'a folded letter',
  'a transistor radio',
  'an old wrapper',
  'a bunch of keys',
  'a flask of tea',
  'a hymn book',
  'a torn photograph',
];
const FEELINGS = ['quiet', 'restless', 'proud', 'afraid', 'hopeful', 'tired', 'certain', 'amused'];
const SENTENCES = [
  (r) => `${r(CAST)} stood in ${r(PLACES)} for a long time, holding ${r(THINGS)}.`,
  () => 'The dust lay on everything, even on the words nobody said.',
  (r) => `"You are late again," ${r(CAST)} said, and did not look up.`,
  (r) => `By evening the whole street knew what ${r(CAST)} had done.`,
  (r) => `${r(CAST)} felt ${r(FEELINGS)}, the way one does before rain.`,
  (r) => `Somewhere beyond ${r(PLACES)}, a generator coughed and went on.`,
  (r) => `Nobody in the house spoke of ${r(THINGS)} after that day.`,
  (r) => `"It is not what you think," ${r(CAST)} said, though both of them knew it was.`,
  (r) => `${r(CAST)} counted the money twice, then a third time, as if it might change.`,
  () => 'Morning came slowly, with the smell of fried akara and the sound of a neighbour’s radio.',
  (r) => `There was a way ${r(CAST)} laughed that made strangers laugh too.`,
  (r) => `The road to ${r(PLACES)} was longer than anyone remembered, and hotter.`,
  () => 'Rain was promised on the radio every evening, and every evening it did not come.',
  (r) => `${r(CAST)} wrote three lines, crossed out two, and kept the last one.`,
  (r) => `When the light went off, ${r(CAST)} lit a candle and kept reading.`,
  () => 'Nobody said goodbye properly; they said see you tomorrow, and meant it.',
];

/** Chapter text for one book: paragraphs of 40 to 160 words, about `target` words in all. */
export function chapterParagraphs(bookKey, ord, target) {
  const rand = rng(hash(`${bookKey}:${ord}`));
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const paras = [];
  let total = 0;
  while (total < target) {
    const want = Math.min(40 + Math.floor(rand() * 120), Math.max(target - total, 12));
    const out = [];
    let n = 0;
    while (n < want) {
      const s = pick(SENTENCES)(pick);
      out.push(s);
      n += s.split(/\s+/).length;
    }
    paras.push(out.join(' '));
    total += n;
  }
  return paras;
}

const chapterTitle = (book, ord) =>
  book.key === 'bus-stories'
    ? `Story ${ord + 1}`
    : book.key === 'morning-prayers'
      ? `Day ${ord + 1}`
      : `Chapter ${ord + 1}`;

/** A 600×900 PNG: a vertical gradient between the book's two colours. */
export function coverPng([from, to], width = 600, height = 900) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const px = from.map((c, i) => Math.round(c + (to[i] - c) * t));
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) rows.set(px, row + 1 + x * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Clients ────────────────────────────────────────────────────────────────
function supabase(url, key, fetchImpl = fetch) {
  const base = url.replace(/\/$/, '');
  const call = async (path, { method = 'GET', body, prefer } = {}) => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path.split('?')[0]}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const q = (s) => `/rest/v1/${s}`;
  return {
    get: (path) => call(q(path)),
    upsert: (table, rows, onConflict) =>
      call(q(`${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`), {
        method: 'POST',
        body: rows,
        prefer: 'resolution=merge-duplicates,return=representation',
      }),
    insert: (table, rows) => call(q(table), { method: 'POST', body: rows, prefer: 'return=minimal' }),
    patch: (path, body) => call(q(path), { method: 'PATCH', body, prefer: 'return=minimal' }),
    del: (path) => call(q(path), { method: 'DELETE', prefer: 'return=minimal' }),
    rpc: (fn, args = {}) => call(q(`rpc/${fn}`), { method: 'POST', body: args }),
    async userByEmail(email) {
      for (let page = 1; ; page++) {
        const body = await call(`/auth/v1/admin/users?page=${page}&per_page=1000`);
        const users = body?.users ?? [];
        const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
        if (hit || users.length < 1000) return hit ?? null;
      }
    },
    createUser: (body) => call('/auth/v1/admin/users', { method: 'POST', body }),
  };
}

/** The books bucket: staging through R2's S3 API, --local through wrangler's local state. */
async function booksBucket(mode, env) {
  if (mode === 'local') {
    const { getPlatformProxy } = await import('wrangler');
    const proxy = await getPlatformProxy({
      configPath: join(ROOT, 'workers/api/wrangler.jsonc'),
      persist: { path: join(ROOT, 'workers/api/.wrangler/state/v3') },
    });
    const b = proxy.env.BOOKS;
    return {
      put: (key, bytes) => b.put(key, bytes),
      async list(prefix) {
        const keys = [];
        let cursor;
        do {
          const page = await b.list({ prefix, cursor });
          keys.push(...page.objects.map((o) => o.key));
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return keys;
      },
      del: (key) => b.delete(key),
      close: () => proxy.dispose(),
    };
  }
  requireEnv(env, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
  const bucket = wranglerConfig('api').env.staging.r2_buckets.find((r) => r.binding === 'BOOKS').bucket_name;
  const r2 = r2FromEnv(env);
  return {
    put: (key, bytes) => r2.put(bucket, key, Buffer.from(bytes)),
    list: async (prefix) => (await r2.list(bucket, prefix)).map((o) => o.key),
    del: (key) => r2.del(bucket, key),
    close: async () => {},
  };
}

/** Run `fn` over `items`, `n` at a time. */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// The seal and count code is TypeScript with extensionless imports: bundle it once, import it.
async function loadConvert() {
  const { build } = await import('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'arpedia-staging-content-'));
  const outfile = join(tmp, 'convert.mjs');
  await build({
    stdin: {
      contents:
        "export { sealBook, assignAnchors } from './seal-book.ts'; export { priceChapters } from './verify.ts'; export { countWords } from '@arpedia/core';",
      resolveDir: join(ROOT, 'packages/convert/src'),
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PARA_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

// ─── Steps ──────────────────────────────────────────────────────────────────
async function ensureAuthor(db, a, log) {
  let user = await db.userByEmail(a.email);
  if (!user) {
    // A random password nobody keeps: the account exists only to own the sample books.
    user = await db.createUser({
      email: a.email,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
      user_metadata: { full_name: a.name },
    });
    log(`new author  ${a.name}`);
  } else log(`author      ${a.name} (exists)`);
  const id = user.id;
  await db.patch(`profiles?id=eq.${id}`, {
    full_name: a.name,
    is_author: true,
    email_verified_at: new Date().toISOString(),
  });
  await db.upsert(
    'author_profiles',
    [{ user_id: id, pen_name: a.name, bio: a.bio, location: a.location, legal_name: a.name }],
    'user_id',
  );
  return id;
}

async function ensureBook(db, bucket, convert, book, authorId, masterKey, reseal, log) {
  const bookId = fixedId(`book:${book.key}`);
  const revId = fixedId(`revision:${book.key}`);
  const [existing] = await db.get(
    `book_revisions?id=eq.${revId}&select=id,generation,sealed_generation,published_at`,
  );

  await db.upsert(
    'books',
    [
      {
        id: bookId,
        author_id: authorId,
        title: book.title,
        genres: book.genres,
        description: book.description,
      },
    ],
    'id',
  );
  // Kept only when the last run finished (a stopped --reseal has a newer generation than sealed).
  if (existing?.sealed_generation != null && existing.sealed_generation === existing.generation && !reseal) {
    log(`book        ${book.title} (sealed, kept)`);
    return bookId;
  }

  // Chapters → counted words, pages, price, preview cut and chapter prices (as verify does).
  const { countWords, priceChapters, assignAnchors, sealBook } = convert;
  const chapters = book.chapters.map((target, ord) => ({
    title: chapterTitle(book, ord),
    titled: true,
    kind: 'chapter',
    parentOrd: null,
    front: null,
    blocks: chapterParagraphs(book.key, ord, target).map((text) => ({
      html: `<p>${esc(text)}</p>`,
      text,
      words: countWords(text),
    })),
    words: 0,
    wordsBefore: 0,
    imagePages: 0,
    pages: 0,
    priceCredits: 0,
  }));
  const { words, pages, price, preview } = priceChapters(chapters);

  // Fixed chapter uids and paragraph ids, so a reseal keeps readers' places and notes.
  let nUid = 0;
  let nPara = 0;
  const anchors = await assignAnchors(chapters, [], {
    uuid: () => fixedId(`chapter:${book.key}:${nUid++}`),
    paraId: () => {
      const h = createHash('sha256').update(`para:${book.key}:${nPara++}`).digest();
      return 'p_' + Array.from(h.subarray(0, 10), (b) => PARA_ALPHABET[b & 31]).join('');
    },
  });
  const sealed = await sealBook({
    bookId,
    revisionId: revId,
    title: book.title,
    chapters,
    images: {},
    preview,
    price,
    pages,
    masterKey,
    anchors,
  });

  // R2 first, so the database never points at files that aren't there.
  const generation = (existing?.generation ?? 0) + 1;
  const prefix = `books/${revId}/g${generation}/`;
  const cover = coverPng(book.cover);
  const coverKey = `src/${revId}/cover`;
  await bucket.put(coverKey, cover);
  await pool(Object.entries(sealed.files), 8, ([path, bytes]) => bucket.put(prefix + path, bytes));

  const now = new Date().toISOString();
  const cut = sealed.manifest.preview_cut;
  await db.upsert(
    'book_revisions',
    [
      {
        id: revId,
        book_id: bookId,
        revision_no: 1,
        status: 'live',
        source_type: 'epub',
        uploaded_by: authorId,
        words,
        pages,
        price_credits: price,
        preview_percent: 10,
        free_through_ord: preview.freeThrough,
        preview_cut_para_id: cut.para_id,
        preview_cut_chapter_uid: cut.chapter_uid,
        cover_key: coverKey,
        cover_sha256: createHash('sha256').update(cover).digest('hex'),
        generation,
        artifact_prefix: prefix,
        manifest_key: `${prefix}manifest.json`,
        submitted_at: existing?.published_at ?? now,
        published_at: existing?.published_at ?? now,
      },
    ],
    'id',
  );
  await db.upsert(
    'chapters',
    chapters.map((c, ord) => ({
      revision_id: revId,
      ord,
      chapter_uid: sealed.chapters[ord].chapter_uid,
      kind: c.kind,
      title: c.title,
      words: c.words,
      words_before: c.wordsBefore,
      pages: c.pages,
      price_credits: c.priceCredits,
      free_file: sealed.chapters[ord].free_file,
      full_file: sealed.chapters[ord].full_file,
    })),
    'revision_id,ord',
  );
  // What complete_seal writes: anchors replaced, old keys revoked, new keys for this generation.
  // REST has no transaction (and one active key per chapter is enforced), so a run that stops here
  // leaves the book unsealed: sealed_generation is written last, and the next run seals it again.
  await db.del(`paragraph_anchors?revision_id=eq.${revId}`);
  await db.insert(
    'paragraph_anchors',
    sealed.anchors.map((a) => ({ revision_id: revId, ...a })),
  );
  await db.patch(`chapter_keys?revision_id=eq.${revId}&revoked_at=is.null`, { revoked_at: now });
  await db.insert(
    'chapter_keys',
    sealed.keys.map((k) => ({
      revision_id: revId,
      chapter_uid: k.chapter_uid,
      wrapped_key: '\\x' + Buffer.from(k.wrapped_key, 'base64').toString('hex'),
      generation,
    })),
  );

  // Search matches the free preview only (what the Worker's search-text job writes).
  await db.rpc('set_book_search_text', {
    p_rev: revId,
    p_rows: chapters.slice(0, preview.chapter + 1).map((c, ord) => ({
      ord,
      text: (ord < preview.chapter ? c.blocks : c.blocks.slice(0, preview.paragraph + 1))
        .map((b) => b.text)
        .join('\n\n'),
    })),
  });

  const [b] = await db.get(`books?id=eq.${bookId}&select=new_arrival_until`);
  await db.patch(`books?id=eq.${bookId}`, {
    current_revision_id: revId,
    status: 'live',
    new_arrival_until: b?.new_arrival_until ?? new Date(Date.now() + 30 * 864e5).toISOString(),
  });
  // Last: a book counts as sealed (and is kept on the next run) only once everything above is in.
  await db.patch(`book_revisions?id=eq.${revId}`, { sealed_generation: generation });

  // Drop older generations' files (the cover lives under src/, not here).
  const stale = (await bucket.list(`books/${revId}/`)).filter((k) => !k.startsWith(prefix));
  await pool(stale, 8, (k) => bucket.del(k));
  log(
    `book        ${book.title}: ${chapters.length} chapters, ${words} words, ${price} credits, ` +
      `free to ${preview.percent}%, ${Object.keys(sealed.files).length} files`,
  );
  return bookId;
}

async function ensureClub(db, authors, bookIds) {
  const id = fixedId('group:club');
  await db.upsert(
    'groups',
    [
      {
        id,
        kind: 'club',
        name: CLUB.name,
        description: CLUB.description,
        owner_id: authors.adaora,
        visibility: 'public',
        who_can_post: 'members',
        weekly_book_id: bookIds[CLUB.weekly.book],
        weekly_from_chapter: CLUB.weekly.from,
        weekly_to_chapter: CLUB.weekly.to,
        weekly_note: CLUB.weekly.note,
      },
    ],
    'id',
  );
  await db.upsert(
    'group_members',
    [
      { group_id: id, user_id: authors.adaora, role: 'owner' },
      { group_id: id, user_id: authors.kunle, role: 'member' },
    ],
    'group_id,user_id',
  );
}

async function ensureHome(db, authors, bookIds) {
  const sections = await db.get('home_sections?select=id,key&key=in.(trending,authors)');
  const sid = (k) => {
    const id = sections.find((s) => s.key === k)?.id;
    if (!id) throw new Error(`Home section "${k}" is missing (are the migrations applied?).`);
    return id;
  };
  await db.upsert(
    'shelf_items',
    BOOKS.map((b, position) => ({
      section_id: sid('trending'),
      item_type: 'book',
      item_id: bookIds[b.key],
      position,
    })),
    'section_id,item_type,item_id',
  );
  await db.upsert(
    'shelf_items',
    AUTHORS.map((a, position) => ({
      section_id: sid('authors'),
      item_type: 'author',
      item_id: authors[a.key],
      position,
    })),
    'section_id,item_type,item_id',
  );
  // Top 10 reads the latest hourly snapshot; take one now instead of waiting for the cron.
  await db.rpc('refresh_rankings', {});
}

export async function main(argv, { env = process.env, log = console.log } = {}) {
  const args = parseArgs(argv);
  const mode = guard(env, args);
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOK_MASTER_KEY } = requireEnv(env, [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BOOK_MASTER_KEY',
  ]);
  const masterKey = Uint8Array.from(Buffer.from(BOOK_MASTER_KEY, 'base64'));
  if (masterKey.length !== 32) throw new Error('BOOK_MASTER_KEY must be 32 bytes, base64.');
  log(`Sample content → ${mode} (${new URL(SUPABASE_URL).hostname})`);

  const db = supabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const convert = await loadConvert();
  const bucket = await booksBucket(mode, env);
  try {
    const authors = {};
    for (const a of AUTHORS) authors[a.key] = await ensureAuthor(db, a, log);
    const bookIds = {};
    for (const b of BOOKS)
      bookIds[b.key] = await ensureBook(
        db,
        bucket,
        convert,
        b,
        authors[b.author],
        masterKey,
        !!args.reseal,
        log,
      );
    await ensureClub(db, authors, bookIds);
    log(`club        ${CLUB.name}`);
    await ensureHome(db, authors, bookIds);
    log('home        Trending, Arpedia authors, New arrivals and Top 10 filled');
  } finally {
    await bucket.close();
  }
  log('Done.');
  return 0;
}

runIfMain(import.meta.url, main);
