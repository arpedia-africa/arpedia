import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { deliverNotices, drainNotify, moreUsers, needs, plan, type Lookup, type Notice } from './notify';

const READER = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const AUTHOR = '33333333-3333-4333-8333-333333333333';
const FAN = '44444444-4444-4444-8444-444444444444';
const MOD = '55555555-5555-4555-8555-555555555555';
const BOOK = '66666666-6666-4666-8666-666666666666';

const L: Lookup = {
  users: {
    [READER]: { email: 'ngozi@example.com', first_name: 'Ngozi', name: 'Ngozi Okafor' },
    [FRIEND]: { email: 'tunde@example.com', first_name: 'Tunde', name: 'Tunde Bello' },
    [AUTHOR]: { email: 'chi@example.com', first_name: 'Chi', name: 'Chi Eze' },
    [FAN]: { email: null, first_name: 'Ada', name: 'Ada' },
    [MOD]: { email: 'mod@arpedia.africa', first_name: 'Zainab', name: 'Zainab' },
  },
  books: { [BOOK]: { title: 'Harmattan Letters', author_id: AUTHOR } },
  staff: { moderator: [MOD], publisher: [MOD] },
  followers: { [AUTHOR]: [FAN, AUTHOR] },
};

describe('plan', () => {
  it('gift: a social push from the sender about the book', () => {
    const p = plan({ kind: 'gift_received', user_id: READER, from_user_id: FRIEND, book_id: BOOK }, L);
    expect(p.mail).toEqual([]);
    expect(p.push).toEqual([
      {
        type: 'social_notice',
        user_ids: [READER],
        data: {
          vars: { title: 'Tunde Bello sent you a book', body: 'Harmattan Letters is in your library now' },
          target: { kind: 'book', id: BOOK },
          actor_id: FRIEND,
        },
      },
    ]);
  });

  it('renewal reminder: plan, price and date in the push and the email', () => {
    const p = plan(
      {
        kind: 'renewal_reminder',
        user_id: READER,
        plan: 'quarterly',
        period_end: '2026-12-01T08:00:00Z',
        price_kobo: 240000,
      },
      L,
    );
    expect(p.push[0]!.data.vars.title).toBe('Your Quarterly plan renews on 1 Dec 2026');
    expect(p.push[0]!.data.vars.body).toMatch(/^₦2,400 will be charged/);
    expect(p.mail).toEqual([
      {
        key: 'renewal_reminder',
        user_id: READER,
        vars: { plan: 'Quarterly', amount: '₦2,400', date: '1 Dec 2026' },
      },
    ]);
  });

  it('welcome and receipt are emails only, with amount, item and date', () => {
    expect(plan({ kind: 'welcome', user_id: READER }, L)).toEqual({
      push: [],
      mail: [{ key: 'welcome', user_id: READER, vars: {} }],
    });
    expect(
      plan(
        {
          kind: 'receipt',
          user_id: READER,
          amount_kobo: 240000,
          item: 'Quarterly plan',
          paid_at: '2026-11-24T08:00:00Z',
        },
        L,
      ),
    ).toEqual({
      push: [],
      mail: [
        {
          key: 'receipt',
          user_id: READER,
          vars: { amount: '₦2,400', item: 'Quarterly plan', date: '24 Nov 2026' },
        },
      ],
    });
  });

  it('billing issue uses the renewal_failed push and email', () => {
    const p = plan({ kind: 'billing_issue', user_id: READER, subscription_id: 'x' }, L);
    expect(p.push.map((x) => x.type)).toEqual(['renewal_failed']);
    expect(p.mail.map((m) => m.key)).toEqual(['renewal_failed']);
  });

  it('payouts and payout account changes email the author', () => {
    expect(
      plan({ kind: 'payout_paid', user_id: AUTHOR, amount_kobo: 1_250_000, reference: 'ARP-1' }, L).push[0]!
        .data.vars,
    ).toEqual({
      title: 'Your payout of ₦12,500 is paid',
      body: 'Reference ARP-1',
    });
    expect(plan({ kind: 'payout_failed', user_id: AUTHOR, amount_kobo: 100 }, L).mail[0]!.key).toBe(
      'payout_failed',
    );
    const bank = plan(
      {
        kind: 'bank_account_changed',
        user_id: AUTHOR,
        bank_name: 'GTBank',
        last4: '1234',
        resume_at: '2026-11-27T00:00:00Z',
      },
      L,
    );
    expect(bank.mail[0]).toEqual({
      key: 'bank_account_changed',
      user_id: AUTHOR,
      vars: { bank_name: 'GTBank', last4: '1234', resume_at: '27 Nov 2026' },
    });
  });

  it('applications: approved uses its push type and email; SLA emails Publishers', () => {
    const a = plan({ kind: 'application_approved', application_id: 'a', user_id: AUTHOR, email: true }, L);
    expect(a.push.map((x) => x.type)).toEqual(['author_approved']);
    expect(a.mail.map((m) => m.key)).toEqual(['author_approved']);
    const sla = plan({ kind: 'application_sla', count: 4, role: 'publisher' }, L);
    expect(sla.push).toEqual([]);
    expect(sla.mail).toEqual([
      {
        key: 'staff_alert',
        user_id: MOD,
        vars: { subject: '4 author applications are waiting', message: 'Some are past the reply time.' },
      },
    ]);
  });

  it('an export that is ready emails the staff member who made it (15-19)', () => {
    const n = { kind: 'export_ready', user_id: MOD, export_kind: 'author_earnings', row_count: 1234 };
    expect(needs([n]).users).toEqual([MOD]);
    expect(plan(n, L)).toEqual({
      push: [],
      mail: [
        {
          key: 'staff_alert',
          user_id: MOD,
          vars: {
            subject: 'Your author earnings export is ready',
            message: '1,234 rows. Download it from Exports in the console within 7 days.',
          },
        },
      ],
    });
    expect(plan({ ...n, row_count: 1 }, L).mail[0]!.vars.message).toMatch(/^1 row\. /);
  });

  it('payout alerts email Finance with flow 13 copy', () => {
    const l = { ...L, staff: { ...L.staff, finance: [MOD] } };
    const n = {
      kind: 'payout_alert',
      alert: 'payout_reminder',
      subject: 'Payout day in 3 days',
      message: 'm',
    };
    expect(needs([n]).roles).toEqual(['finance']);
    expect(plan(n, l).mail).toEqual([
      { key: 'staff_alert', user_id: MOD, vars: { subject: 'Payout day in 3 days', message: 'm' } },
    ]);
  });

  it('finance alerts email Finance (spec check 09-8)', () => {
    const l = { ...L, staff: { ...L.staff, finance: [MOD] } };
    expect(needs([{ kind: 'finance_alert', alert: 'chargeback', transaction_id: 't1' }]).roles).toEqual([
      'finance',
    ]);
    const cb = plan({ kind: 'finance_alert', alert: 'chargeback', transaction_id: 't1' }, l);
    expect(cb.push).toEqual([]);
    expect(cb.mail).toHaveLength(1);
    expect(cb.mail[0]).toMatchObject({ key: 'staff_alert', user_id: MOD });
    expect(cb.mail[0]!.vars.subject).toBe('A web payment was disputed (chargeback)');
    expect(cb.mail[0]!.vars.message).toMatch(/Transaction t1\.$/);
    const dup = plan({ kind: 'finance_alert', alert: 'duplicate_charge', transaction_id: 't2' }, l);
    expect(dup.mail[0]!.vars.subject).toBe('A reader was charged twice within a minute');
    expect(plan({ kind: 'finance_alert', alert: 'odd', transaction_id: 't3' }, l).mail[0]!.vars.subject).toBe(
      'Payment alert: odd',
    );
  });

  it('a book going live tells the author and their followers (not the author twice)', () => {
    const p = plan({ kind: 'book_live', book_id: BOOK, author_id: AUTHOR }, L);
    expect(p.push.map((x) => [x.type, x.user_ids])).toEqual([
      ['book_approved', [AUTHOR]],
      ['author_new_book', [FAN]],
    ]);
    expect(p.push[1]!.data).toMatchObject({
      vars: { author: 'Chi Eze', book_title: 'Harmattan Letters' },
      actor_id: AUTHOR,
    });
    expect(p.mail.map((m) => m.key)).toEqual(['book_approved']);
  });

  it('notices with only a book id reach the book’s author', () => {
    const p = plan(
      {
        kind: 'claim_author',
        book_id: BOOK,
        claim_id: 'c',
        author_due_at: '2026-11-30T09:00:00Z',
        message: 'Copyright claim',
      },
      L,
    );
    expect(p.push[0]!.user_ids).toEqual([AUTHOR]);
    expect(p.mail[0]).toEqual({
      key: 'claim_notice',
      user_id: AUTHOR,
      vars: { book_title: 'Harmattan Letters', message: 'Copyright claim', due: '30 Nov 2026' },
    });
    expect(
      plan({ kind: 'book_unpublished', book_id: BOOK, remove_access: false }, L).push[0]!.user_ids,
    ).toEqual([AUTHOR]);
  });

  it('moderation: sanction, appeal, reporters, staff alerts, ticket reply push', () => {
    const s = plan(
      { kind: 'sanction_notice', user_id: READER, message: 'Muted for 24 hours', email: true },
      L,
    );
    expect([s.push[0]!.type, s.mail[0]]).toEqual([
      'moderation_notice',
      { key: 'sanction_notice', user_id: READER, vars: { message: 'Muted for 24 hours' } },
    ]);
    expect(plan({ kind: 'appeal_decided', user_id: READER, message: 'Overturned' }, L).push[0]!.type).toBe(
      'appeal_decision',
    );
    expect(
      plan({ kind: 'reporter_notice', user_ids: [READER, FRIEND], message: 'x' }, L).push.map(
        (x) => x.user_ids,
      ),
    ).toEqual([[READER], [FRIEND]]);
    expect(plan({ kind: 'staff_alert', report_id: 'r', severity: 'high', reason: 'threat' }, L).mail).toEqual(
      [
        {
          key: 'staff_alert',
          user_id: MOD,
          vars: { subject: 'A report needs a look', message: 'high · threat' },
        },
      ],
    );
    const t = plan(
      { kind: 'ticket_reply', user_id: READER, ticket_id: 't', message_id: 'm', email: 'ngozi@example.com' },
      L,
    );
    expect([t.push.map((x) => x.type), t.mail]).toEqual([['ticket_reply'], []]);
  });

  it('unknown, live and rules_changed send nothing', () => {
    for (const kind of ['live', 'rules_changed', 'something_new'])
      expect(plan({ kind, user_id: READER }, L)).toEqual({ push: [], mail: [] });
  });
});

