import { describe, expect, it } from 'vitest';
import type { Env } from '../../env';
import { buildPdf, fit, textWidth } from './pdf';
import {
  cycleStatementPdf,
  ngn,
  statementKey,
  statementsAfterRelease,
  ytdStatementPdf,
  type CycleSource,
  type YtdSource,
} from './statements';

const text = (b: Uint8Array) => String.fromCharCode(...b);

const cycle: CycleSource = {
  kind: 'cycle',
  author_id: 'a1',
  cycle_id: 'c1',
  month: '2026-10',
  payout_date: '2026-12-15',
  pen_name: 'Ada',
  legal_name: 'Adaeze Okafor',
  rate_kobo: 160,
  books: [
    { title: 'The River (Part 1)', credits: 1000, kobo: 160000 },
    { title: 'Small Hours', credits: 25, kobo: 4000 },
  ],
  tips_credits: 50,
  tips_kobo: 8000,
  excluded_credits: 20,
  amount_kobo: 172000,
  carry_in_kobo: 60000,
  adjustment_kobo: -1600,
  payable_kobo: 230400,
  status: 'paid',
  held_reason: null,
  carried: false,
  payout: { reference: 'ARP-PO-202610-a1-1', status: 'successful', settled_at: '2026-12-15T10:00:00Z' },
};

describe('pdf writer', () => {
  it('writes a PDF whose xref offsets point at each object', () => {
    const pdf = text(buildPdf([[{ x: 10, y: 20, text: 'Hello (world) \\ ok' }], []], 'Test'));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe('xref');
    const entries = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(pdf.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('(Hello \\(world\\) \\\\ ok) Tj');
  });

  it('stream lengths match their content', () => {
    const pdf = text(buildPdf([[{ x: 10, y: 20, text: 'Naira ₦ and é' }]]));
    const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf)!;
    expect(m[2]!.length).toBe(Number(m[1]));
    expect(m[2]).toContain('(Naira ? and \xe9)');
  });

  it('cuts long text to fit', () => {
    const long = 'A very long book title that will never fit on one statement line at all';
    const cut = fit(long, 10, 120);
    expect(cut.endsWith('...')).toBe(true);
    expect(textWidth(cut, 10)).toBeLessThanOrEqual(120);
    expect(fit('Short', 10, 120)).toBe('Short');
  });
});

describe('statements', () => {
  it('formats money as NGN with kobo', () => {
    expect(ngn(160)).toBe('NGN 1.60');
    expect(ngn(230400)).toBe('NGN 2,304.00');
    expect(ngn(-1600)).toBe('-NGN 16.00');
  });

  it('cycle statement shows books, tips, rate, exclusions, carried, reference', () => {
    const pdf = text(cycleStatementPdf(cycle));
    for (const s of [
      'October 2026 statement',
      'Ada \xb7 Adaeze Okafor',
      'NGN 1.60 per credit',
      '15 Dec 2026',
      'The River \\(Part 1\\) \\(1,000 credits\\)',
      'Tips and messages \\(50 credits\\)',
      '20 credits excluded',
      'NGN 600.00',
      '-NGN 16.00',
      'NGN 2,304.00',
      'Paid',
      'ARP-PO-202610-a1-1',
    ])
      expect(pdf).toContain(s);
  });

  it('a long list of books runs onto more pages', () => {
    const books = Array.from({ length: 80 }, (_, i) => ({ title: `Book ${i + 1}`, credits: 10, kobo: 1600 }));
    const pdf = text(cycleStatementPdf({ ...cycle, books }));
    expect(pdf).toMatch(/\/Count [2-9]/);
    expect(pdf).toContain('Page 1 of');
    expect(pdf).toContain('Book 80');
  });

  it('a held line says why', () => {
    const pdf = text(
      cycleStatementPdf({
        ...cycle,
        status: 'held_unverified',
        held_reason: 'Bank account not verified',
        payout: null,
      }),
    );
    expect(pdf).toContain('Held: bank account not verified');
    expect(pdf).not.toContain('Payout reference');
  });

  it('year-to-date statement lists months and totals', () => {
    const ytd: YtdSource = {
      kind: 'year_to_date',
      author_id: 'a1',
      year: 2026,
      pen_name: 'Ada',
      legal_name: 'Ada',
      months: [
        {
          month: '2026-09',
          payout_date: '2026-11-15',
          amount_kobo: 100000,
          payable_kobo: 100000,
          status: 'paid',
          paid_kobo: 100000,
        },
        {
          month: '2026-10',
          payout_date: '2026-12-15',
          amount_kobo: 50000,
          payable_kobo: 50000,
          status: 'carried',
          paid_kobo: 0,
        },
      ],
    };
    const pdf = text(ytdStatementPdf(ytd, new Date('2026-11-27T10:00:00Z')));
    expect(pdf).toContain('2026 year to date');
    expect(pdf).toContain('September 2026');
    expect(pdf).toContain('NGN 1,500.00');
    expect(pdf).toContain('NGN 1,000.00');
    expect(pdf).not.toContain('Ada \xb7 Ada');
  });
});

describe('statementsAfterRelease', () => {
  function setup(
    due: { author_id: string; cycle_id: string }[],
    sources: Record<string, CycleSource | null>,
  ) {
    const puts: { key: string; type?: string }[] = [];
    const recorded: unknown[] = [];
    const env = {
      BOOKS: {
        put: async (key: string, _b: Uint8Array, o?: { httpMetadata?: { contentType?: string } }) => {
          puts.push({ key, type: o?.httpMetadata?.contentType });
          return null;
        },
      },
    } as unknown as Env;
    const db = {
      rpc: async (fn: string, args: Record<string, string>) => {
        if (fn === 'statements_due') return { data: due, error: null };
        if (fn === 'statement_source') {
          const s = sources[args.p_author!];
          if (s === undefined) return { data: null, error: { message: 'boom' } };
          return { data: s, error: null };
        }
        if (fn === 'record_statement') {
          recorded.push(args);
          return { data: 'sid', error: null };
        }
        throw new Error(fn);
      },
    };
    return { env, db: db as never, puts, recorded };
  }

  it('renders, stores and records each due statement; one failure does not stop the rest', async () => {
    const { env, db, puts, recorded } = setup(
      [
        { author_id: 'a1', cycle_id: 'c1' },
        { author_id: 'bad', cycle_id: 'c1' },
        { author_id: 'gone', cycle_id: 'c1' },
        { author_id: 'a2', cycle_id: 'c1' },
      ],
      { a1: cycle, gone: null, a2: { ...cycle, author_id: 'a2' } },
    );
    expect(await statementsAfterRelease(env, db)).toBe(2);
    expect(puts).toEqual([
      { key: statementKey('a1', 'c1'), type: 'application/pdf' },
      { key: statementKey('a2', 'c1'), type: 'application/pdf' },
    ]);
    expect(recorded).toEqual([
      { p_author: 'a1', p_cycle: 'c1', p_kind: 'cycle', p_file_key: 'statements/a1/c1.pdf' },
      { p_author: 'a2', p_cycle: 'c1', p_kind: 'cycle', p_file_key: 'statements/a2/c1.pdf' },
    ]);
  });
});
