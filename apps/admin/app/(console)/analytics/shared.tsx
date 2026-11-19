'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { PERIODS, type PeriodKey } from './period';

type Tab = 'overview' | 'growth' | 'reading';
const TABS: { key: Tab; href: string; label: string }[] = [
  { key: 'overview', href: '/analytics', label: 'Overview' },
  { key: 'growth', href: '/analytics/growth', label: 'Growth' },
  { key: 'reading', href: '/analytics/reading', label: 'Reading' },
];

export interface Kpi {
  label: string;
  value: string;
  /** Change against the previous period, e.g. { text: '+5.4%', up: true }. */
  delta?: { text: string; up: boolean } | null;
  sub: string;
  /** Tap-to-explain line: where the figure comes from (rule 28). */
  explain: string;
}

/** Band with the period buttons and Export, the three tabs, four tap-to-explain numbers, then the page. */
export function AnalyticsFrame({
  tab,
  period,
  kpis,
  children,
}: {
  tab: Tab;
  period: PeriodKey;
  kpis: Kpi[];
  children: ReactNode;
}) {
  const [toastNode, showToast] = useToast();
  const base = TABS.find(t => t.key === tab)!.href;
  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Analytics</h1>
          </div>
          <div className="band__acts">
            <div className="seg">
              {PERIODS.map(p => (
                <Link
                  key={p.key}
                  href={p.key === '7' ? base : `${base}?p=${p.key}`}
                  className={p.key === period ? 'is-selected' : undefined}
                  aria-current={p.key === period ? 'true' : undefined}
                  scroll={false}
                >
                  {p.label}
                </Link>
              ))}
            </div>
            <Link className="ib" href="/exports" aria-label="Export">
              <Icon name="down" />
            </Link>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <Link
            key={t.key}
            role="tab"
            aria-selected={t.key === tab}
            className={t.key === tab ? 'is-selected' : undefined}
            href={period === '7' ? t.href : `${t.href}?p=${period}`}
            scroll={false}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="page">
        <div className="kpis">
          {kpis.map(k => (
            <button
              key={k.label}
              type="button"
              className="kpi"
              style={{ border: 0, background: 'none', font: 'inherit', textAlign: 'left' }}
              title={k.explain}
              onClick={() => showToast(k.explain)}
            >
              <span className="kpi__l">{k.label}</span>
              <span className="kpi__v">{k.value}</span>
              <span className="kpi__d">
                {k.delta && <span className={k.delta.up ? 'up' : 'down'}>{k.delta.text}</span>}
                {k.sub}
              </span>
            </button>
          ))}
        </div>
        {children}
      </div>
      {toastNode}
    </section>
  );
}

/** "No data for this period" inside a chart panel: never a flat line drawn as success. */
export function NoData({ why }: { why: string }) {
  return (
    <div className="empty">
      <b>No data for this period</b>
      <span>{why}</span>
    </div>
  );
}

const num = (n: number) => Math.round(n).toLocaleString('en-NG');
const hrs = (n: number) => `${num(n)} h`;

const v = (share: number) => ({ '--v': `${Math.max(0, Math.min(100, share)).toFixed(1)}%` }) as CSSProperties;

/** Horizontal bars: label, track, value. `muted` rows use the night colour (as "Unknown" and the long tail). */
export function Hbars({ rows }: { rows: { label: string; share: number; value: string; muted?: boolean }[] }) {
  return (
    <div className="hbars">
      {rows.map(r => (
        <div key={r.label} className="hb">
          <span title={r.label}>{r.label}</span>
          <span className="track">
            <i className={r.muted ? 'n' : undefined} style={v(r.share)} />
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

export interface Bucket {
  label: string;
  axis: string;
  values: Record<string, number | null>;
  now?: boolean;
}

/** Column chart with a Readers / Hours / Sessions switch; the last column (today) is drawn in night. */
export function Columns({
  title,
  buckets,
  series,
  legend,
  empty,
}: {
  title: string;
  buckets: Bucket[];
  series: { key: string; label: string; hours?: boolean }[];
  legend: Record<string, ReactNode>;
  empty: string;
}) {
  const [key, setKey] = useState(series[0]!.key);
  const unit = series.find(s => s.key === key)!.hours ? hrs : num;
  const max = Math.max(0, ...buckets.map(b => b.values[key] ?? 0));
  return (
    <div className="panel">
      <div className="panel__head">
        <h2>{title}</h2>
        {series.length > 1 && (
          <div className="seg">
            {series.map(s => (
              <button
                key={s.key}
                type="button"
                className={s.key === key ? 'is-selected' : undefined}
                aria-pressed={s.key === key}
                onClick={() => setKey(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="panel__body">
        {max === 0 ? (
          <NoData why={empty} />
        ) : (
          <div className="chart sy-dau">
            <div className="cols">
              {buckets.map(b => {
                const n = b.values[key];
                return (
                  <div
                    key={b.label}
                    className={b.now ? 'col now' : 'col'}
                    title={`${b.label}: ${n == null ? 'Fewer than 5' : unit(n)}`}
                  >
                    {n ? <i style={v((100 * n) / max)} /> : null}
                  </div>
                );
              })}
            </div>
            <div className="axis">
              {buckets.map(b => (
                <span key={b.label}>{b.axis}</span>
              ))}
            </div>
            <div className="legend">{legend[key]}</div>
          </div>
        )}
      </div>
    </div>
  );
}