describe('needs', () => {
  it('collects people, books, staff roles and followed authors', () => {
    const n = needs([
      { kind: 'gift_received', user_id: READER, from_user_id: FRIEND, book_id: BOOK },
      { kind: 'staff_alert', report_id: 'r' },
      { kind: 'desk_job', role: 'operations_admin' },
      { kind: 'book_live', book_id: BOOK, author_id: AUTHOR },
      { kind: 'reporter_notice', user_ids: [FAN] },
    ]);
    expect(n.users.sort()).toEqual([READER, FRIEND, AUTHOR, FAN].sort());
    expect(n.books).toEqual([BOOK]);
    expect(n.roles.sort()).toEqual(['moderator', 'operations_admin']);
    expect(n.followAuthors).toEqual([AUTHOR]);
    expect(moreUsers({ ...L, users: {} }).sort()).toEqual([MOD, FAN, AUTHOR].sort());
  });
});

function fakeDb(
  opts: {
    rows?: Record<string, { msg_id: number; read_ct: number; message: Notice }[]>;
    failPush?: boolean;
    verifyToken?: string | null;
  } = {},
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    switch (fn) {
      case 'notify_lookup':
        return { data: L, error: null };
      case 'enqueue_push':
        return opts.failPush ? { data: null, error: new Error('down') } : { data: 1, error: null };
      case 'notify_queue_read':
        return { data: opts.rows?.[args.p_queue as string] ?? [], error: null };
      case 'notify_queue_done':
        return { data: true, error: null };
      case 'issue_email_verification':
        return { data: opts.verifyToken ?? null, error: null };
      default:
        throw new Error(`unexpected rpc ${fn}`);
    }
  });
  return { db: { rpc } as never, calls };
}
const env = {} as Env;

