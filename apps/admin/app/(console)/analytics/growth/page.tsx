import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { count, dash, num } from '../data';
import { period } from '../period';
import { AnalyticsFrame, Hbars, NoData } from '../shared';

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
  const funnelRes = await supabase.rpc('staff_analytics_funnel', { p_from: p.from, p_to: p.to });
  const f = (funnelRes.data as unknown as Funnel | null) ?? {};
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
          value: dash,
          sub: 'From Google Play',
          explain: 'Installs come from the Google Play and App Store import, which is not connected yet.',
        },
        {
          label: 'New subscribers',
          value: f.subscribed == null ? dash : count(f.subscribed),
          sub: f.subscribed != null && top ? `${pct(f.subscribed, top)} of sign-ups` : 'Starts with subscriptions',
          explain: 'Readers who signed up in the period and then subscribed (Supabase and RevenueCat).',
        },
        {
          label: 'Day 30 retention',
          value: dash,
          sub: 'Starts with reading sessions',
          explain: 'Share of a sign-up week that came back on day 30, from reading sessions.',
        },
        {
          label: 'Monthly churn',
          value: dash,
          sub: 'Subscribers who left',
          explain: 'Subscribers who did not renew in the last 30 days, once subscriptions go live.',
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
                      Installs join the funnel once the store import is connected.
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
            {signups == null ? (
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
        <NoData why="Day 1, 7 and 30 come from reading sessions, which start with the Reading flow." />
      </div>
      <details className="fold">
        <summary>
          Churn and promo conversions <small>by plan, trials and codes</small>
        </summary>
        <div className="fold__b">
          <b>Churn by plan, did not renew in the last 30 days</b>
          <NoData why="Starts when subscriptions go live." />
          <b>Trial and promo conversions</b>
          <NoData why="Starts when trials and promo codes go live." />
        </div>
      </details>
    </AnalyticsFrame>
  );
}
