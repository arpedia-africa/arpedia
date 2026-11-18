#!/usr/bin/env node
// Smoke test the staff desk end to end (flow 12 rules 20–22) with the real `tools/desk` CLI:
//   - an author's PDF goes to the desk; `desk login` as Operations admin, `desk pull --push` converts
//     it with pdftotext, runs epubcheck and pushes it, and it reaches chapter confirmation with the
//     chapters found by heading size and the pdf_source / low_structure_confidence flags
//   - a scanned PDF (no text layer) is sent back automatically with the plain message
//   - a Word file goes through pandoc to chapter confirmation; a broken one is sent back
//   node tools/smoke-desk.mjs   (needs `pnpm db:start`, `pnpm db:reset`, `pnpm dev:vars`, poppler's
//   pandoc, poppler's pdftotext and epubcheck on PATH, or --pandoc=, --pdftotext=, --epubcheck-jar=)
// Starts the api Worker in-process and stops it at the end.
import { execFile, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unstable_startWorker } from 'wrangler';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const [flag, name] of [
  ['--epubcheck-jar=', 'EPUBCHECK_JAR'],
  ['--pdftotext=', 'PDFTOTEXT'],
  ['--pandoc=', 'PANDOC'],
]) {
  const arg = process.argv.find((a) => a.startsWith(flag));
  if (arg) process.env[name] = arg.slice(flag.length);
}
const sb = Object.fromEntries(
  execSync('pnpm -s exec supabase status -o env', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!sb.API_URL) {
  console.error('Local Supabase is not running. Start it with `pnpm db:start`.');
  process.exit(1);
}

const persist = mkdtempSync(join(tmpdir(), 'arpedia-smoke-desk-'));
const deskHome = mkdtempSync(join(tmpdir(), 'arpedia-desk-home-'));
let worker;
const done = async (code) => {
  await worker?.dispose().catch(() => {});
  rmSync(persist, { recursive: true, force: true });
  rmSync(deskHome, { recursive: true, force: true });
  process.exit(code);
};
const fail = async (msg) => {
  console.error('FAIL', msg);
  await done(1);
};
const ok = (msg) => console.log('ok ', msg);

// ─── PDFs: pages of [size, x, y-from-bottom, text] ─────────────────────────
function makePdf(pages) {
  const objs = [];
  const add = (s) => (objs.push(s), objs.length);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesId = 1 + 1 + pages.length * 2;
  const kids = pages.map((lines) => {
    const ops = lines.length
      ? lines.map(([s, x, y, t]) => `BT /F1 ${s} Tf ${x} ${y} Td (${t}) Tj ET`).join('\n')
      : '0.5 g 72 72 468 648 re f'; // a scanned page: a picture, no text
    const c = add(`<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
    );
  });
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const vocab =
  'the river ran past the old market where traders called out prices for yams pepper and cloth while children chased a goat'.split(
    ' ',
  );
let seed = 11;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const line = () => Array.from({ length: 13 }, () => vocab[Math.floor(rand() * vocab.length)]).join(' ');
// Three chapters of four pages each; a running header and page numbers on every page.
const bookPages = [];
let pageNo = 0;
for (const title of ['Chapter One', 'Chapter Two', 'Chapter Three'])
  for (let p = 0; p < 4; p++) {
    const lines = [
      [9, 72, 760, 'Market Day'],
      [9, 300, 40, String(++pageNo)],
    ];
    let y = 700;
    if (p === 0) {
      lines.push([24, 72, y, title]);
      y -= 50;
    }
    for (; y > 80; y -= 15)
      lines.push([12, (y / 15) % 6 === 0 ? 90 : 72, y, y % 90 < 15 ? 'It was late.' : line()]);
    bookPages.push(lines);
  }
const textPdf = makePdf(bookPages);
const scannedPdf = makePdf([[], [], []]);

// A Word file with two "Heading 1" chapters and straight quotes; and one that is not a zip at all.
const { strToU8, zipSync } = createRequire(join(root, 'packages/convert/package.json'))('fflate');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const wp = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const docx = zipSync({
  '[Content_Types].xml': strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  ),
  '_rels/.rels': strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  ),
  'word/_rels/document.xml.rels': strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  ),
  'word/styles.xml': strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
  ),
  'word/document.xml': strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>` +
      ['The Market', 'The River']
        .map(
          (t) =>
            wp(t, 'Heading1') +
            wp(`"Come," she said -- "it's late..."`) +
            Array.from({ length: 40 }, () => wp(line())).join(''),
        )
        .join('') +
      wp('* * *') +
      wp('The end.') +
      '</w:body></w:document>',
  ),
});
const brokenDocx = Buffer.from('PK\u0003\u0004 this is not really a Word file');

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
const put = async (url, bytes) => {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Content-SHA256': createHash('sha256').update(bytes).digest('hex') },
    body: bytes,
  });
  if (!res.ok) await fail(`PUT ${res.status} ${await res.text()}`);
};
const rest = async (path) => {
  const res = await fetch(`${sb.API_URL}/rest/v1/${path}`, {
    headers: { apikey: sb.SERVICE_ROLE_KEY, Authorization: `Bearer ${sb.SERVICE_ROLE_KEY}` },
  });
  return res.json();
};
const toDesk = async (jwt, title, bytes, type = 'pdf') => {
  const up = await call(jwt, 'POST', '/upload', {
    meta: { source_type: type, title, description: 'A file for the desk smoke test.', language: 'en' },
  });
  await put(up.uploads.source, bytes);
  const fin = await call(jwt, 'POST', '/finalize', {
    revision_id: up.revision_id,
    converted: false,
    ...(type === 'pdf' ? {} : { reason: 'conversion_failed' }),
  });
  if (fin.status !== 'with_desk') await fail(`${title}: finalize ${JSON.stringify(fin)}`);
  return up.revision_id;
};
/** Run the desk CLI; the Worker runs in this process, so the CLI must not block the event loop. */
const run = (...args) =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(root, 'tools/desk/bin/desk.mjs'), ...args],
      {
        cwd: root,
        env: {
          ...process.env,
          ARPEDIA_DESK_HOME: deskHome,
          ARPEDIA_DESK_PASSWORD: 'arpedia-local',
          ARPEDIA_SUPABASE_URL: sb.API_URL,
          ARPEDIA_SUPABASE_ANON_KEY: sb.ANON_KEY,
          ARPEDIA_API_URL: api,
        },
      },
      (err, out, errOut) => resolve({ ok: !err, out: String(out), err: String(errOut) }),
    );
  });
