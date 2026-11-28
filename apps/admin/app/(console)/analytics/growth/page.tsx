import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { change, count, dash, num } from '../data';
import { period } from '../period';
import { AnalyticsFrame, Hbars, NoData } from '../shared';
import {
  EMPTY_GROWTH,
  EMPTY_IMPORTS,
  churnDelta,
  cohortRows,
  day30,
  promoLabel,
  sourceBars,
  type Growth,
  type Imports,
} from './growth';

export const metadata: Metadata = { title: 'Analytics: Growth · Arpedia Admin' };

type Step = 'installed' | 'signed_up' | 'interests' | 'role' | 'profile' | 'plans' | 'subscribed';
type Funnel = Partial<Record<Step, number | null>>;

const STEPS: { key: Step; label: string }[] = [
  { key: 'installed', label: 'Installed the app' },
  { key: 'signed_up', label: 'Signed up' },
  { key: 'interests', label: 'Picked interests' },
  { key: 'role', label: 'Chose a role' },
  { key: 'profile', label: 'Finished profile' },
  { key: 'plans', label: 'Saw the plans' },
  { key: 'subscribed', label: 'Subscribed' },
];

const pct = (a: number, b: number) => `${Math.round((100 * a) / b)}%`;

/** s-analytics-growth: installs to subscribers, the onboarding funnel, signups by source, retention and churn. */
export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = period((await searchParams).p);
  const staff = await requireStaff();
  if (!staff.permissions.includes('view_analytics'))
    return <NoAccess page="analytics" label="Analytics" role={staff.role} />;
  const supabase = await serverSupabase();
  const [funnelRes, growthRes, importsRes] = await Promise.all([
    supabase.rpc('staff_analytics_funnel', { p_from: p.from, p_to: p.to }),
    supabase.rpc('staff_analytics_growth', { p_from: p.from, p_to: p.to }),
    supabase.rpc('staff_analytics_imports', { p_from: p.from, p_to: p.to }),
  ]);
  const imp = (importsRes.data as unknown as Imports | null) ?? EMPTY_IMPORTS;
  // Installs open the funnel once the Play Console export has been imported (15-21).
  const f: Funnel = { ...((funnelRes.data as unknown as Funnel | null) ?? {}), installed: imp.installs };
  const g = (growthRes.data as unknown as Growth | null) ?? EMPTY_GROWTH;
  const sources = sourceBars(imp.sources);
  const cohorts = cohortRows(g);
  const d30 = day30(cohorts);
  const churn = g.churn;
  const rate = (n: number | null) => (n == null ? dash : `${n.toLocaleString('en-NG', { maximumFractionDigits: 1 })}%`);
  const signups = f.signed_up ?? null;

  // Steps with a count; the first one is 100% and each next shows its share of the step before.
  const steps = STEPS.filter(s => f[s.key] != null).map(s => ({ ...s, n: f[s.key]! }));
  const top = steps[0]?.n ?? 0;
  let drop: { from: string; to: string; left: number } | null = null;
  steps.forEach((s, i) => {
    const prev = steps[i - 1];
    if (!prev || !prev.n) return;
    const left = 1 - s.n / prev.n;
    if (!drop || left > drop.left) drop = { from: prev.label, to: s.label, left };
  });
  const biggest = drop as { from: string; to: string; left: number } | null;

  return (
    <AnalyticsFrame
      tab="growth"
      period={p.key}
      kpis={[
        {
          label: 'Installs',
          value: imp.installs == null ? dash : count(imp.installs),
          delta: change(imp.installs, imp.installs_previous),
          sub: 'From Google Play',
          explain: imp.installs_through
            ? `New users who installed from Google Play, from the Play Console export (imported nightly; a day or two behind; last day ${new Date(imp.installs_through).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}).`
            : 'New users who installed from Google Play, from the Play Console export. Nothing has been imported yet.',
        },
        {
          label: 'New subscribers',
          value: f.subscribed == null ? dash : count(f.subscribed),
          sub:
            f.subscribed != null && top
              ? `${pct(f.subscribed, top)} of ${imp.installs ? 'installs' : 'sign-ups'}`
              : 'Starts with subscriptions',
          explain: 'Readers who signed up in the period and then subscribed (Supabase and RevenueCat).',
        },
        {
          label: 'Day 30 retention',
          value: d30 ? `${d30.pct}%` : dash,
          delta: d30?.delta,
          sub: d30 ? d30.label : 'No sign-up week is 30 days old yet',
          explain:
            'Share of the newest sign-up week 30 days old that read again (30 seconds or more) on day 30, against the week before.',
        },
        {
          label: 'Monthly churn',
          value: rate(churn.rate),
          delta: churnDelta(churn.rate, churn.previous),
          sub: churn.rate == null ? 'Shown from 5 subscribers' : 'subscribers who left',
          explain:
            'Subscriptions live when the 30 days to the period end began that ended (expired or refunded) in them, against the 30 days before.',
        },
      ]}
    >
      <div className="split">
        <div className="panel">
          <div className="panel__head">
            <h2>Onboarding funnel</h2>
          </div>
          <div className="panel__body">
            {steps.length === 0 ? (
              <NoData why="Counts readers who signed up in the period, step by step. Groups under 5 are hidden." />
            ) : (
              <>
                <div className="funnel">
                  {steps.map((s, i) => (
                    <div key={s.key} className="fn">
                      <span>{s.label}</span>
                      <span>
                        <i className="bar" style={{ '--v': `${(100 * s.n) / top}%`, display: 'block' } as CSSProperties} />
                      </span>
                      <b>{num(s.n)}</b>
                      <small>{i === 0 ? '100%' : pct(s.n, steps[i - 1]!.n)}</small>
                    </div>
                  ))}
                </div>
                {biggest && biggest.left > 0 && (
                  <div className="note warn">
                    <span className="grow">
                      <b>{`Biggest drop: ${biggest.from.toLowerCase()} to ${biggest.to.toLowerCase()} (${Math.round(100 * biggest.left)}% leave)`}</b>
                      {imp.installs == null && 'Installs join the funnel once the store import has run.'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel__head">
            <h2>Signups by source</h2>
          </div>
          <div className="panel__body">
            {sources.length ? (
              <Hbars
                rows={sources.map(r => ({ label: r.label, share: r.share, value: count(r.signups, true), muted: r.muted }))}
              />
            ) : signups == null ? (
              <NoData why="Uses the link or referral code each reader came with." />
            ) : (
              <Hbars rows={[{ label: 'Unknown', share: 100, value: count(signups, true), muted: true }]} />
            )}
          </div>
        </div>
      </div>
      <div className="panel panel--flush">
        <div className="panel__head">
          <h2>Retention by sign-up week</h2>
        </div>
        {cohorts.length === 0 ? (
          <NoData why="Readers who signed up each week, and the share who read again on day 1, 7 and 30." />
        ) : (
          <div className="tw">
            <table className="tbl sy-heat">
              <thead>
                <tr>
                  <th>Sign-up week</th>
                  <th className="r">Readers</th>
                  <th className="c">Day 1</th>
                  <th className="c">Day 7</th>
                  <th className="c">Day 30</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map(r => (
                  <tr key={r.week}>
                    <td className="nw">{r.label}</td>
                    <td className="n">{r.partial ? `${count(r.size, true)} so far` : count(r.size, true)}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} className={c.state === 'ready' ? 'h' : 'h blank'}>
                        {c.state === 'ready' ? `${c.pct}%` : c.state === 'young' ? c.label : dash}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <details className="fold">
        <summary>
          Churn and promo conversions <small>by plan, trials and codes</small>
        </summary>
        <div className="fold__b">
          <b>Churn by plan, did not renew in the last 30 days</b>
          {churn.plans.length === 0 ? (
            <NoData why="Subscriptions live 30 days ago, and how many ended since." />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="r">Subscribers</th>
                    <th className="r">Left</th>
                    <th className="r">Churn</th>
                    <th>Main reason</th>
                  </tr>
                </thead>
                <tbody>
                  {churn.plans.map(c => (
                    <tr key={c.plan}>
                      <td>
                        <b>{c.plan}</b>
                      </td>
                      <td className="n">{count(c.subscribers, true)}</td>
                      <td className="n">{c.subscribers == null ? dash : num(c.left)}</td>
                      <td className="n">{rate(c.rate)}</td>
                      <td className="muted">{c.reason ?? dash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <b>Trials and promo conversions</b>
          {g.promos.length === 0 ? (
            <NoData why="Promo codes redeemed in the period, and how many of those readers paid after." />
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Offer</th>
                    <th className="r">Started</th>
                    <th className="r">Paid after</th>
                    <th className="r">Converted</th>
                  </tr>
                </thead>
                <tbody>
                  {g.promos.map(o => (
                    <tr key={o.code}>
                      <td>
                        <b>{o.code}</b> <small className="faint">{promoLabel(o)}</small>
                      </td>
                      <td className="n">{count(o.started, true)}</td>
                      <td className="n">{o.paid == null ? dash : num(o.paid)}</td>
                      <td className="n">{rate(o.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </AnalyticsFrame>
  );
}
