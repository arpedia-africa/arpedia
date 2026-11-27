import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { lastFire, periodFor, runScheduledReports, summaryLines } from './reports';

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('lastFire (Lagos time)', () => {
  it('weekly Monday 08:00 Lagos is 07:00 UTC, the latest one at or before now', () => {
    // Fri 27 Nov 2026 22:00 UTC → last Monday 23 Nov.
    expect(iso(lastFire('0 8 * * 1', new Date('2026-11-27T22:00:00Z')))).toBe('2026-11-23T07:00:00.000Z');
    // Exactly on the minute counts.
    expect(iso(lastFire('0 8 * * 1', new Date('2026-11-30T07:00:00Z')))).toBe('2026-11-30T07:00:00.000Z');
    expect(iso(lastFire('0 8 * * 1', new Date('2026-11-30T06:59:00Z')))).toBe('2026-11-23T07:00:00.000Z');
  });

  it('monthly on the 1st, quarterly lists, ranges, steps and Sunday as 7', () => {
    expect(iso(lastFire('0 8 1 * *', new Date('2026-11-27T22:00:00Z')))).toBe('2026-11-01T07:00:00.000Z');
    expect(iso(lastFire('0 9 1 1,4,7,10 *', new Date('2026-11-27T22:00:00Z')))).toBe(
      '2026-10-01T08:00:00.000Z',
    );
    expect(iso(lastFire('30 */6 * * 1-5', new Date('2026-11-28T10:00:00Z')))).toBe(
      '2026-11-27T17:30:00.000Z',
    );
    expect(iso(lastFire('0 10 * * 7', new Date('2026-11-27T22:00:00Z')))).toBe('2026-11-22T09:00:00.000Z');
  });

  it('either day field matches when both are set; bad expressions give null', () => {
    // 15th or a Friday: Fri 27 Nov.
    expect(iso(lastFire('0 0 15 * 5', new Date('2026-11-27T23:30:00Z')))).toBe('2026-11-26T23:00:00.000Z');
    expect(lastFire('0 8 * *', new Date())).toBeNull();
    expect(lastFire('61 8 * * *', new Date())).toBeNull();
    expect(lastFire('0 8 31 2 *', new Date('2026-11-27T00:00:00Z'))).toBeNull();
  });
});

describe('periodFor', () => {
  it('monthly covers last month, weekly the 7 days before, quarterly the last 3 months', () => {
    const m = periodFor('monthly_earnings', new Date('2026-12-01T07:00:00Z'));
    expect([iso(m.from), iso(m.to), m.label]).toEqual([
      '2026-10-31T23:00:00.000Z',
      '2026-11-30T23:00:00.000Z',
      'Nov 2026',
    ]);
    const w = periodFor('weekly_kpi', new Date('2026-11-30T07:00:00Z'));
    expect([iso(w.from), w.label]).toEqual(['2026-11-23T07:00:00.000Z', '23 Nov 2026 to 30 Nov 2026']);
    const q = periodFor('quarterly_data_requests', new Date('2026-10-01T08:00:00Z'));
    expect([iso(q.from), iso(q.to), q.label]).toEqual([
      '2026-06-30T23:00:00.000Z',
      '2026-09-30T23:00:00.000Z',
      'Jul to Sep 2026',
    ]);
  });
});

