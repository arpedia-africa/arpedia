#!/usr/bin/env node
// Staff and set-up steps between the flow 17 Maestro journeys (tools/journeys/run.mjs). Staff steps sign
// in as the seeded staff user (two-step with the seeded TOTP) and call the same RPCs and api Worker
// endpoints the admin console calls. Reads use the local database directly (read-only checks).
//   node tools/journeys/staff.mjs book-files                  generate the journey EPUB, push it and a cover
//   node tools/journeys/staff.mjs approve-author <email>      Publisher approves the open application
//   node tools/journeys/staff.mjs publish-book <email>        Publisher reviews the author's submitted book
//                                                             (dismisses open flags, releases) and publishes
//   node tools/journeys/staff.mjs check-report <email>        the reader's report and block are stored
//   node tools/journeys/staff.mjs check-deleted <email>       the reader's account is deleted (signed out)
// Values later Maestro steps need (the book's price and the author's naira) go to .shots/journeys/vars.json.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { localEnv, staffSession } from '../staff-session.mjs';

const root = resolve(import.meta.dirname, '../..');
const serial = process.env.ANDROID_SERIAL ?? 'emulator-5554';
const varsFile = join(root, '.shots/journeys/vars.json');
const PUBLISHER = 'tunde@arpedia.africa';
const env = localEnv();
const devVars = Object.fromEntries(
  readFileSync(join(root, 'workers/api/.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const api = `http://127.0.0.1:${devVars.API_PORT ?? 8787}`;

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One SQL value from the local database (read-only checks and lookups). */
function sql(query) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_arpedia', 'psql', '-U', 'postgres', '-At'], {
    input: query,
    encoding: 'utf8',
  }).trim();
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const userId = (email) =>
  sql(`select id from auth.users where email = ${q(email)}`) || fail(`no user ${email}`);

async function rpc(jwt, name, body) {
  const r = await fetch(`${env.API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) fail(`${name} ${r.status} ${JSON.stringify(json)}`);
  return json;
}
async function books(jwt, method, path, body) {
  const r = await fetch(`${api}/v1/books${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) fail(`${method} /v1/books${path} ${r.status} ${JSON.stringify(json)}`);
  return json;
}
const adb = (...a) => execFileSync('adb', ['-s', serial, ...a], { encoding: 'utf8' });

// ─── Commands ──────────────────────────────────────────────────────────────
const commands = {
  /** A clean 6-chapter EPUB (every chapter titled) and a portrait cover, in the phone's Download folder. */
  async 'book-files'() {
    const { strToU8, zipSync } = createRequire(join(root, 'packages/convert/package.json'))('fflate');
    const words = (
      'the harmattan wind carried red dust over the market where traders called out prices for yams ' +
      'pepper and cloth while children chased a goat between the stalls and an old woman laughed'
    ).split(' ');
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const sentence = () => {
      const w = Array.from({ length: 12 }, () => words[Math.floor(rand() * words.length)]);
      return w[0][0].toUpperCase() + w.join(' ').slice(1) + '.';
    };
    const para = () => `<p>${Array.from({ length: 8 }, sentence).join(' ')}</p>`;
    const titles = ['Dust', 'The Stall', 'Market Day', 'Lamps', 'The Road Home', 'Morning'];
    const chapter = (t) =>
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${t}</title></head>` +
      `<body><h1>${t}</h1>${Array.from({ length: 30 }, para).join('')}</body></html>`;
    const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:journey</dc:identifier><dc:title>Red Dust Market</dc:title><dc:language>en</dc:language></metadata>
<manifest>${titles.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine>${titles.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`;
    const epub = zipSync({
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(
        '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      ),
      'OEBPS/content.opf': strToU8(opf),
      ...Object.fromEntries(titles.map((t, i) => [`OEBPS/c${i}.xhtml`, strToU8(chapter(t))])),
    });
    const dir = join(root, '.shots/journeys');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'journey-book.epub'), epub);
    adb('push', join(dir, 'journey-book.epub'), '/sdcard/Download/journey-book.epub');
    adb('push', join(root, 'tools/journeys/cover.png'), '/sdcard/Pictures/journey-cover.png');
    adb('shell', 'content call --method scan_volume --uri content://media --arg external_primary');
    console.log('✓ journey-book.epub and journey-cover.png on the phone');
  },

  async 'approve-author'(email) {
    const app = sql(
      `select id from public.author_applications where user_id = ${q(userId(email))} and status = 'new' ` +
        `order by created_at desc limit 1`,
    );
    if (!app) fail(`no open application for ${email}`);
    const staff = await staffSession(env, PUBLISHER);
    await rpc(staff.access_token, 'decide_application', { p_app: app, p_decision: 'approve' });
    console.log(`✓ ${PUBLISHER} approved ${email}'s application`);
  },

  async 'publish-book'(email) {
    const author = userId(email);
    let rev = '';
    let status = '';
    // Sealing runs on the queue after submit; wait for it to route the revision.
    for (let i = 0; i < 120 && !['needs_fixes', 'ready_for_review'].includes(status); i++) {
      if (i) await sleep(2000);
      [rev, status] = sql(
        `select r.id || '|' || r.status from public.book_revisions r join public.books b on b.id = r.book_id ` +
          `where b.author_id = ${q(author)} order by r.created_at desc limit 1`,
      ).split('|');
      if (['sent_back', 'with_desk', 'rejected'].includes(status)) fail(`revision went to ${status}`);
    }
    if (!['needs_fixes', 'ready_for_review'].includes(status)) fail(`revision stuck at ${status || 'none'}`);
    const staff = (await staffSession(env, PUBLISHER)).access_token;
    if (status === 'needs_fixes') {
      let s = await books(staff, 'GET', `/status/${rev}`);
      let version = Number(sql(`select work_version from public.book_revisions where id = ${q(rev)}`));
      for (const f of s.flags) {
        const r = await books(staff, 'POST', '/fix', {
          revision_id: rev,
          flag_id: f.id,
          op: { op: 'dismiss_flag', reason: 'Whole-app journey: reviewed' },
          expected_version: version,
        });
        version = r.work_version;
      }
      s = await books(staff, 'POST', '/release', { revision_id: rev });
      if (s.status !== 'ready_for_review') fail(`release left ${s.status}`);
    }
    const pub = await rpc(staff, 'publish_revision', { p_rev: rev });
    if (pub?.status !== 'live') fail(`publish ${JSON.stringify(pub)}`);
    const [bookId, title, price] = sql(
      `select b.id || '|' || b.title || '|' || coalesce(b.price_override_credits, r.price_credits, 0) ` +
        `from public.books b ` +
        `join public.book_revisions r on r.book_id = b.id where r.id = ${q(rev)}`,
    ).split('|');
    const vars = { BOOK_ID: bookId, PRICE: price, NAIRA: naira(Number(price) * 160) };
    writeFileSync(varsFile, JSON.stringify(vars, null, 2));
    console.log(`✓ ${PUBLISHER} published "${title}" (${price} credits): ${JSON.stringify(vars)}`);
  },

  /** Pay as you read: one chapter charge was undone (credits back, author earning taken back). */
  async 'check-undo'(email) {
    const rows = sql(
      `select count(*) filter (where reason = 'undo') || '|' || count(*) filter (where reason = 'chapter') ` +
        `from public.credit_ledger where user_id = ${q(userId(email))} ` +
        `and created_at > ${q(process.env.JOURNEY_START ?? new Date(Date.now() - 3600_000).toISOString())}`,
    ).split('|');
    if (rows[0] === '0') fail(`${email}: no undo row in the ledger`);
    if (Number(rows[1]) < 2)
      fail(`${email}: expected the charge and the charge after the undo, got ${rows[1]}`);
    console.log(`✓ ${email}: ${rows[0]} undo, ${rows[1]} chapter charges`);
  },

  async 'check-report'(email) {
    const me = userId(email);
    // Seeded reports and blocks are older than the journey (run.mjs sets JOURNEY_START after the reset).
    const recent = `created_at > ${q(process.env.JOURNEY_START ?? new Date(Date.now() - 3600_000).toISOString())}`;
    const reports = Number(
      sql(`select count(*) from public.reports where reporter_id = ${q(me)} and ${recent}`),
    );
    const blocks = Number(
      sql(`select count(*) from public.user_blocks where blocker_id = ${q(me)} and ${recent}`),
    );
    if (!reports) fail(`no report stored for ${email}`);
    if (!blocks) fail(`no block stored for ${email}`);
    console.log(`✓ ${email}: ${reports} report(s), ${blocks} block(s) stored`);
  },

  async 'check-deleted'(email) {
    const me = userId(email);
    const row = sql(
      `select p.deletion_requested_at is not null, d.status from public.profiles p ` +
        `left join public.account_deletions d on d.user_id = p.id where p.id = ${q(me)} ` +
        `order by d.requested_at desc limit 1`,
    );
    if (!row.startsWith('t|')) fail(`${email}: no deletion recorded (${row})`);
    const sessions = Number(sql(`select count(*) from auth.sessions where user_id = ${q(me)}`));
    if (sessions) fail(`${email} still has ${sessions} session(s) after deleting the account`);
    // Banned for good, as a finite time GoTrue can read ('infinity' made its sign-in answer a 500).
    if (
      sql(`select banned_until > now() + interval '1000 years' from auth.users where id = ${q(me)}`) !== 't'
    )
      fail(`${email} can still sign in after deleting the account`);
    const sent = Number(
      sql(
        `select count(*) from public.email_sends where user_id = ${q(me)} and template_key = 'data_export_ready'`,
      ),
    );
    if (!sent) fail(`${email}: no data export email was sent`);
    console.log(`✓ ${email}: deletion ${row.split('|')[1]}, signed out everywhere, export emailed`);
  },
};

/** Naira as the app shows it (packages/core formatKobo, without the ₦): 80, 81.60, 1,600. */
function naira(kobo) {
  const n = kobo / 100;
  return n.toLocaleString('en-NG', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

const [cmd, ...rest] = process.argv.slice(2);
if (!commands[cmd]) fail(`usage: node tools/journeys/staff.mjs <${Object.keys(commands).join('|')}> …`);
await commands[cmd](...rest);
