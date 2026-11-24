import { ledgerDay, naira } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { sendTemplateEmail } from './email';

// Flow 15 · the notification and email dispatcher for the notice queues other flows write to:
// user_notify (gifts, tips, likes, comments, DMs, billing, refunds, payouts, payout account),
// author_notify (applications), book_notify (pipeline) and trust_notify (moderation, appeals,
// claims, staff alerts; drained by flow 14's drainTrustOutbox, which hands its notices here).
// Each notice becomes pushes (enqueue_push → push_fanout, so push types, preferences, quiet hours
// and the in-app feed apply as for every push) and template emails. Copy is plain and friendly.

type Db = ReturnType<typeof serviceDb>;

export const NOTIFY_QUEUES = ['user_notify', 'author_notify', 'book_notify'] as const;

export interface Notice {
  kind: string;
  [field: string]: unknown;
}

export interface Lookup {
  users: Record<string, { email: string | null; first_name: string; name: string }>;
  books: Record<string, { title: string; author_id: string | null }>;
  staff: Record<string, string[]>;
  followers: Record<string, string[]>;
}

export interface Push {
  type: string;
  user_ids: string[];
  data: {
    vars: Record<string, string>;
    target?: { kind: string; id?: string; screen?: string };
    actor_id?: string;
    book_id?: string;
  };
}
export interface Mail {
  key: string;
  user_id: string;
  vars: Record<string, string>;
}
export interface Plan {
  push: Push[];
  mail: Mail[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const id = (v: unknown) => (typeof v === 'string' && v ? v : null);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const day = (v: unknown) => (typeof v === 'string' && v ? ledgerDay(v) : '');
const money = (v: unknown) => (typeof v === 'number' ? naira(v) : '');
const firstLine = (v: unknown) => str(v).split('\n')[0]!.slice(0, 140);

/** Staff notices go to everyone holding the role (Super admins always). */
const STAFF_ROLE: Record<string, string> = {
  application_sla: 'publisher',
  staff_alert: 'moderator',
};

/** Book notices that name the book's author by `author_id` or only by `book_id`. */
function recipientOf(n: Notice, l?: Lookup): string | null {
  const direct = id(n.user_id) ?? id(n.author_id);
  if (direct) return direct;
  const book = id(n.book_id);
  return book ? (l?.books[book]?.author_id ?? null) : null;
}

/** Which people, books, staff roles and followers a batch needs looking up. */
export function needs(notices: Notice[]) {
  const users = new Set<string>();
  const books = new Set<string>();
  const roles = new Set<string>();
  const followAuthors = new Set<string>();
  for (const n of notices) {
    for (const k of ['user_id', 'author_id', 'from_user_id'] as const) {
      const v = id(n[k]);
      if (v) users.add(v);
    }
    for (const u of ids(n.user_ids)) users.add(u);
    const b = id(n.book_id);
    if (b) books.add(b);
    const role = typeof n.role === 'string' ? n.role : STAFF_ROLE[n.kind];
    if (role) roles.add(role);
    if (n.kind === 'book_live' && id(n.author_id)) followAuthors.add(n.author_id as string);
  }
  return { users: [...users], books: [...books], roles: [...roles], followAuthors: [...followAuthors] };
}

/** Second pass: staff, followers and book authors found in the first lookup need names and emails. */
export function moreUsers(l: Lookup): string[] {
  const out = new Set<string>();
  for (const list of [...Object.values(l.staff), ...Object.values(l.followers)])
    for (const u of list) out.add(u);
  for (const b of Object.values(l.books)) if (b.author_id) out.add(b.author_id);
  return [...out].filter((u) => !l.users[u]);
}

/** What one notice turns into. Unknown kinds turn into nothing (and are acked). */
export function plan(n: Notice, l: Lookup): Plan {
  const push: Push[] = [];
  const mail: Mail[] = [];
  const to = recipientOf(n, l);
  const sender = l.users[str(n.from_user_id)]?.name ?? 'Someone';
  const book = l.books[str(n.book_id)]?.title ?? 'your book';
  const notice = (title: string, body: string, target?: Push['data']['target'], type = 'account_notice') => {
    if (to)
      push.push({ type, user_ids: [to], data: { vars: { title, body }, ...(target ? { target } : {}) } });
  };
  const social = (title: string, body: string, target?: Push['data']['target']) => {
    if (to)
      push.push({
        type: 'social_notice',
        user_ids: [to],
        data: {
          vars: { title, body },
          ...(target ? { target } : {}),
          ...(id(n.from_user_id) ? { actor_id: n.from_user_id as string } : {}),
        },
      });
  };
  const typed = (
    type: string,
    vars: Record<string, string> = {},
    target?: Push['data']['target'],
    who = to,
  ) => {
    if (who) push.push({ type, user_ids: [who], data: { vars, ...(target ? { target } : {}) } });
  };
  const email = (key: string, vars: Record<string, string> = {}, who = to) => {
    if (who) mail.push({ key, user_id: who, vars });
  };
  const staff = (role: string, subject: string, message: string) => {
    for (const u of l.staff[role] ?? [])
      mail.push({ key: 'staff_alert', user_id: u, vars: { subject, message } });
  };
  const studio = { kind: 'screen', screen: 'studio' };
  const earnings = { kind: 'screen', screen: 'earnings' };
  const post = id(n.post_id) ? { kind: 'post', id: n.post_id as string } : undefined;

  switch (n.kind) {
    // ─── user_notify ───
    case 'gift_received':
      social(
        `${sender} sent you a book`,
        `${book} is in your library now`,
        id(n.book_id) ? { kind: 'book', id: n.book_id as string } : undefined,
      );
      break;
    case 'tip_received':
      notice(`${sender} tipped you`, `${str(n.credits)} credits for ${book}`, earnings);
      break;
    case 'post_liked':
      social(`${sender} liked your post`, 'Open to see it', post);
      break;
    case 'post_comment':
      social(`${sender} commented on your post`, 'Open to read it', post);
      break;
    case 'comment_reply':
      social(`${sender} replied to your comment`, 'Open to read it', post);
      break;
    case 'dm_message':
      social(
        `New message from ${sender}`,
        'Open to read it',
        id(n.group_id) ? { kind: 'group', id: n.group_id as string } : undefined,
      );
      break;
    case 'billing_issue':
      typed('renewal_failed', {}, { kind: 'screen', screen: 'plans' });
      email('renewal_failed', { plan: '', amount: '', date: '' });
      break;
    case 'refund_done':
      notice('Your refund is on its way', 'It can take 5 to 10 working days to reach your card', {
        kind: 'screen',
        screen: 'credits',
      });
      email('refund_done');
      break;
    case 'refund_declined':
      notice('About your refund request', 'We’ve emailed you our answer', {
        kind: 'screen',
        screen: 'credits',
      });
      email('refund_declined', { note: str(n.note) });
      break;
    case 'plan_extended':
      notice(`We’ve added ${str(n.days)} days to your plan`, 'Enjoy the extra reading time', {
        kind: 'screen',
        screen: 'plans',
      });
      break;
    case 'renewal_reminder': {
      const plan = str(n.plan).replace(/^./, (c) => c.toUpperCase());
      const date = day(n.period_end);
      const amount = money(n.price_kobo);
      notice(`Your ${plan} plan renews on ${date}`, `${amount} will be charged then. Manage it in Plans`, {
        kind: 'screen',
        screen: 'plans',
      });
      email('renewal_reminder', { plan, amount, date });
      break;
    }
    case 'payout_paid':
      notice(`Your payout of ${money(n.amount_kobo)} is paid`, `Reference ${str(n.reference)}`, earnings);
      email('payout_sent', { amount: money(n.amount_kobo), date: ledgerDay(new Date()) });
      break;
    case 'payout_failed':
      notice('Your payout didn’t go through', 'Check your payout account in Studio → Earnings', earnings);
      email('payout_failed', { amount: money(n.amount_kobo) });
      break;
    case 'bank_account_changed':
      notice('Your payout account changed', `${str(n.bank_name)} ending ${str(n.last4)}`, earnings);
      email('bank_account_changed', {
        bank_name: str(n.bank_name),
        last4: str(n.last4),
        resume_at: day(n.resume_at),
      });
      break;
    case 'bank_document_requested':
      notice('We need a document for your payouts', firstLine(n.reason), earnings);
      email('bank_document_requested', { reason: str(n.reason) });
      break;
    case 'bank_account_rejected':
      notice('We couldn’t use your payout account', firstLine(n.reason), earnings);
      email('bank_account_rejected', { reason: str(n.reason) });
      break;

    // ─── author_notify ───
    case 'application_received':
      notice('We got your author application', 'We’ll let you know when we’ve looked at it', studio);
      break;
    case 'application_approved':
      typed('author_approved', {}, studio);
      email('author_approved');
      break;
    case 'application_needs_info':
      notice('We need a little more about your application', 'Open Studio to answer', studio);
      email('application_more_info');
      break;
    case 'application_rejected':
      notice('About your author application', 'Open the app to see why', studio);
      email('application_rejected');
      break;
    case 'author_suspended':
      notice('Your author account is paused', 'Open Studio to see why', studio);
      break;
    case 'application_sla':
      staff('publisher', `${str(n.count)} author applications are waiting`, 'Some are past the reply time.');
      break;

    // ─── book_notify ───
    case 'sent_back':
      typed(
        'changes_requested',
        { book_title: book, note_first_line: 'Open Studio to see what to change' },
        studio,
      );
      email('changes_requested', { book_title: book, note: '' });
      break;
    case 'book_live': {
      typed(
        'book_approved',
        { book_title: book },
        id(n.book_id) ? { kind: 'book', id: n.book_id as string } : undefined,
      );
      email('book_approved', { book_title: book });
      const author = id(n.author_id);
      const fans = author ? (l.followers[author] ?? []).filter((u) => u !== author) : [];
      if (fans.length)
        push.push({
          type: 'author_new_book',
          user_ids: fans,
          data: {
            vars: { author: l.users[author!]?.name ?? 'An author you follow', book_title: book },
            target: { kind: 'book', id: n.book_id as string },
            actor_id: author!,
            book_id: n.book_id as string,
          },
        });
      break;
    }
    case 'book_added_by_staff':
      notice(`${book} is in your Studio`, 'Our team added it for you', studio);
      break;
    case 'chapters_ready':
      notice(`New chapters of ${book} are live`, 'Readers can read them now', studio);
      break;
    case 'rejected':
      notice(`We can’t publish ${book}`, firstLine(n.reason) || 'Open Studio to see why', studio);
      email('book_rejected', { book_title: book, note: str(n.reason) });
      break;
    case 'book_unpublished':
      notice(`${book} is no longer on Arpedia`, 'Open Studio to see why', studio);
      break;
    case 'sent_back_reminder':
      notice(`${book} is waiting for your changes`, 'Open Studio to send it back to us', studio);
      break;
    case 'desk_job':
    case 'pipeline_late':
    case 'fast_lane_problem': {
      const subject =
        n.kind === 'desk_job'
          ? 'A book needs the conversion desk'
          : n.kind === 'pipeline_late'
            ? `A book is late in review (${str(n.status)})`
            : 'A fast-lane book has a problem';
      staff(str(n.role) || 'publisher', subject, str(n.reason ?? n.note) || `Book ${book}`);
      break;
    }

    // ─── trust_notify ───
    case 'staff_alert':
      staff(
        'moderator',
        n.late
          ? 'A report is past its reply time'
          : n.escalated
            ? 'A report was escalated to you'
            : 'A report needs a look',
        [str(n.severity), str(n.reason)].filter(Boolean).join(' · ') || 'Open Reports in the console.',
      );
      break;
    case 'sanction_notice':
      typed('moderation_notice');
      email('sanction_notice', { message: str(n.message) });
      break;
    case 'reporter_notice':
      for (const u of ids(n.user_ids)) typed('report_actioned', {}, undefined, u);
      break;
    case 'appeal_decided':
      typed('appeal_decision');
      email('appeal_decided', { message: str(n.message) });
      break;
    case 'claim_author':
      notice(`A claim about ${book}`, 'Open Studio to answer it', studio);
      email('claim_notice', { book_title: book, message: str(n.message), due: day(n.author_due_at) });
      break;
    case 'claim_decided':
      notice(
        `The claim about ${book} is decided`,
        firstLine(n.message) || 'Open Studio to see the decision',
        studio,
      );
      email('claim_decided', { book_title: book, message: str(n.message) });
      break;
    case 'ticket_reply':
      // The reply email itself is sent by flow 14 (sendTicketReply).
      typed('ticket_reply');
      break;
    default:
      // rules_changed and live are flow 14's own; anything else has nothing to send.
      break;
  }
  return { push, mail };
}

export type SendMail = typeof sendTemplateEmail;

async function lookup(db: Db, n: ReturnType<typeof needs>): Promise<Lookup> {
  const call = async (users: string[], books: string[], roles: string[], authors: string[]) => {
    const { data, error } = await db.rpc('notify_lookup', {
      p_users: users,
      p_books: books,
      p_roles: roles,
      p_follow_authors: authors,
    });
    if (error) throw error;
    return data as unknown as Lookup;
  };
  const l = await call(n.users, n.books, n.roles, n.followAuthors);
  const more = moreUsers(l);
  if (more.length) l.users = { ...l.users, ...(await call(more, [], [], [])).users };
  return l;
}

/**
 * Deliver a batch. Returns, per notice, whether everything it planned was handed over (pushes
 * enqueued, emails sent or skipped for a missing address). A failure leaves that notice to retry.
 */
export async function deliverNotices(
  env: Env,
  db: Db,
  notices: Notice[],
  sendMail: SendMail = sendTemplateEmail,
): Promise<boolean[]> {
  if (!notices.length) return [];
  const l = await lookup(db, needs(notices));
  const out: boolean[] = [];
  for (const n of notices) {
    try {
      const p = plan(n, l);
      for (const x of p.push) {
        const { error } = await db.rpc('enqueue_push', {
          p_type: x.type,
          p_user_ids: x.user_ids,
          p_data: x.data,
        });
        if (error) throw error;
      }
      for (const m of p.mail) {
        const u = l.users[m.user_id];
        if (!u?.email) continue;
        await sendMail(env, db, m.key, u.email, { first_name: u.first_name, ...m.vars }, m.user_id);
      }
      out.push(true);
    } catch (e) {
      console.error('[notify]', n.kind, e);
      out.push(false);
    }
  }
  return out;
}

/** Cron: drain user_notify, author_notify and book_notify. A message failing 5 times is dropped. */
export async function drainNotify(
  env: Env,
  db: Db = serviceDb(env),
  sendMail: SendMail = sendTemplateEmail,
): Promise<{ delivered: number; dropped: number }> {
  let delivered = 0;
  let dropped = 0;
  for (const queue of NOTIFY_QUEUES) {
    const { data, error } = await db.rpc('notify_queue_read', { p_queue: queue, p_vt: 120, p_qty: 20 });
    if (error) throw error;
    const rows = (data ?? []) as unknown as { msg_id: number; read_ct: number; message: Notice }[];
    if (!rows.length) continue;
    const ok = await deliverNotices(
      env,
      db,
      rows.map((r) => r.message),
      sendMail,
    );
    for (const [i, r] of rows.entries()) {
      const give = !ok[i] && r.read_ct > 5;
      if (!ok[i] && !give) continue;
      if (give) {
        console.error('[notify] dropping after 5 tries', queue, r.message.kind, r.msg_id);
        dropped++;
      } else delivered++;
      const { error: de } = await db.rpc('notify_queue_done', { p_queue: queue, p_msg_id: r.msg_id });
      if (de) throw de;
    }
  }
  return { delivered, dropped };
}
