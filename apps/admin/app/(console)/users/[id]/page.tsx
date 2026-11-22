import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { NoteForm, PhoneReveal, ReaderActions } from '../reader-actions';
import { ReaderHeader, countryName, day, lastSeen, planLabel } from '../shared';
import { loadReader, readerRights } from './data';

export const metadata: Metadata = { title: 'Reader · Arpedia Admin' };

const PLAN_PRICE: Record<string, string> = {
  monthly: '₦900 every month',
  quarterly: '₦2,400 every 3 months',
  yearly: '₦8,400 every year',
};
const PLAN_CREDITS: Record<string, number> = { monthly: 300, quarterly: 800, yearly: 3000 };

/** People · Reader: Overview (s-user). */
export default async function ReaderOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaff();
  if (!canOpen('users', staff.permissions)) return <NoAccess page="users" label="Readers" role={staff.role} />;
  const r = await loadReader(id);
  const rights = readerRights(staff);
  const active = r.devices.filter(d => !d.revoked_at).length;
  const plan = r.plan;
  const google = r.sign_in.includes('google');

  return (
    <section className="screen enter">
      <ReaderHeader
        r={r}
        tab="overview"
        big
        actions={
          <ReaderActions
            id={r.id}
            name={r.name}
            isAuthor={r.is_author}
            deleted={!!r.deleted_at}
            devices={active}
            {...rights}
          />
        }
      />
      <div className="page">
        {r.deletion && ['pending', 'blocked'].includes(r.deletion.status) && (
          <div className={`note ${r.deletion.status === 'blocked' ? 'warn' : 'err'}`} style={{ marginBottom: 20 }}>
            <div className="grow">
              <b>{r.deletion.status === 'blocked' ? 'Deletion waiting' : 'Account deleted'}</b>
              {r.deletion.grace_until
                ? `Hidden and signed out. Erased on ${day(r.deletion.erase_after)} unless ${r.name.split(' ')[0]} signs in again.`
                : `Hidden and signed out. Personal data is erased by ${day(r.deletion.erase_after)}.`}
            </div>
          </div>
        )}
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Subscription</h2>
                <span className="st-plain">{plan ? (['active', 'grace', 'billing_retry'].includes(plan.status) ? 'Active' : 'Lapsed') : 'No plan'}</span>
              </div>
              <div className="panel__body">
                {plan ? (
                  <dl className="kv">
                    <dt>Plan</dt>
                    <dd>{planLabel(plan)}</dd>
                    <dt>Price</dt>
                    <dd>{PLAN_PRICE[plan.plan] ?? '—'}</dd>
                    <dt>Current period</dt>
                    <dd>{`${day(plan.period_start)} to ${day(plan.period_end)}`}</dd>
                    <dt>{['active', 'grace', 'billing_retry'].includes(plan.status) ? 'Renews' : 'Ended'}</dt>
                    <dd>{day(plan.period_end)}</dd>
                    <dt>Credits per period</dt>
                    <dd>{(PLAN_CREDITS[plan.plan] ?? 0).toLocaleString('en-NG')}</dd>
                  </dl>
                ) : (
                  <span className="muted">No plan yet. Store details show here once the reader subscribes.</span>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Credits</h2>
              </div>
              <div className="panel__body">
                <div className="pp-stat">
                  <span className="pp-big">{r.credits.toLocaleString('en-NG')}</span>
                  <span>{`credits now, worth about ₦${(r.credits * 3).toLocaleString('en-NG')}`}</span>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Unlocked books</h2>
                <span className="sub">{`${r.unlocked.length} book${r.unlocked.length === 1 ? '' : 's'} · stay in the library forever`}</span>
              </div>
              <div className="panel__body">
                {r.unlocked.length ? (
                  <div className="pp-covers">
                    {r.unlocked.slice(0, 10).map((b, i) => (
                      <div key={b.book_id}>
                        <span className={`cv c${(i % 6) + 1} x80`}></span>
                        <b>{b.title}</b>
                        <small>{`${lastSeen(b.at).replace(/^Today, .*/, 'Today')}${b.credits ? ` · ${b.credits} cr` : ''}`}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted">No unlocked books yet.</span>
                )}
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Profile</h2>
              </div>
              <div className="panel__body">
                <dl className="kv tight">
                  <dt>Email</dt>
                  <dd>{r.email ?? <span className="muted">Hidden for your role</span>}</dd>
                  <dt>Phone</dt>
                  <dd>
                    {r.email === null && r.has_phone ? (
                      <span className="muted">Hidden for your role</span>
                    ) : (
                      <PhoneReveal id={r.id} masked={r.phone} canReveal={rights.canReveal} />
                    )}
                  </dd>
                  <dt>Date of birth</dt>
                  <dd>{r.date_of_birth ? day(r.date_of_birth) : <span className="muted">Not given</span>}</dd>
                  <dt>Country</dt>
                  <dd>{countryName(r.country)}</dd>
                  <dt>Role</dt>
                  <dd>{r.is_author ? 'Reader and author' : 'Reader'}</dd>
                  <dt>Sign-in</dt>
                  <dd>{google ? 'Google' : 'Email and password'}</dd>
                </dl>
                {r.interests.length > 0 && (
                  <div>
                    <div className="hint">Interests chosen at sign-up</div>
                    <div className="pp-chips">
                      {r.interests.map(g => (
                        <span className="tag org" key={g}>
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                Notes and consent <small>{`${r.notes.length} note${r.notes.length === 1 ? '' : 's'}`}</small>
              </summary>
              <div className="fold__b">
                <b>
                  Staff notes <span className="faint">· only staff see these</span>
                </b>
                {r.notes.map(n => (
                  <div className="pp-note" key={n.id}>
                    <span>
                      <b>{n.author ?? 'Staff'}</b> · {lastSeen(n.at).replace(/^Today, .*/, 'Today')}
                    </span>
                    {n.body}
                  </div>
                ))}
                {rights.canAct && <NoteForm id={r.id} />}
                <b>Notification consent</b>
                <dl className="kv tight">
                  <dt>Offers</dt>
                  <dd>{r.consent.offers ? 'On' : 'Off'}</dd>
                  <dt>Changed</dt>
                  <dd>{r.consent.marketing_at ? day(r.consent.marketing_at) : 'Never'}</dd>
                  <dt>Terms</dt>
                  <dd>{r.consent.terms_version ? `Version ${r.consent.terms_version}` : 'Not recorded'}</dd>
                  <dt>Privacy</dt>
                  <dd>{r.consent.privacy_version ? `Version ${r.consent.privacy_version}` : 'Not recorded'}</dd>
                </dl>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
