// Converting a desk job on the staff computer (docs/prd/12-book-pipeline.md rule 21): Word and
// EPUB through pandoc, PDF through poppler's pdftotext and the layout heuristics in pdf.ts. All
// three go through the same normaliser, sanitiser and EPUB3 writer as the phone, then epubcheck.
import { normalizeHtml, sanitizeHtml, imageType, writeEpub } from '@arpedia/convert';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pdfToHtml, parseBbox, SCANNED_CHARS_PER_PAGE, textPerPage } from './pdf';
import { reportFlags, type DeskFlag, type EpubcheckReport } from './report';

export type SourceType = 'docx' | 'epub' | 'pdf';
export interface ConvertMeta {
  revisionId: string;
  title: string;
  language?: string;
}
export type ConvertResult =
  | { ok: true; epubPath: string; reportPath: string; chapters: number; flags: DeskFlag[] }
  /** The file can't be read (scanned, corrupt or password-protected): send it back automatically. */
  | { ok: false; reason: 'scanned' | 'unreadable'; detail: string };

export class ToolMissing extends Error {}

const INSTALL: Record<string, string> = {
  pandoc: 'Install pandoc (https://pandoc.org/installing.html) to convert Word and EPUB files.',
  pdftotext: "Install poppler (pdftotext) to convert PDF files, or set PDFTOTEXT to poppler's pdftotext.",
  java: 'Install Java 11 or later to run epubcheck.',
  epubcheck: 'Install epubcheck (https://www.w3.org/publishing/epubcheck/) or set EPUBCHECK_JAR.',
};

/** Run a tool without blocking, so the lease heartbeat keeps going during long conversions. */
function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 64 * 1024) stderr += d.toString('utf8');
    });
    const name = basename(cmd).replace(/\.exe$/i, '');
    child.on('error', (err: NodeJS.ErrnoException) =>
      fail(err.code === 'ENOENT' ? new ToolMissing(INSTALL[name] ?? `Install ${name}.`) : err),
    );
    child.on('close', (code) => done({ code: code ?? 1, stderr: stderr.trim() }));
  });
}

/**
 * Exit codes that mean the file itself can't be read, so it goes back to the author. Any other
 * failure is a problem on this computer (wrong tool, bad option) and must never send a book back.
 * pdftotext: 1 can't open the PDF (corrupt or password), 3 permissions. pandoc: 44 XML, 63 other
 * (a broken docx container), 64 parse error, 92–94 text decoding.
 */
const UNREADABLE = { pdftotext: [1, 3], pandoc: [44, 63, 64, 92, 93, 94] };
const tool = (name: 'pdftotext' | 'pandoc') => process.env[name.toUpperCase()] ?? name;

class ToolFailed extends Error {}
const toolFailed = (name: string, r: { code: number; stderr: string }, hint = '') =>
  new ToolFailed(`${name} failed (exit ${r.code})${hint}: ${r.stderr.split('\n').slice(0, 3).join(' ')}`);

/** Book HTML from the source file, or why it can't be read. */
async function sourceHtml(dir: string, source: string, type: SourceType) {
  if (type === 'pdf') {
    const r = await run(tool('pdftotext'), ['-enc', 'UTF-8', '-bbox-layout', source, 'layout.html'], dir);
    if (UNREADABLE.pdftotext.includes(r.code))
      return {
        ok: false as const,
        reason: 'unreadable' as const,
        detail: r.stderr || `pdftotext exit ${r.code}`,
      };
    if (r.code !== 0)
      throw toolFailed(
        'pdftotext',
        r,
        ". It must be poppler's pdftotext (xpdf's has no -bbox-layout); set PDFTOTEXT",
      );
    const pages = parseBbox(readFileSync(join(dir, 'layout.html'), 'utf8'));
    const perPage = textPerPage(pages);
    if (perPage < SCANNED_CHARS_PER_PAGE)
      return {
        ok: false as const,
        reason: 'scanned' as const,
        detail: `${Math.round(perPage)} characters a page over ${pages.length} pages: no text layer`,
      };
    return { ok: true as const, html: pdfToHtml(pages) };
  }
  const r = await run(
    tool('pandoc'),
    ['-f', type, '-t', 'html5', '--wrap=none', '--extract-media=.', '-o', 'body.html', source],
    dir,
  );
  if (UNREADABLE.pandoc.includes(r.code))
    return { ok: false as const, reason: 'unreadable' as const, detail: r.stderr || `pandoc exit ${r.code}` };
  if (r.code !== 0) throw toolFailed('pandoc', r);
  return { ok: true as const, html: readFileSync(join(dir, 'body.html'), 'utf8') };
}

/** Images the converter extracted, re-checked by magic bytes and renamed `img/<n>.<ext>`. */
function collectImages(dir: string) {
  const images: Record<string, Uint8Array> = {};
  const byPath = new Map<string, string>();
  const map = (src: string) => {
    const file = resolve(dir, decodeURIComponent(src));
    const rel = relative(dir, file);
    if (rel.startsWith('..') || !existsSync(file)) return null;
    const known = byPath.get(rel);
    if (known) return known;
    const bytes = new Uint8Array(readFileSync(file));
    const type = imageType(bytes);
    if (!type) return null;
    const path = `img/${byPath.size + 1}.${type === 'jpeg' ? 'jpg' : type}`;
    byPath.set(rel, path);
    images[path] = bytes;
    return path;
  };
  return { images, map };
}

async function epubcheck(dir: string, epub: string, report: string) {
  const jar = process.env.EPUBCHECK_JAR;
  const r = jar
    ? await run('java', ['-jar', jar, epub, '--json', report], dir)
    : await run('epubcheck', [epub, '--json', report], dir);
  if (!existsSync(join(dir, report)))
    throw new Error(`epubcheck did not write a report (exit ${r.code}): ${r.stderr.slice(0, 500)}`);
  return JSON.parse(readFileSync(join(dir, report), 'utf8')) as EpubcheckReport;
}

/** Convert `source` (inside `dir`) to `converted.epub`, check it, and save `epubcheck.json`. */
export async function convertJob(
  dir: string,
  source: string,
  type: SourceType,
  meta: ConvertMeta,
): Promise<ConvertResult> {
  const got = await sourceHtml(dir, source, type);
  if (!got.ok) return got;
  const { images, map } = collectImages(dir);
  const html = sanitizeHtml(normalizeHtml(got.html), { image: map }).html;
  if (!html.replace(/<[^>]*>/g, '').trim())
    return { ok: false, reason: 'unreadable', detail: 'the converter found no text' };
  const epub = writeEpub({
    title: meta.title,
    language: meta.language ?? 'en',
    identifier: `urn:uuid:${meta.revisionId}`,
    html,
    images,
  });
  writeFileSync(join(dir, 'converted.epub'), epub);
  const report = await epubcheck(dir, 'converted.epub', 'epubcheck.json');
  return {
    ok: true,
    epubPath: join(dir, 'converted.epub'),
    reportPath: join(dir, 'epubcheck.json'),
    chapters: (html.match(/<h1[\s>]/g) ?? []).length,
    flags: reportFlags(report),
  };
}
