import Link from 'next/link';
import { notFound } from 'next/navigation';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { ToastButton } from '../../books/[id]/book-menu';
import { AUTO_VERIFY, day, dayTime, monthLabel, past } from '../../royalties/shared';
import { BankReview } from './client';

interface Account {
  id: string;
  author_id: string;
  name: string;
  pen_name: string | null;
  bank_name: string;
  account_last4: string;
  bank_account_name: string;
  legal_name: string;
  match_score: number;
  status: 'needs_review' | 'verified' | 'rejected' | 'replaced';
  verified_at: string | null;
  verified_name: string | null;
  rejected_reason: string | null;
  document_requested_at: string | null;
  id_document_key: string | null;
  payouts_resume_at: string;
  created_at: string;
  queue: string[] | null;
  held: { month: string; kobo: number; status: string }[];
  history: {
    id: string;
    bank_name: string;
    account_last4: string;
    status: string;
    created_at: string;
    verified_at: string | null;
    verified_name: string | null;
    rejected_reason: string | null;
  }[];
  failures: { month: string; settled_at: string | null; reason: string | null; bank_name: string | null; last4: string | null }[];
}

const STATUS: Record<Account['status'], { label: string; cls: string }> = {
  needs_review: { label: 'Needs review', cls: 'st st-warn' },
  verified: { label: 'Verified', cls: 'st-plain' },
  rejected: { label: 'Rejected', cls: 'st-plain' },
  replaced: { label: 'Replaced', cls: 'st-plain' },
};

/** s-bank-account: submitted details and the name check, ID document, decision bar (rule 22, 24). */
export default async function BankAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ id }, { done }] = await Promise.all([params, searchParams]);
  const { denied } = await guard('bank-accounts', 'Bank accounts');
  if (denied) return denied;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_bank_account', { p_account: id });
  if (error) {
    if (error.message === 'not_found' || error.code === '22P02') notFound();
    throw error;
  }
  const a = data as unknown as Account;
  const queue = a.queue ?? [];
  const at = queue.indexOf(a.id);
  const nextId = queue.length ? (at >= 0 ? (queue[at + 1] ?? null) : (queue[0] ?? null)) : null;
  const score = Math.round(Number(a.match_score));
  const st = STATUS[a.status];
  const paused = !past(a.payouts_resume_at);
  const previous = a.history.find(h => h.status === 'replaced');

  const timeline = [
    { cls: 'org', b: 'Account submitted', small: `${dayTime(a.created_at)} · ${a.bank_name} ••••${a.account_last4} · payouts to it paused 48 hours`, at: a.created_at },
    ...(a.verified_at ? [{ cls: 'ok', b: 'Account verified', small: `${dayTime(a.verified_at)}${a.verified_name ? ` · by ${a.verified_name}` : ' · name matched'}`, at: a.verified_at }] : []),
    ...a.failures.map(f => ({
      cls: 'err',
      b: `${monthLabel(f.month, { bare: true })} payout failed`,
      small: [f.settled_at ? day(f.settled_at) : null, f.bank_name ? `${f.bank_name} ••••${f.last4}` : null, f.reason].filter(Boolean).join(' · '),
      at: f.settled_at ?? '',
    })),
    ...a.history
      .filter(h => h.verified_at)
      .map(h => ({ cls: 'ok', b: 'Earlier account verified', small: `${day(h.verified_at!)} · ${h.bank_name} ••••${h.account_last4}${h.verified_name ? ` · by ${h.verified_name}` : ''}`, at: h.verified_at! })),
  ].sort((x, y) => (y.at > x.at ? 1 : -1));

  const left = (
    <>
      <div className="panel">
        <div className="panel__head">
          <h2>Submitted details</h2>
        </div>
        <div className="panel__body">
          <dl className="kv">
            <dt>Author</dt>
            <dd>
              <Link className="link" href={`/authors/${a.author_id}`}>
                {a.name}
              </Link>
              {a.pen_name && a.pen_name !== a.name ? ` · ${a.pen_name}` : ''}
            </dd>
            <dt>Account</dt>
            <dd>
              {`${a.bank_name} · `}
              <span className="mono">{`••••${a.account_last4}`}</span>
            </dd>
            <dt>Name from the bank</dt>
            <dd>
              <b>{a.bank_account_name}</b>
            </dd>
            <dt>Legal name on application</dt>
            <dd>
              <b>{a.legal_name || 'Not on file'}</b>
            </dd>
            <dt>Match</dt>
            <dd>
              <b>{`${score}%`}</b>
              {score >= AUTO_VERIFY ? ' fuzzy match, verified on its own' : ` fuzzy match, below ${AUTO_VERIFY}%`}
            </dd>
            {a.held.length > 0 && (
              <>
                <dt>Held payout</dt>
                <dd>
                  {a.held
                    .map(h => `${monthLabel(h.month, { bare: true })} ${naira(h.kobo)}${h.status === 'partly_failed' ? ' failed' : ''}`)
                    .join(' · ')}
                </dd>
              </>
            )}
            {a.rejected_reason && (
              <>
                <dt>Rejected</dt>
                <dd>{a.rejected_reason}</dd>
              </>
            )}
          </dl>
          <div className="meter">
            <i className={score >= AUTO_VERIFY ? 'ok' : score >= 60 ? 'warn' : 'err'} style={{ ['--v' as string]: `${score}%` }}></i>
          </div>
          <p className="hint">
            {score >= AUTO_VERIFY
              ? 'The bank’s name matches the legal name closely enough to verify on its own.'
              : 'Compare the two names. Shortened first names and a missing middle name are common; a different surname is not.'}
          </p>
        </div>
      </div>
      <details className="fold">
        <summary>
          More details <small>change history</small>
        </summary>
        <div className="fold__b">
          <dl className="kv">
            <dt>Submitted</dt>
            <dd>{`${dayTime(a.created_at)} from the author app`}</dd>
            <dt>Previous account</dt>
            <dd>{previous ? `${previous.bank_name} ••••${previous.account_last4} (replaced)` : 'None'}</dd>
          </dl>
          <div className="tl">
            {timeline.map(t => (
              <div key={t.b + t.at} className={`tl__i ${t.cls}`}>
                <b>{t.b}</b>
                <small>{t.small}</small>
              </div>
            ))}
          </div>
        </div>
      </details>
    </>
  );

  const idDocument = a.id_document_key ? (
    <div className="file">
      <span>
        <b>ID document</b>
        <small>Uploaded by the author</small>
      </span>
      <ToastButton className="btn btn-g sm" label="Open" message="Opening the ID document in a new tab" />
    </div>
  ) : (
    <span className="muted">
      {a.document_requested_at
        ? `Asked for a document ${day(a.document_requested_at)}. Nothing uploaded yet.`
        : 'No ID document on file. Ask for one if the names alone don’t settle it.'}
    </span>
  );

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/bank-accounts">Bank accounts</Link>
          <Icon name="chev" size="s" />
          <span>{a.name}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>
              {a.name} <span className={st.cls}>{st.label}</span>
            </h1>
            <div className="ph__meta">
              {`${previous ? 'New ' : ''}${a.bank_name} account submitted ${dayTime(a.created_at)}`}
              {paused && ` · payouts paused until ${dayTime(a.payouts_resume_at)}`}
            </div>
          </div>
        </div>
      </div>
      <BankReview
        id={a.id}
        name={a.name}
        position={at >= 0 ? at + 1 : 0}
        total={queue.length}
        nextId={nextId === a.id ? null : nextId}
        decided={a.status !== 'needs_review'}
        left={left}
        idDocument={idDocument}
        flash={done}
      />
    </section>
  );
}
