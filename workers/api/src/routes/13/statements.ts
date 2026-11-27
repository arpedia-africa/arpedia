// Flow 13 · statements (rules 26–27).
//   GET  /v1/earnings/statements/:id/download   staff (Finance, Support, Super admin) or the author:
//        the PDF, when statement_download_key allows it (authors: their cycle once paid, and YTD)
//   POST /v1/earnings/statements/year-to-date    {author_id?}: the author (or Finance / Support for an
//        author) gets a year-to-date PDF made now; answers {id}, then download it like any other
// Cron: statementsAfterRelease renders one PDF per author for every cycle whose run is done, to R2
// under statements/<author>/, and records it (record_statement returns the same row on a re-run).
import type { Database } from '@arpedia/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireUser } from '../../auth';
import { serviceDb } from '../../db';
import type { AppEnv, Env } from '../../env';
import { rpcError, userDb } from '../12/http';
import { buildPdf, fit, PAGE_H, type PdfLine } from './pdf';

type Db = SupabaseClient<Database>;

export interface CycleSource {
  kind: 'cycle';
  author_id: string;
  cycle_id: string;
  month: string;
  payout_date: string | null;
  pen_name: string | null;
  legal_name: string | null;
  rate_kobo: number;
  books: { title: string; credits: number; kobo: number }[];
  tips_credits: number;
  tips_kobo: number;
  excluded_credits: number;
  amount_kobo: number;
  carry_in_kobo: number;
  adjustment_kobo: number;
  payable_kobo: number;
  status: string;
  held_reason: string | null;
  carried: boolean;
  payout: { reference: string; status: string; settled_at: string | null } | null;
}

