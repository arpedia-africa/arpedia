'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import {
  age,
  OUTCOME_LABEL,
  REASON_LABELS,
  SEVERITY_LABEL,
  TABS,
  TYPE_FILTERS,
  TYPE_LABEL,
  type ReportContentType,
  type ReportReason,
  type ReportTab,
  type Severity,
  type TypeFilter,
} from './labels';

export interface ReportRow {
  id: string;
  ref: string;
  type: ReportContentType;
  quote: string;
  place: string;
  author: string | null;
  reason: ReportReason;
  severity: Severity;
  reporters: number;
  createdAt: string;
  late: boolean;
  status: 'open' | 'auto_hidden' | 'resolved';
  outcome: string | null;
  assignee: string | null;
  escalated: boolean;
  brigading: boolean;
}

export interface ReportCounts {
  open: number;
  mine: number;
  resolved: number;
  auto_hidden: number;
}

const num = (n: number) => n.toLocaleString('en-NG');
const quoted = (r: ReportRow) =>
  r.type === 'book' || r.type === 'profile'
    ? r.quote
    : r.quote
      ? `"${r.quote.length > 90 ? `${r.quote.slice(0, 88)}…` : r.quote}"`
      : 'Content removed';

/** s-reports. Refreshes every 10 seconds and on focus (no Realtime). */
export function ReportsView({
  tab,
  type,
  rows,
  total,
  counts,
  failed,
}: {
  tab: ReportTab;
  type: TypeFilter;
  rows: ReportRow[];
  total: number;
  counts: ReportCounts | null;
  failed: boolean;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [reason, setReason] = useState<ReportReason | 'all'>('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');

  useEffect(() => {
    const tick = setInterval(() => document.visibilityState === 'visible' && router.refresh(), 10_000);
    const focus = () => router.refresh();
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', focus);
    };
  }, [router]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.mwrap')) setMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const typeCounts = useMemo(() => {
    const c: Partial<Record<TypeFilter, number>> = { all: rows.length };
    for (const r of rows) c[r.type as TypeFilter] = (c[r.type as TypeFilter] ?? 0) + 1;
    return c;
  }, [rows]);

  const t = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (reason === 'all' || r.reason === reason) &&
      (severity === 'all' || r.severity === severity) &&
      (!t ||
        r.ref.toLowerCase().includes(t) ||
        r.quote.toLowerCase().includes(t) ||
        (r.author ?? '').toLowerCase().includes(t.replace(/^@/, ''))),
  );
  const go = (params: { tab?: ReportTab; type?: TypeFilter }) => {
    const sp = new URLSearchParams();
    const nt = params.tab ?? tab;
    const ny = params.type ?? type;
    if (nt !== 'open') sp.set('tab', nt);
    if (ny !== 'all') sp.set('type', ny);
    router.push(`/reports${sp.size ? `?${sp}` : ''}`);
  };
  const tabLabel = TABS.find((x) => x.key === tab)?.label.toLowerCase() ?? 'open';

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Reports</h1>
          </div>
          <div className="band__acts">
            <a className="btn btn-n" href="/automod">
              Safety rules
            </a>
            <a
              className="ib"
              href="#export"
              aria-label="Export reports"
              onClick={(e) => {
                e.preventDefault();
                showToast('Exports arrive with a later part of the build.');
              }}
            >
              <Icon name="down" />
            </a>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <a
            key={x.key}
            role="tab"
            href={`/reports${x.key === 'open' ? '' : `?tab=${x.key}`}`}
            aria-selected={tab === x.key}
            className={tab === x.key ? 'is-selected' : undefined}
            onClick={(e) => {
              e.preventDefault();
              go({ tab: x.key });
            }}
          >
            {x.label} <span className="c">{num(counts?.[x.key] ?? 0)}</span>
          </a>
        ))}
      </div>
      <div className="page">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input
              placeholder="Search content, @username or report id"
              aria-label="Search reports"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="mwrap">
            <button type="button" className="fbtn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon name="filter" />
              Filters
            </button>
            {menu ? (
              <div className="menu sy-menul">
                {(['all', 'high', 'medium', 'low'] as const).map((s) => (
                  <a
                    key={s}
                    href={`#${s}`}
                    aria-current={severity === s ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      setSeverity(s);
                    }}
                  >
                    {s === 'all' ? 'Any severity' : SEVERITY_LABEL[s]}
                  </a>
                ))}
                <hr />
                {(['all', ...Object.keys(REASON_LABELS)] as (ReportReason | 'all')[]).map((k) => (
                  <a
                    key={k}
                    href={`#${k}`}
                    aria-current={reason === k ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      setReason(k);
                    }}
                  >
                    {k === 'all' ? 'Any reason' : REASON_LABELS[k]}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <span className="row">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`fchip${type === f.key ? ' is-selected' : ''}`}
                onClick={() => go({ type: f.key })}
              >
                {f.label}{' '}
                {type === 'all' || type === f.key ? (
                  <span className="c">{num(typeCounts[f.key] ?? 0)}</span>
                ) : null}
              </button>
            ))}
          </span>
        </div>
        <div className="panel panel--flush">
          {failed ? (
            <div className="empty">
              <b>Reports didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <b>{tab === 'resolved' ? 'No resolved reports yet' : 'Nothing to review'}</b>
              <span>{tab === 'resolved' ? 'Decided reports show here.' : 'High items due next: none.'}</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <b>Nothing matches</b>
              <span>Try other words, or clear the filters.</span>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={() => (setQ(''), setReason('all'), setSeverity('all'))}
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Content</th>
                    <th>Reason</th>
                    <th className="r">Reporters</th>
                    <th>Age</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.id}
                      data-go="report"
                      tabIndex={0}
                      onClick={() => router.push(`/reports/${r.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(`/reports/${r.id}`)}
                    >
                      <td>
                        {r.severity === 'high' ? (
                          <span className="st st-err">High</span>
                        ) : (
                          SEVERITY_LABEL[r.severity]
                        )}
                      </td>
                      <td>
                        <span className="ts-ex">{quoted(r)}</span>
                        <small className="faint">
                          {[TYPE_LABEL[r.type], r.place, r.author].filter(Boolean).join(' · ')}
                          {r.brigading ? ' · possible brigading' : ''}
                        </small>
                      </td>
                      <td>{REASON_LABELS[r.reason]}</td>
                      <td className="n">{num(r.reporters)}</td>
                      <td className={`nw${r.late ? ' warn-t' : ''}`}>
                        {r.late ? <b>{age(r.createdAt)}</b> : age(r.createdAt)}
                      </td>
                      <td>
                        {r.status === 'resolved' ? (
                          (OUTCOME_LABEL[r.outcome ?? ''] ?? 'Resolved')
                        ) : r.status === 'auto_hidden' ? (
                          <span className="st st-err">Auto-hidden</span>
                        ) : r.escalated ? (
                          <span className="st st-warn">Escalated</span>
                        ) : r.assignee ? (
                          r.assignee.split(' ')[0]
                        ) : (
                          <span className="faint">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`Showing ${num(shown.length)} of ${num(total)} ${tabLabel} reports${tab === 'resolved' ? '' : ' · severity, then oldest'}`}</span>
            <span>Promise: High within 24 hours, others within 3 days</span>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
