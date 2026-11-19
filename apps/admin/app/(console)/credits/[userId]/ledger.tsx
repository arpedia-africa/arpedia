import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ledgerDate, ledgerDay, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Empty, avClass, guard, initials, n0, planName } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { Flash } from './flash';
import { FILTERS, filterOf, refOf, typeLabel, userCode, type Filter } from './labels';

const LIMIT = 500;
const SPENT = ['unlock_all', 'chapter', 'undo', 'tip', 'message', 'gift_out'];

/**
 * Reader: Credits (s-user-credits): the full ledger with reference ids and a running balance, so Support
 * can explain any balance without engineers (rule 29). Grant credits is in the header.
 */
export async function LedgerScreen({ userId, type, done }: { userId: string; type?: string; done?: string }) {
  const { denied } = await guard('credits', 'Credits');
  if (denied) return denied;

  const supabase = await serverSupabase();
  const [profile, balances, sub, ledger, count, rules] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username').eq('id', userId).maybeSingle(),
    supabase.from('credit_balances').select('plan, rollover, topup, promo').eq('user_id', userId).maybeSingle(),
    supabase
      .from('subscriptions')
      .select('plan_code, store, status, period_start, period_end')
      .eq('user_id', userId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('credit_ledger')
      .select(
        `id, created_at, reason, delta, bucket, txn_id, ref_id, book_id, chapter_id, actor_id, note,
         balance_after, ref_ledger_id, counterparty_user_id`,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(LIMIT),
    supabase.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('pricing_rule_versions').select('rules').lte('effective_at', new Date().toISOString()).order('effective_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (ledger.error) throw ledger.error;
  if (!profile.data) notFound();
  const p = profile.data;
  const name = p.full_name || (p.username ? `@${p.username}` : 'Reader');
  const first = name.split(' ')[0]!;
  const rows = ledger.data;
  const undoMinutes = Number((rules.data?.rules as { undo_minutes?: number } | null)?.undo_minutes ?? 10);

  // Names and titles the rows mention.
  const ids = (key: 'book_id' | 'chapter_id') => [...new Set(rows.flatMap(r => (r[key] ? [r[key]] : [])))];
  const people = [...new Set(rows.flatMap(r => [r.counterparty_user_id, r.actor_id]).filter((x): x is string => !!x))];
  const [books, chapters, who] = await Promise.all([
    ids('book_id').length ? supabase.from('books').select('id, title').in('id', ids('book_id')) : { data: [] },
    ids('chapter_id').length ? supabase.from('chapters').select('id, title').in('id', ids('chapter_id')) : { data: [] },
    people.length ? supabase.from('profiles').select('id, full_name').in('id', people) : { data: [] },
  ]);
  const book = (id: string | null) => (books.data ?? []).find(b => b.id === id)?.title;
  const chapter = (id: string | null) => (chapters.data ?? []).find(c => c.id === id)?.title;
  const person = (id: string | null) => (who.data ?? []).find(w => w.id === id)?.full_name || 'a reader';

  // A charge is one row per bucket (same txn_id); Return sits on the first row, once its undo window ended.
  const returned = new Set(rows.flatMap(r => (r.ref_ledger_id ? [r.ref_ledger_id] : [])));
  const returnedTxn = new Set(rows.filter(r => returned.has(r.id)).map(r => r.txn_id));
  const seenCharge = new Set<string>();
  const canReturn = new Map<number, boolean>();
  for (const r of [...rows].reverse()) {
    if (r.reason !== 'chapter' || r.delta >= 0 || seenCharge.has(r.txn_id)) continue;
    seenCharge.add(r.txn_id);
    canReturn.set(r.id, !returnedTxn.has(r.txn_id) && Date.now() - new Date(r.created_at).getTime() > undoMinutes * 60_000);
  }

  const detail = (r: (typeof rows)[number]) => {
    const staff = !!r.actor_id;
    const where = [book(r.book_id), chapter(r.chapter_id)].filter(Boolean).join(', ');
    const note = r.note ?? '';
    switch (r.reason) {
      case 'unlock_all':
      case 'chapter':
        return where || 'A book';
      case 'undo':
        return [where || 'A chapter', staff ? person(r.actor_id) : '', note].filter(Boolean).join(' · ');
      case 'message':
        return `Message to ${person(r.counterparty_user_id)}`;
      case 'tip':
        return `Tip to ${person(r.counterparty_user_id)}`;
      case 'gift_out':
        return `To ${person(r.counterparty_user_id)}`;
      case 'gift_in':
        return `From ${person(r.counterparty_user_id)}`;
      case 'staff_adjust':
        return [note, person(r.actor_id)].filter(Boolean).join(' · ');
      case 'plan_grant':
        return note || 'Plan credits granted';
      case 'rollover':
        return note || 'Unused plan credits rolled over';
      case 'top_up':
        return note || `${n0(r.delta)} credits`;
      case 'expiry':
        return note || 'Credits expired';
      default:
        return note;
    }
  };

  // The four figures in the header, for the current plan period.
  const since = sub.data?.period_start ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const inPeriod = rows.filter(r => r.created_at >= since);
  const planGrant = inPeriod.filter(r => r.reason === 'plan_grant').reduce((n, r) => n + r.delta, 0);
  const toppedUp = inPeriod.filter(r => r.reason === 'top_up').reduce((n, r) => n + r.delta, 0);
  const spent = -inPeriod.filter(r => SPENT.includes(r.reason)).reduce((n, r) => n + r.delta, 0);
  const b = balances.data;
  const balance = b ? b.plan + b.rollover + b.topup + b.promo : 0;

  const withFilter = rows.map(r => ({ r, f: filterOf(r.reason, !!r.actor_id) }));
  const current = (FILTERS.some(f => f[0] === type) ? type : 'all') as Filter | 'all';
  const shown = current === 'all' ? withFilter : withFilter.filter(x => x.f === current);
  const total = count.count ?? rows.length;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/users">Readers</Link>
          <Icon name="chev" size="s" />
          <Link href={`/users/${userId}`}>{name}</Link>
          <Icon name="chev" size="s" />
          <span>Credits</span>
        </div>
        <div className="ph__row">
          <span className={`av lg ${avClass(userId)}`}>{initials(name)}</span>
          <div className="ph__title">
            <h1>{name}</h1>
            <div className="ph__meta">
              <span>
                Balance <b>{n0(balance)}</b>
                {` (about ${naira(balance * 300)})`}
              </span>
              <span>
                Plan grant <b>{n0(planGrant)}</b>
              </span>
              <span>
                Topped up <b>{n0(toppedUp)}</b>
              </span>
              <span>
                Spent <b>{n0(spent)}</b>
              </span>
              <span className="mono">{userCode(userId)}</span>
              {sub.data && (
                <span>
                  {`${planName(sub.data.plan_code)} · period ${ledgerDay(sub.data.period_start)} to ${ledgerDay(sub.data.period_end)}`}
                </span>
              )}
            </div>
          </div>
          <div className="ph__acts">
            <Link className="btn btn-p" href={`/credits/${userId}/grant`}>
              Grant credits
            </Link>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected="false" href={`/users/${userId}`}>
          Overview
        </Link>
        <Link role="tab" aria-selected="true" className="is-selected" href={`/credits/${userId}`}>
          Credits
        </Link>
        <Link role="tab" aria-selected="false" href={`/users/${userId}/activity`}>
          Reading and devices
        </Link>
        <Link role="tab" aria-selected="false" href={`/users/${userId}/safety`}>
          Safety
        </Link>
      </div>
      <div className="page">
        <div className="row">
          {FILTERS.map(([key, label]) => (
            <Link
              key={key}
              className={`fchip${current === key ? ' is-selected' : ''}`}
              href={key === 'all' ? `/credits/${userId}` : `/credits/${userId}?type=${key}`}
            >
              {label}
              <span className="c">{n0(key === 'all' ? withFilter.length : withFilter.filter(x => x.f === key).length)}</span>
            </Link>
          ))}
        </div>
        <div className="panel panel--flush">
          {shown.length === 0 ? (
            <Empty
              title={rows.length ? 'Nothing of this type' : 'No credit history yet'}
              text={
                rows.length
                  ? 'Pick another type to see the rest of the ledger.'
                  : `${first} has no credit movements. Plan credits, top-ups, unlocks and grants show here as they happen.`
              }
            />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Detail</th>
                    <th>Reference</th>
                    <th className="r">Credits</th>
                    <th className="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ r }) => (
                    <tr key={r.id}>
                      <td className="nw">{ledgerDate(r.created_at)}</td>
                      <td>
                        {r.reason === 'refund' ? (
                          <span className="st st-err">{typeLabel(r.reason, false)}</span>
                        ) : (
                          typeLabel(r.reason, !!r.actor_id)
                        )}
                      </td>
                      <td>
                        {detail(r)}
                        {canReturn.get(r.id) && (
                          <>
                            {' · '}
                            <Link className="link" href={`/credits/${userId}/return/${r.id}`}>
                              Return
                            </Link>
                          </>
                        )}
                      </td>
                      <td className="mono">{refOf(r)}</td>
                      <td className={`n ${r.delta < 0 ? 'pp-neg' : 'pp-pos'}`}>{`${r.delta < 0 ? '−' : '+'}${n0(Math.abs(r.delta))}`}</td>
                      <td className="n">{r.balance_after === null ? '' : n0(r.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>
              {total > rows.length
                ? `Latest ${n0(rows.length)} of ${n0(total)} entries · older ones are in the export`
                : `${n0(total)} entr${total === 1 ? 'y' : 'ies'} · every credit movement is here`}
            </span>
            <div className="row">
              <a className="btn btn-g sm" href={`/credits/${userId}/export`} download>
                Export ledger
              </a>
            </div>
          </div>
        </div>
      </div>
      {done && <Flash msg={done} />}
    </section>
  );
}