export interface YtdSource {
  kind: 'year_to_date';
  author_id: string;
  year: number;
  pen_name: string | null;
  legal_name: string | null;
  months: {
    month: string;
    payout_date: string | null;
    amount_kobo: number;
    payable_kobo: number;
    status: string;
    paid_kobo: number;
  }[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;
const day = (d: string | null) => {
  if (!d) return '-';
  const [y, m, dd] = d.slice(0, 10).split('-');
  return `${Number(dd)} ${MONTHS[Number(m) - 1]?.slice(0, 3)} ${y}`;
};

/** "NGN 1,234.56" (the standard PDF fonts have no naira sign). */
export function ngn(kobo: number): string {
  const neg = kobo < 0;
  const a = Math.abs(Math.round(kobo));
  const naira = Math.floor(a / 100).toLocaleString('en-NG');
  return `${neg ? '-' : ''}NGN ${naira}.${String(a % 100).padStart(2, '0')}`;
}
const num = (n: number) => n.toLocaleString('en-NG');

const STATUS: Record<string, string> = {
  paid: 'Paid',
  queued: 'Sending',
  payable: 'Ready to send',
  partly_failed: 'Transfer failed, will be retried',
  carried: 'Below the minimum, carried to next month',
  held_unverified: 'Held: bank account not verified',
  held_paused: 'Held: payouts paused',
  held_dispute: 'Held',
};

const L = 48;
const R = 547;
const BOTTOM = PAGE_H - 60;

/** Lays out rows on pages, starting a new page when one is full. */
class Pages {
  pages: PdfLine[][] = [[]];
  y = 56;
  constructor(private readonly footer: string) {}
  private get page() {
    return this.pages[this.pages.length - 1]!;
  }
  need(h: number) {
    if (this.y + h > BOTTOM) {
      this.pages.push([]);
      this.y = 56;
    }
  }
  add(line: Omit<PdfLine, 'y'>, dy = 0) {
    this.page.push({ ...line, y: this.y + dy });
  }
  gap(h: number) {
    this.y += h;
  }
  row(label: string, value: string, opts: { bold?: boolean; size?: number } = {}) {
    const size = opts.size ?? 10;
    this.need(size + 8);
    this.add({ x: L, text: fit(label, size, 360, opts.bold), size, bold: opts.bold });
    this.add({ x: R, text: value, size, bold: opts.bold, right: true });
    this.gap(size + 8);
  }
  done(): PdfLine[][] {
    const n = this.pages.length;
    this.pages.forEach((p, i) => {
      p.push({ x: L, y: PAGE_H - 36, text: this.footer, size: 8 });
      p.push({ x: R, y: PAGE_H - 36, text: `Page ${i + 1} of ${n}`, size: 8, right: true });
    });
    return this.pages;
  }
}

function header(p: Pages, title: string, src: { pen_name: string | null; legal_name: string | null }) {
  p.add({ x: L, text: 'Arpedia', size: 11, bold: true });
  p.add({ x: R, text: 'Author statement', size: 11, right: true });
  p.gap(34);
  p.add({ x: L, text: title, size: 20, bold: true });
  p.gap(24);
  const who = [src.pen_name, src.legal_name && src.legal_name !== src.pen_name ? src.legal_name : null]
    .filter(Boolean)
    .join(' · ');
  p.add({ x: L, text: fit(who || 'Author', 11, R - L), size: 11 });
  p.gap(30);
}

function section(p: Pages, title: string) {
  p.need(40);
  p.gap(6);
  p.add({ x: L, text: title, size: 12, bold: true });
  p.gap(20);
}

/** The cycle statement (rule 26): credits by book, tips and messages, rate, exclusions, carried, reference. */
export function cycleStatementPdf(s: CycleSource): Uint8Array {
  const title = `${monthName(s.month)} statement`;
  const p = new Pages(`Arpedia author statement · ${monthName(s.month)} · authors@arpedia.africa`);
  header(p, title, s);
  p.row('Rate', `${ngn(s.rate_kobo)} per credit`);
  p.row('Payout date', day(s.payout_date));
  section(p, 'Credits by book');
  if (!s.books.length) p.row('No book credits this month', '-');
  for (const b of s.books) p.row(`${b.title} (${num(b.credits)} credits)`, ngn(b.kobo));
  p.row(`Tips and messages (${num(s.tips_credits)} credits)`, ngn(s.tips_kobo));
  section(p, 'This month');
  p.row('Earned this month', ngn(s.amount_kobo), { bold: true });
  if (s.excluded_credits) p.row(`Not paid (${num(s.excluded_credits)} credits excluded)`, 'Not counted');
  p.row('Carried in from earlier months', ngn(s.carry_in_kobo));
  p.row('Adjustments', ngn(s.adjustment_kobo));
  p.row('To pay', ngn(s.payable_kobo), { bold: true, size: 12 });
  section(p, 'Payout');
  const status = s.carried
    ? 'Carried to next month'
    : (STATUS[s.payout?.status === 'successful' ? 'paid' : s.status] ?? s.status);
  p.row('Status', status);
  if (s.held_reason && s.status.startsWith('held')) p.row('Reason', s.held_reason);
  if (s.payout) {
    p.row('Payout reference', s.payout.reference);
    if (s.payout.settled_at) p.row('Settled', day(s.payout.settled_at));
  }
  return buildPdf(p.done(), title);
}

/** The year-to-date statement (rule 27): each closed month and the totals. */
export function ytdStatementPdf(s: YtdSource, today = new Date()): Uint8Array {
  const title = `${s.year} year to date`;
  const p = new Pages(`Arpedia author statement · ${title} · made ${day(today.toISOString())}`);
  header(p, title, s);
  section(p, 'By month');
  if (!s.months.length) p.row('No closed months yet this year', '-');
  for (const m of s.months)
    p.row(`${monthName(m.month)} · ${STATUS[m.status] ?? m.status}`, ngn(m.amount_kobo));
  section(p, 'Totals');
  p.row('Earned', ngn(s.months.reduce((a, m) => a + m.amount_kobo, 0)), { bold: true });
  p.row('Paid to your bank', ngn(s.months.reduce((a, m) => a + m.paid_kobo, 0)), { bold: true });
  return buildPdf(p.done(), title);
}

export const statementKey = (author: string, cycle: string) => `statements/${author}/${cycle}.pdf`;
export const ytdKey = (author: string, year: number, at: Date) =>
  `statements/${author}/ytd-${year}-${at.toISOString().replace(/[-:.]/g, '').slice(0, 15)}.pdf`;

/** One cycle statement: render, store, record. False when there is nothing to render. */
export async function generateStatement(env: Env, db: Db, author: string, cycle: string): Promise<boolean> {
  const { data, error } = await db.rpc('statement_source', { p_author: author, p_cycle: cycle });
  if (error) throw new Error(error.message);
  if (!data) return false;
  const key = statementKey(author, cycle);
  await env.BOOKS.put(key, cycleStatementPdf(data as unknown as CycleSource), {
    httpMetadata: { contentType: 'application/pdf' },
  });
  const { error: re } = await db.rpc('record_statement', {
    p_author: author,
    p_cycle: cycle,
    p_kind: 'cycle',
    p_file_key: key,
  });
  if (re) throw new Error(re.message);
  return true;
}

/** Cron (statements_after_release): statements for released cycles, a few at a time. */
export async function statementsAfterRelease(env: Env, db: Db = serviceDb(env)): Promise<number> {
  const { data, error } = await db.rpc('statements_due', { p_limit: 20 });
  if (error) {
    console.error('statements_due', error.message);
    return 0;
  }
  let made = 0;
  for (const r of data ?? []) {
    try {
      if (await generateStatement(env, db, r.author_id, r.cycle_id)) made++;
    } catch (e) {
      console.error('statement failed', r.author_id, r.cycle_id, e);
    }
  }
  return made;
}

const statements = new Hono<AppEnv>();

statements.get('/:id/download', requireUser, async (c) => {
  const id = c.req.param('id');
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404);
  const { data: key, error } = await userDb(c).rpc('statement_download_key', { p_id: id });
  if (error) return error.message === 'not_found' ? c.json({ error: 'not_found' }, 404) : rpcError(c, error);
  const obj = key ? await c.env.BOOKS.get(key) : null;
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const name = key!.includes('/ytd-') ? 'arpedia-statement-year-to-date.pdf' : 'arpedia-statement.pdf';
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

statements.post('/year-to-date', requireUser, async (c) => {
  const body = z.object({ author_id: z.uuid().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'bad_request' }, 400);
  const author = body.data.author_id ?? c.var.user.sub;
  const { data: ok, error } = await userDb(c).rpc('can_request_statement', { p_author: author });
  if (error) return rpcError(c, error);
  if (!ok) return c.json({ error: 'forbidden' }, 403);
  const db = serviceDb(c.env);
  const { data: src, error: se } = await db.rpc('statement_ytd_source', { p_author: author });
  if (se) return rpcError(c, se);
  if (!src) return c.json({ error: 'not_found' }, 404);
  const now = new Date();
  const s = src as unknown as YtdSource;
  const key = ytdKey(author, s.year, now);
  await c.env.BOOKS.put(key, ytdStatementPdf(s, now), { httpMetadata: { contentType: 'application/pdf' } });
  const { data: id, error: re } = await db.rpc('record_statement', {
    p_author: author,
    p_cycle: null as unknown as string,
    p_kind: 'year_to_date',
    p_file_key: key,
  });
  if (re) return rpcError(c, re);
  return c.json({ id });
});

export default statements;