describe('deliverNotices', () => {
  it('enqueues pushes and sends emails to the address on file, with the first name', async () => {
    const { db, calls } = fakeDb();
    const sendMail = vi.fn(async () => true);
    const ok = await deliverNotices(
      env,
      db,
      [{ kind: 'payout_paid', user_id: AUTHOR, amount_kobo: 100, reference: 'R' }],
      sendMail,
    );
    expect(ok).toEqual([true]);
    expect(calls.filter((c) => c.fn === 'enqueue_push').map((c) => c.args.p_type)).toEqual([
      'account_notice',
    ]);
    expect(sendMail).toHaveBeenCalledWith(
      env,
      db,
      'payout_sent',
      'chi@example.com',
      expect.objectContaining({ first_name: 'Chi', amount: '₦1' }),
      AUTHOR,
    );
  });

  it('skips the email when there is no address (erased account) but still counts as delivered', async () => {
    const { db } = fakeDb();
    const sendMail = vi.fn(async () => true);
    expect(
      await deliverNotices(env, db, [{ kind: 'sanction_notice', user_id: FAN, message: 'x' }], sendMail),
    ).toEqual([true]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('verify email: a fresh one-time link at send time', async () => {
    const { db, calls } = fakeDb({ verifyToken: 'ab'.repeat(24) });
    const sendMail = vi.fn(async () => true);
    const live = { PUBLIC_API_URL: 'https://api.arpedia.africa/' } as Env;
    expect(await deliverNotices(live, db, [{ kind: 'verify_email', user_id: READER }], sendMail)).toEqual([
      true,
    ]);
    expect(calls.find((c) => c.fn === 'issue_email_verification')?.args).toEqual({ p_user: READER });
    expect(sendMail).toHaveBeenCalledWith(
      live,
      db,
      'verify_email',
      'ngozi@example.com',
      { first_name: 'Ngozi', link: `https://api.arpedia.africa/v1/email-verify?t=${'ab'.repeat(24)}` },
      READER,
    );
  });

  it('verify email: nothing sent once the address is proven, or with no public URL', async () => {
    const sendMail = vi.fn(async () => true);
    const proven = fakeDb({ verifyToken: null });
    const live = { PUBLIC_API_URL: 'https://api.arpedia.africa' } as Env;
    expect(
      await deliverNotices(live, proven.db, [{ kind: 'verify_email', user_id: READER }], sendMail),
    ).toEqual([true]);
    const local = fakeDb({ verifyToken: 'ab'.repeat(24) });
    expect(
      await deliverNotices(env, local.db, [{ kind: 'verify_email', user_id: READER }], sendMail),
    ).toEqual([true]);
    expect(local.calls.some((c) => c.fn === 'issue_email_verification')).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('verify email: a deployed Worker without a public URL keeps the notice for a retry', async () => {
    const sendMail = vi.fn(async () => true);
    const { db } = fakeDb({ verifyToken: 'ab'.repeat(24) });
    const staging = { APP_ENV: 'staging' } as Env;
    expect(await deliverNotices(staging, db, [{ kind: 'verify_email', user_id: READER }], sendMail)).toEqual([
      false,
    ]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('a failing push leaves that notice for a retry', async () => {
    const { db } = fakeDb({ failPush: true });
    expect(
      await deliverNotices(env, db, [{ kind: 'plan_extended', user_id: READER, days: 7 }], vi.fn()),
    ).toEqual([false]);
  });
});

describe('bad input', () => {
  it('ignores ids that are not uuids, and a failing lookup only marks the batch for retry', async () => {
    expect(needs([{ kind: 'gift_received', user_id: 'not-a-uuid', book_id: 42 }]).users).toEqual([]);
    const rpc = vi.fn(async () => ({ data: null, error: new Error('lookup down') }));
    expect(
      await deliverNotices(env, { rpc } as never, [{ kind: 'plan_extended', user_id: READER }], vi.fn()),
    ).toEqual([false]);
  });
});

describe('drainNotify', () => {
  it('acks delivered notices, keeps failed ones, drops one that failed 5 times', async () => {
    const rows = {
      user_notify: [{ msg_id: 1, read_ct: 1, message: { kind: 'plan_extended', user_id: READER, days: 7 } }],
      book_notify: [
        { msg_id: 9, read_ct: 6, message: { kind: 'chapters_ready', book_id: BOOK, author_id: AUTHOR } },
      ],
    };
    const ok = fakeDb({ rows });
    expect(await drainNotify(env, ok.db, vi.fn())).toEqual({ delivered: 2, dropped: 0 });
    expect(
      ok.calls.filter((c) => c.fn === 'notify_queue_done').map((c) => [c.args.p_queue, c.args.p_msg_id]),
    ).toEqual([
      ['user_notify', 1],
      ['book_notify', 9],
    ]);

    const bad = fakeDb({
      rows: { ...rows, user_notify: [{ ...rows.user_notify[0]!, read_ct: 2 }] },
      failPush: true,
    });
    expect(await drainNotify(env, bad.db, vi.fn())).toEqual({ delivered: 0, dropped: 1 });
    expect(bad.calls.filter((c) => c.fn === 'notify_queue_done').map((c) => c.args.p_msg_id)).toEqual([9]);
  });
});
