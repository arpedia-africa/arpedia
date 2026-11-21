import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { serverSupabase } from '@/lib/supabase/server';
import { initials } from '../../../books/shared';
import { authorName, avClass, gate, loadAuthor } from '../../shared';
import { ToastLink } from '../../toast-link';
import { HoldSwitch, PayoutActions } from '../client';

/**
 * Author payout account (s-author-payout). Flow 13 owns bank data, payout history and holds, so the
 * blocks say so where nothing exists yet.
 */
export default async function AuthorPayoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate();
  if ('denied' in g) return g.denied;
  const supabase = await serverSupabase();
  const r = await loadAuthor(supabase, id);
  if ('denied' in r) return <NoAccess page="applications" label="Authors and applications" role={g.staff.role} />;
  if ('missing' in r) notFound();
  const a = r.author;
  const name = authorName(a);
  const paused = a.profile.payouts_paused;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/authors">Authors</Link>
          <Icon name="chev" size="s" />
          <Link href={`/authors/${id}`}>{name}</Link>
          <Icon name="chev" size="s" />
          <span>Payout account</span>
        </div>
        <div className="ph__row">
          <span className={`av lg ${avClass(id)}`}>{initials(name)}</span>
          <div className="ph__title">
            <h1>{name}</h1>
            <div className="ph__meta">
              <span>{paused ? 'Payouts paused' : 'Payouts on'}</span>
              <span>Next payout details arrive with payouts</span>
            </div>
          </div>
          <PayoutActions name={name} />
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Account</h2>
                <span className="st st-warn">Not set</span>
              </div>
              <div className="panel__body">
                <div className="empty" style={{ padding: '32px 16px' }}>
                  <b>Payout account details arrive with payouts</b>
                  <span>Bank, account number and the name check show here once {name.split(' ')[0]} adds an account.</span>
                </div>
                {a.profile.legal_name && (
                  <dl className="kv">
                    <dt>Legal name on file</dt>
                    <dd>{a.profile.legal_name}</dd>
                    {a.profile.payee_type && (
                      <>
                        <dt>Account type</dt>
                        <dd>{a.profile.payee_type === 'company' ? 'Company' : 'Individual · WHT not applied'}</dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Payout history</h2>
              </div>
              <div className="empty" style={{ padding: '40px 24px' }}>
                <b>No payouts yet</b>
                <span>Each monthly payout, with its transfer reference, shows here once payouts begin.</span>
              </div>
              <div className="pager">
                <span>Statements</span>
                <div className="row">
                  <ToastLink className="btn btn-g sm" msg="Statements arrive with payouts (flow 13).">
                    <Icon name="down" />
                    Statement PDF
                  </ToastLink>
                </div>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Hold</h2>
              </div>
              <div className="panel__body">
                <div className="setrow">
                  <div className="setrow__b">
                    <b>Pause payouts for this author</b>
                    <small>Keeps their earnings until you turn it off</small>
                  </div>
                  <HoldSwitch on={paused} />
                </div>
                <div className="f">
                  <label>Reason</label>
                  <span className="muted">
                    {paused ? (a.profile.payouts_paused_reason ?? 'No reason was recorded.') : 'Payouts are on. A reason is asked for when you pause.'}
                  </span>
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>verification history, change requests</small>
              </summary>
              <div className="fold__b">
                <b>Verification history</b>
                <span className="muted">Nothing yet. Account checks show here once an account is added.</span>
                <b>Change requests</b>
                <span className="muted">None open.</span>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
