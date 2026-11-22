import type { Metadata } from 'next';
import Link from 'next/link';
import { ledgerDay, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { Chips, Empty, PAGE_SIZE, PLATFORM, Pager, avClass, dayMonth, guard, initials, n0, pageNo, planName, safeTerm } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { Menu } from '../books/menu';
import { RowLink } from '../books/row';

export const metadata: Metadata = { title: 'Subscriptions · Arpedia Admin' };

interface Search {
  status?: string;
  q?: string;
  store?: string;
  plan?: string;
  page?: string;
}

const STATUSES = [
  ['active', 'Active'],
  ['grace', 'In grace period'],
  ['billing_retry', 'Billing retry'],
  ['cancelled', 'Cancelled'],
  ['expired', 'Expired'],
  ['refunded', 'Refunded'],
] as const;
type Status = (typeof STATUSES)[number][0] | 'paused';
const STATUS_LABEL: Record<string, string> = { ...Object.fromEntries(STATUSES), paused: 'Paused' };

/** Subscriptions (s-subscriptions): subscriber list with plan and status. Only grace period and billing retry carry a pill. */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { denied } = await guard('subscriptions', 'Subscriptions');
  if (denied) return denied;

  const supabase = await serverSupabase();
  const status = STATUSES.find(s => s[0] === sp.status)?.[0];
  const store = sp.store && sp.store in PLATFORM ? (sp.store as 'play' | 'web' | 'app_store') : undefined;
  const plan = sp.plan === 'monthly' || sp.plan === 'quarterly' || sp.plan === 'yearly' ? sp.plan : undefined;
  const term = safeTerm(sp.q ?? '');
  const page = pageNo(sp.page);

  let ids: string[] = [];
  if (term) {
    const { data } = await supabase.from('profiles').select('id').or(`full_name.ilike.%${term}%,username.ilike.%${term}%`).limit(50);
    ids = (data ?? []).map(p => p.id);
  }
  const search = `store_original_txn_id.ilike.%${term}%${ids.length ? `,user_id.in.(${ids.join(',')})` : ''}`;
  const count = (s?: Status) => {
    let q = supabase.from('subscriptions').select('id', { count: 'exact', head: true });
    if (s) q = q.eq('status', s);
    if (store) q = q.eq('store', store);
    if (plan) q = q.eq('plan_code', plan);
    if (term) q = q.or(search);
    return q;
  };
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  let list = supabase
    .from('subscriptions')
    .select(
      `id, user_id, plan_code, store, status, auto_renew, period_end, pause_until, ended_at,
       user:profiles!subscriptions_user_id_fkey(full_name, username)`,
      { count: 'exact' },
    )
    .order('period_end', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) list = list.eq('status', status);
  if (store) list = list.eq('store', store);
  if (plan) list = list.eq('plan_code', plan);
  if (term) list = list.or(search);

  const [res, plans, all, expired30, ...counts] = await Promise.all([
    list,
    supabase.from('plans').select('code, price_play_kobo, price_web_kobo'),
    count(),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'expired').gte('period_end', since30),
    ...STATUSES.map(s => count(s[0])),
    ...(['monthly', 'quarterly', 'yearly'] as const).map(p =>
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('plan_code', p),
    ),
  ]);
  if (res.error) throw res.error;
  const rows = res.data;
  const total = res.count ?? rows.length;
  const n = (i: number) => counts[i]?.count ?? 0;
  const priceOf = (code: string, st: string) => {
    const p = (plans.data ?? []).find(x => x.code === code);
    return p ? naira(st === 'web' ? p.price_web_kobo : p.price_play_kobo) : '';
  };

  const href = (over: Partial<Search>) => {
    const next = { status: sp.status, q: sp.q, store: sp.store, plan: sp.plan, ...over };
    const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => !!e[1]));
    return `/subscriptions${qs.size ? `?${qs}` : ''}`;
  };

  const when = (s: (typeof rows)[number]) => {
    switch (s.status) {
      case 'grace':
        return `Grace ends ${dayMonth(s.period_end)}`;
      case 'billing_retry':
        return `Due ${dayMonth(s.period_end)}, retrying`;
      case 'cancelled':
        return `Ends ${ledgerDay(s.period_end)}`;
      case 'expired':
        return `Ended ${ledgerDay(s.period_end)}`;
      case 'refunded':
        return `Refunded ${dayMonth(s.ended_at ?? s.period_end)}`;
      case 'paused':
        return `Paused until ${s.pause_until ? ledgerDay(s.pause_until) : '—'}`;
      default:
        return ledgerDay(s.period_end);
    }
  };

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Subscriptions</h1>
          </div>
          <div className="band__acts">
            <Link className="ib" href="/exports" aria-label="Export subscriptions">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__l">Active</span>
            <span className="kpi__v">{n0(n(0))}</span>
            <span className="kpi__d">{`Monthly ${n0(n(6))} · Quarterly ${n0(n(7))} · Yearly ${n0(n(8))}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">In grace period</span>
            <span className="kpi__v">{n0(n(1))}</span>
            <span className="kpi__d">Still have access</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Billing retry</span>
            <span className="kpi__v">{n0(n(2))}</span>
            <span className="kpi__d">Store is retrying the card</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Expired, last 30 days</span>
            <span className="kpi__v">{n0(expired30.count ?? 0)}</span>
            <span className="kpi__d">Lost access</span>
          </div>
        </div>
        <div className="toolbar">
          <form action="/subscriptions" method="get" style={{ display: 'contents' }}>
            {(['status', 'store', 'plan'] as const).map(k => (sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null))}
            <label className="search">
              <Icon name="search" size="s" />
              <input name="q" defaultValue={sp.q} placeholder="Reader name, username or store id" aria-label="Search subscriptions" />
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
            <Link href={href({ store: 'play' })}>Platform: Google Play</Link>
            <Link href={href({ store: 'app_store' })}>Platform: App Store</Link>
            <Link href={href({ store: 'web' })}>Platform: Web</Link>
            <Link href={href({ plan: 'monthly' })}>Plan: Monthly</Link>
            <Link href={href({ plan: 'quarterly' })}>Plan: Quarterly</Link>
            <Link href={href({ plan: 'yearly' })}>Plan: Yearly</Link>
            {(store || plan) && <Link href={href({ store: undefined, plan: undefined })}>Clear platform and plan</Link>}
          </Menu>
          <Chips
            items={[
              { href: href({ status: undefined }), label: 'All', count: all.count ?? 0, on: !status },
              ...STATUSES.map(([key, label], i) => ({ href: href({ status: key }), label, count: n(i), on: status === key })),
            ]}
          />
        </div>
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <Empty
              title="No subscriptions"
              text={
                term || status || store || plan
                  ? 'Nothing matches. Clear the search or filters to see every subscriber.'
                  : 'Subscribers show here once readers buy a plan.'
              }
            />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reader</th>
                    <th>Plan</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Renews or ends</th>
                    <th>Auto-renew</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => {
                    const name = s.user?.full_name || (s.user?.username ? `@${s.user.username}` : 'Reader');
                    return (
                      <RowLink key={s.id} href={`/subscriptions/${s.id}`}>
                        <td>
                          <div className="who">
                            <span className={`av sm ${avClass(s.user_id)}`}>{initials(name)}</span>
                            <span>
                              <b>{name}</b>
                              {s.user?.username && <small>{`@${s.user.username}`}</small>}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="who">
                            <span>
                              <b>{planName(s.plan_code)}</b>
                              <small>{priceOf(s.plan_code, s.store)}</small>
                            </span>
                          </div>
                        </td>
                        <td>{PLATFORM[s.store] ?? s.store}</td>
                        <td>
                          {s.status === 'grace' || s.status === 'billing_retry' ? (
                            <span className="st st-warn">{STATUS_LABEL[s.status]}</span>
                          ) : (
                            <span className="st-plain">{STATUS_LABEL[s.status] ?? s.status}</span>
                          )}
                        </td>
                        <td className="nw">{when(s)}</td>
                        <td>{s.auto_renew ? 'On' : 'Off'}</td>
                      </RowLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} shown={rows.length} total={total} noun="subscriptions" href={p => href({ page: String(p) })} />
        </div>
      </div>
    </section>
  );
}