describe('summaryLines', () => {
  it('earnings in naira with authors; an unclosed month says so', () => {
    const t = summaryLines('monthly_earnings', {
      cycle_status: 'prepared',
      earnings_kobo: 1_234_500,
      authors: 1,
      payable_kobo: 1_000_000,
      held_authors: 2,
      carried_authors: 0,
      payout_date: '2026-12-15',
    });
    expect(t).toContain('Earned: ₦12,345 by 1 author');
    expect(t).toContain('Held: 2 authors');
    expect(t).toContain('Status: prepared · payout 15 Dec 2026');
    expect(summaryLines('monthly_earnings', { cycle_status: 'none' })).toMatch(/not been closed/);
  });

  it('KPI, safety and data-request lines carry only counts', () => {
    expect(summaryLines('weekly_kpi', { signups: 1200, revenue_kobo: 240000 })).toContain(
      'New sign-ups: 1,200',
    );
    expect(summaryLines('weekly_safety', { reports: 9, high: 2 })).toContain(
      'New reports: 9 (2 high severity)',
    );
    expect(summaryLines('quarterly_data_requests', { deletions_done: 3 })).toContain('Accounts erased: 3');
  });
});

describe('runScheduledReports', () => {
  const weekly = {
    id: 's1',
    report_kind: 'weekly_safety',
    recipients: ['safety@arpedia.africa', 'lead@arpedia.africa'],
    cron: '0 9 * * 1',
    last_sent_at: '2026-11-23T08:00:00Z',
  };
  const fakeDb = (rows: unknown[], claimed = true) => {
    const calls: { fn: string; args?: Record<string, unknown> }[] = [];
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'scheduled_reports_list') return { data: rows, error: null };
      if (fn === 'claim_scheduled_report') return { data: claimed, error: null };
      if (fn === 'scheduled_report_summary') return { data: { reports: 4, high: 1 }, error: null };
      return { data: null, error: null };
    });
    return { db: { rpc } as never, calls };
  };
  const env = { APP_ENV: 'staging', ADMIN_URL: 'https://admin.arpedia.africa' } as Env;

  it('emails every recipient once the cron comes round, with the period and a console link', async () => {
    const { db, calls } = fakeDb([weekly]);
    const send = vi.fn(async () => true);
    expect(await runScheduledReports(env, new Date('2026-11-30T08:02:00Z'), db, send)).toEqual([
      'weekly_safety',
    ]);
    expect(calls.find((c) => c.fn === 'claim_scheduled_report')!.args).toEqual({
      p_id: 's1',
      p_fire_at: '2026-11-30T08:00:00.000Z',
    });
    expect(calls.find((c) => c.fn === 'scheduled_report_summary')!.args).toMatchObject({
      p_kind: 'weekly_safety',
      p_from: '2026-11-23T08:00:00.000Z',
      p_to: '2026-11-30T08:00:00.000Z',
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(env, db, 'scheduled_report', 'lead@arpedia.africa', {
      subject: 'Weekly safety summary',
      period: '23 Nov 2026 to 30 Nov 2026',
      summary: expect.stringContaining('New reports: 4 (1 high severity)'),
      link: 'https://admin.arpedia.africa/reports',
    });
  });

  it('sends nothing already sent, claimed by another run, more than a day late, or without ADMIN_URL', async () => {
    const send = vi.fn(async () => true);
    // Already sent for this firing.
    expect(
      await runScheduledReports(env, new Date('2026-11-27T12:00:00Z'), fakeDb([weekly]).db, send),
    ).toEqual([]);
    // Another run claimed it first.
    expect(
      await runScheduledReports(env, new Date('2026-11-30T08:02:00Z'), fakeDb([weekly], false).db, send),
    ).toEqual([]);
    // Two days late.
    expect(
      await runScheduledReports(env, new Date('2026-12-02T09:00:00Z'), fakeDb([weekly]).db, send),
    ).toEqual([]);
    // No console URL off the local stack.
    expect(
      await runScheduledReports(
        { APP_ENV: 'production' } as Env,
        new Date('2026-11-30T08:02:00Z'),
        fakeDb([weekly]).db,
        send,
      ),
    ).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('one failing recipient does not stop the others', async () => {
    const { db } = fakeDb([weekly]);
    const send = vi.fn().mockRejectedValueOnce(new Error('resend 500')).mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runScheduledReports(env, new Date('2026-11-30T08:02:00Z'), db, send)).toEqual([
      'weekly_safety',
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
