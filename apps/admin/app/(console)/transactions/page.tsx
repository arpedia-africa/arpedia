import type { Metadata } from 'next';
import Link from 'next/link';
import { ledgerDate, naira } from '@arpedia/core';
import { ChipRemove } from '@/components/chip-remove';
import { Icon } from '@/components/icon';
import { Chips, Empty, PAGE_SIZE, PLATFORM, Pager, dayMonth, guard, n0, pageNo, planName, safeTerm, thisMonth } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { Menu } from '../books/menu';

export const metadata: Metadata = { title: 'Transactions · Arpedia Admin' };

interface Search {
  status?: string;
  q?: string;
  store?: string;
  kind?: string;
  range?: string;
  page?: string;
}

const STATUSES = ['succeeded', 'pending', 'refunded', 'failed'] as const;
const STATUS_LABEL: Record<string, string> = {
  succeeded: 'Succeeded',
  pending: 'Pending',
  refunded: 'Refunded',
  failed: 'Failed',
  disputed: 'Disputed',
};

/** Transactions (s-transactions): every payment in, from Google Play, App Store and web. Only Failed and Pending carry a pill. */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { denied } = await guard('transactions', 'Transactions');
  if (denied) return denied;

  const supabase = await serverSupabase();
  const month = thisMonth();
  const allDates = sp.range === 'all';
  const status = STATUSES.find(s => s === sp.status);
  const store = sp.store && sp.store in PLATFORM ? (sp.store as 'play' | 'web' | 'app_store') : undefined;
  const kind = sp.kind === 'plan' || sp.kind === 'topup' ? sp.kind : undefined;
  const term = safeTerm(sp.q ?? '');
  const page = pageNo(sp.page);

  // A reader's name matches through their profile; a reference matches the store id.
  let ids: string[] = [];
  if (term) {
    const { data } = await supabase.from('profiles').select('id').ilike('full_name', `%${term}%`).limit(50);
    ids = (data ?? []).map(p => p.id);
  }
  const base = () => {
    let q = supabase.from('transactions').select('id', { count: 'exact', head: true });
    if (!allDates) q = q.gte('created_at', month.iso);
    if (store) q = q.eq('store', store);
    if (kind) q = q.eq('kind', kind);
    if (term) q = q.or(`store_txn_id.ilike.%${term}%${ids.length ? `,user_id.in.(${ids.join(',')})` : ''}`);
    return q;
  };

  let list = supabase
    .from('transactions')
    .select(
      `id, created_at, kind, plan_code, topup_code, store, store_txn_id, gross_kobo, net_kobo, refunded_kobo,
       status, credits_granted, user:profiles!transactions_user_id_fkey(full_name, username)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (!allDates) list = list.gte('created_at', month.iso);
  if (store) list = list.eq('store', store);
  if (kind) list = list.eq('kind', kind);
  if (term) list = list.or(`store_txn_id.ilike.%${term}%${ids.length ? `,user_id.in.(${ids.join(',')})` : ''}`);
  if (status) list = list.eq('status', status);

  const [res, all, ...counts] = await Promise.all([
    list,
    base(),
    ...STATUSES.map(s => base().eq('status', s)),
  ]);
  if (res.error) throw res.error;
  const rows = res.data;
  const total = res.count ?? rows.length;

  const href = (over: Partial<Search>) => {
    const next = { status: sp.status, q: sp.q, store: sp.store, kind: sp.kind, range: sp.range, ...over };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return `/transactions${qs.size ? `?${qs}` : ''}`;
  };
  const active = [store && `Platform: ${PLATFORM[store]}`, kind && `Item: ${kind === 'plan' ? 'Plans' : 'Top-ups'}`].filter(Boolean);

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Transactions</h1>
          </div>
          <div className="band__acts">
            <Link className="ib" href="/exports" aria-label="Export CSV">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="toolbar">
          <form action="/transactions" method="get" style={{ display: 'contents' }}>
            {(['status', 'store', 'kind', 'range'] as const).map(k => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
            <label className="search">
              <Icon name="search" size="s" />
              <input name="q" defaultValue={sp.q} placeholder="Reader, reference or store id" aria-label="Search transactions" />
            </label>
          </form>
          <Menu
            left
            trigger={
              <>
                <Icon name="filter" />
                Filters
              </>
            }
          >
            <Link href={href({ store: 'play', page: undefined })}>Platform: Google Play</Link>
            <Link href={href({ store: 'app_store', page: undefined })}>Platform: App Store</Link>
            <Link href={href({ store: 'web', page: undefined })}>Platform: Web</Link>
            <Link href={href({ kind: 'plan', page: undefined })}>Item: Plans</Link>
            <Link href={href({ kind: 'topup', page: undefined })}>Item: Top-ups</Link>
          </Menu>
          {!allDates && (
            <span className="achip">
              {`Date: ${month.shortLabel}`}
              <ChipRemove href={href({ range: 'all', page: undefined })} />
            </span>
          )}
          {active.map(a => (
            <span className="achip" key={String(a)}>
              {a}
              <ChipRemove href={href({ store: undefined, kind: undefined, page: undefined })} />
            </span>
          ))}
          <Chips
            items={[
              { href: href({ status: undefined, page: undefined }), label: 'All', count: all.count ?? 0, on: !status },
              ...STATUSES.map((s, i) => ({
                href: href({ status: s, page: undefined }),
                label: STATUS_LABEL[s]!,
                count: counts[i]?.count ?? 0,
                on: status === s,
              })),
            ]}
          />
        </div>
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <Empty
              title="No transactions"
              text={
                term || status || store || kind
                  ? 'Nothing matches. Clear the search or filters to see every payment.'
                  : 'Payments from Google Play, App Store and web checkout show here as they come in.'
              }
            />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reader</th>
                    <th>Item</th>
                    <th className="r">Amount</th>
                    <th className="r">Net</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => {
                    // Net is what Arpedia receives: nothing yet while pending or failed, nothing left after a full refund.
                    const net = t.status === 'failed' || t.status === 'pending' ? 0 : Math.max(0, t.net_kobo - t.refunded_kobo);
                    const platform = PLATFORM[t.store] ?? t.store;
                    return (
                      <tr key={t.id}>
                        <td className="nw" title={ledgerDate(t.created_at)}>{`${dayMonth(t.created_at)}, ${ledgerDate(t.created_at).slice(-5)}`}</td>
                        <td>
                          <div className="who">
                            <span>
                              <b>{t.user?.full_name || (t.user?.username ? `@${t.user.username}` : 'Reader')}</b>
                              <small className="mn-id">{t.store_txn_id}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="who">
                            <span>
                              {t.kind === 'topup' ? (
                                <>
                                  <b>{`${n0(t.credits_granted)} credits`}</b>
                                  <small>{`${platform} top-up`}</small>
                                </>
                              ) : (
                                <>
                                  <b>{planName(t.plan_code)}</b>
                                  <small>{platform}</small>
                                </>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="n">{naira(t.gross_kobo)}</td>
                        <td className="n">{naira(net)}</td>
                        <td>
                          {t.status === 'failed' ? (
                            <span className="st st-err">Failed</span>
                          ) : t.status === 'pending' ? (
                            <span className="st st-warn">Pending</span>
                          ) : (
                            <span className="st-plain">{STATUS_LABEL[t.status] ?? t.status}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} shown={rows.length} total={total} noun="transactions" href={p => href({ page: String(p) })} />
        </div>
      </div>
    </section>
  );
}