const desk = async (...args) => {
  const r = await run(...args);
  if (!r.ok) await fail(`desk ${args.join(' ')}: ${r.err || r.out}`);
  return r.out;
};
const waitFor = async (jwt, rev, want, label) => {
  for (let i = 0; i < 60; i++) {
    const s = await call(jwt, 'GET', `/status/${rev}`);
    if (want(s)) return s;
    if (['sent_back', 'rejected', 'with_desk'].includes(s.status) && !want(s))
      await fail(`${label}: revision went to ${s.status} (${s.desk_reason ?? s.sent_back_note ?? ''})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  await fail(`${label}: timed out`);
};

// ─── Run ───────────────────────────────────────────────────────────────────
worker = await unstable_startWorker({
  config: join(root, 'workers/api/wrangler.jsonc'),
  dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, watch: false, persist },
});
api = (await worker.url).origin;
ok(`api Worker on ${api}`);
const tolu = await signIn('tolu@example.com');

const refused = await run('login', '--email', 'ngozi@example.com');
if (refused.ok || !refused.err.includes('not on the desk'))
  await fail(`reader login: ${refused.out}${refused.err}`);
ok('desk login refuses a reader');

const login = await desk('login', '--email', 'femi@arpedia.africa');
if (!login.includes('Signed in')) await fail(`login: ${login}`);
ok('desk login as Operations admin');

// A text PDF: converted, checked, pushed, verified → chapter confirmation.
const rev = await toDesk(tolu, 'Desk PDF', textPdf);
const pulled = await desk('pull', '--revision', rev, '--push');
if (!/Converted Desk PDF: 3 headings, 0 epubcheck error/.test(pulled) || !pulled.includes('Pushed'))
  await fail(`pull --push: ${pulled}`);
ok('desk pull --push: 3 headings, epubcheck clean, pushed');
const twice = await run('push', rev);
if (twice.ok || !twice.err.includes('already pushed')) await fail(`second push: ${twice.out}${twice.err}`);
const checked = await waitFor(tolu, rev, (s) => s.draft_step === 'chapters', 'desk verify');
const keys = checked.flags.map((f) => f.check_key);
if (!keys.includes('pdf_source') || !keys.includes('low_structure_confidence'))
  await fail(`PDF flags: ${keys}`);
const chapters = await rest(`chapters?revision_id=eq.${rev}&select=title,words&order=ord`);
const titles = chapters.map((c) => c.title);
if (titles.join('|') !== 'Chapter One|Chapter Two|Chapter Three')
  await fail(`chapters: ${JSON.stringify(chapters)}`);
const body = (await rest(`chapters?revision_id=eq.${rev}&select=words`)).reduce((a, c) => a + c.words, 0);
if (body < 1500) await fail(`only ${body} words came through`);
ok(`verified → chapters ready: ${titles.join(', ')} (${body} words; ${keys.join(', ')})`);

// A scanned PDF: sent back automatically with the plain message.
const scan = await toDesk(tolu, 'Desk Scan', scannedPdf);
const scanned = await desk('pull', '--revision', scan);
if (!scanned.includes('Sent back automatically')) await fail(`scanned pull: ${scanned}`);
const back = await waitFor(tolu, scan, (s) => s.status === 'sent_back', 'scanned');
if (back.sent_back_note !== 'We could not read this file. Please send the Word version.')
  await fail(`scanned note: ${back.sent_back_note}`);
ok('scanned PDF sent back automatically: "We could not read this file. Please send the Word version."');

// Word through pandoc: "Heading 1" paragraphs become chapters.
const word = await toDesk(tolu, 'Desk Word', docx, 'docx');
const wordOut = await desk('pull', '--revision', word, '--push');
if (!/Converted Desk Word: 2 headings, 0 epubcheck error/.test(wordOut)) await fail(`docx pull: ${wordOut}`);
await waitFor(tolu, word, (s) => s.draft_step === 'chapters', 'docx verify');
const wordChapters = await rest(`chapters?revision_id=eq.${word}&select=title&order=ord`);
if (wordChapters.map((c) => c.title).join('|') !== 'The Market|The River')
  await fail(`docx chapters: ${JSON.stringify(wordChapters)}`);
ok('Word file through pandoc → chapters ready: The Market, The River');

// A broken Word file goes back automatically too.
const broken = await toDesk(tolu, 'Desk Broken', brokenDocx, 'docx');
const brokenOut = await desk('pull', '--revision', broken);
if (!brokenOut.includes('Sent back automatically')) await fail(`broken docx: ${brokenOut}`);
await waitFor(tolu, broken, (s) => s.status === 'sent_back', 'broken docx');
ok('broken Word file sent back automatically');

console.log('PASS smoke-desk');
await done(0);
