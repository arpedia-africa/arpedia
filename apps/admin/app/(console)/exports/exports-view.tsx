'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { StaffRole } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { createExport, setSchedule, type ExportKind } from './actions';

type Status = 'counting' | 'building' | 'ready' | 'failed' | 'expired';
export interface ExportRow {
  id: string;
  kind: ExportKind;
  params: { from?: string; to?: string };
  columns: string[];
  includes_pii: boolean;
  status: Status;
  row_count: number | null;
  created_at: string;
  expires_at: string;
  created_by: string | null;
  mine: boolean;
}
export interface Schedule {
  report_kind: 'monthly_earnings' | 'weekly_kpi' | 'weekly_safety' | 'quarterly_data_requests';
  recipients: string[];
  enabled: boolean;
  last_sent_at: string | null;
}
export interface ExportList {
  rows: ExportRow[];
  schedules: Schedule[];
}

const KINDS: { key: ExportKind; label: string }[] = [
  { key: 'readers', label: 'Readers' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'author_earnings', label: 'Author earnings' },
  { key: 'books', label: 'Books' },
  { key: 'reports', label: 'Reports' },
];
const kindLabel = (k: ExportKind) => KINDS.find(x => x.key === k)!.label;

/** Column groups under More options; kinds not listed export every column without contact details. */
const COLUMNS: Partial<Record<ExportKind, { cols: string[]; label: string; pii?: boolean; on: boolean }[]>> = {
  readers: [
    { cols: ['reader_id', 'joined_at', 'state'], label: 'Reader id, joined date, state', on: true },
    { cols: ['credits_balance', 'last_active'], label: 'Credits balance and last active', on: true },
    { cols: ['email'], label: 'Email address (personal detail)', pii: true, on: false },
    { cols: ['phone'], label: 'Phone number (personal detail)', pii: true, on: false },
  ],
};

const SCHEDULES: Record<Schedule['report_kind'], { name: string; what: string; when: string }> = {
  monthly_earnings: { name: 'Monthly earnings statement', what: 'Earnings by author, CSV link', when: '1st of the month, 8:00' },
  weekly_kpi: { name: 'Weekly KPI email', what: 'Readers, subscribers, revenue, reports', when: 'Mondays, 8:00' },
  weekly_safety: { name: 'Weekly safety summary', what: 'Reports by reason, response times', when: 'Mondays, 9:00' },
  quarterly_data_requests: {
    name: 'Quarterly data-request log',
    what: 'NDPA requests and response times',
    when: 'First day of the quarter',
  },
};

const STATUS_LABEL: Record<Status, string> = {
  counting: 'Counting',
  building: 'Building',
  ready: 'Ready',
  failed: 'Failed',
  expired: 'Expired',
};

const TZ = 'Africa/Lagos';
const AV = ['g', 'k', 'b', 'm', 'o', 't', 'r', 'n'];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');
const avClass = (name: string) => AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const wat = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const time = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
function created(iso: string) {
  const d = new Date(iso);
  if (wat(d) === wat(new Date())) return `Today, ${time(d)}`;
  return `${d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')}, ${time(d)}`;
}
const dayMonth = (s: string) => new Date(`${s}T12:00:00+01:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function rangeLabel(p: ExportRow['params']) {
  if (!p.from || !p.to) return 'all time';
  return `${dayMonth(p.from)} to ${dayMonth(p.to)}`;
}
const fileName = (r: ExportRow) => `${r.kind.replace('_', '-')}-${r.created_at.slice(0, 7)}.csv`;
const daysAgo = (n: number) => wat(new Date(Date.now() - n * 86_400_000));

export function ExportsView({
  data,
  role,
  canPersonal,
  done,
}: {
  data: ExportList | null;
  role: StaffRole;
  canPersonal: boolean;
  done?: string;
}) {
  const router = useRouter();
  const finance = role === 'finance';
  const kinds = finance ? KINDS.filter(k => k.key === 'transactions' || k.key === 'author_earnings') : KINDS;
  const [kind, setKind] = useState<ExportKind>(kinds[0]!.key);
  const [range, setRange] = useState<'7' | '30' | 'custom'>('30');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [picked, setPicked] = useState<boolean[]>(() => (COLUMNS.readers ?? []).map(c => c.on));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [toastNode, showToast] = useToast();

  useEffect(() => {
    if (!done) return;
    showToast(done);
    window.history.replaceState(null, '', '/exports');
  }, [done, showToast]);

  // Building files refresh themselves until they are ready.
  const building = data?.rows.some(r => r.status === 'counting' || r.status === 'building');
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [building, router]);

  const groups = COLUMNS[kind] ?? [];
  const columns = groups.flatMap((g, i) => (picked[i] ? g.cols : []));
  const pii = groups.some((g, i) => g.pii && picked[i]);
  const params = range === 'custom' ? { from, to } : { from: daysAgo(Number(range)), to: daysAgo(0) };

  const create = (k: ExportKind, p: { from: string; to: string }, cols: string[], why: string) =>
    start(async () => {
      setError(undefined);
      const r = await createExport(k, p, cols, why);
      if (!r.ok) return setError(r.error);
      setReason('');
      showToast(`Export started: ${kindLabel(k)}, ${rangeLabel(p)}. You can download it here when it is ready.`);
    });

  const schedules = data?.schedules ?? [];

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Exports and reports</h1>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Recent exports</h2>
              </div>
              {!data ? (
                <div className="empty">
                  <b>Exports didn&apos;t load</b>
                  <span>Check your connection and refresh the page.</span>
                </div>
              ) : data.rows.length === 0 ? (
                <div className="empty">
                  <b>No exports in the last 7 days</b>
                  <span>Files build in the background and stay here for 7 days.</span>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Export</th>
                        <th>Created by</th>
                        <th>Created</th>
                        <th className="r">Rows</th>
                        <th>Status</th>
                        <th className="acts"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map(r => {
                        const who = r.created_by ?? 'Staff';
                        return (
                          <tr key={r.id}>
                            <td>
                              <b>{`${kindLabel(r.kind)}, ${rangeLabel(r.params)}`}</b>
                              <br />
                              <small className="faint">
                                {`${fileName(r)}${r.includes_pii ? ' · includes emails' : r.kind === 'author_earnings' || r.kind === 'transactions' ? ' · no contact details' : ''}`}
                              </small>
                            </td>
                            <td>
                              <div className="who">
                                <span className={`av xs ${avClass(who)}`}>{initials(who)}</span>
                                <span>
                                  <small>{who}</small>
                                </span>
                              </div>
                            </td>
                            <td className="nw">{created(r.created_at)}</td>
                            <td className={r.row_count != null ? 'n' : 'n muted'}>
                              {r.row_count != null ? r.row_count.toLocaleString('en-NG') : 'Counting'}
                            </td>
                            <td>
                              <span className="st-plain">{STATUS_LABEL[r.status]}</span>
                            </td>
                            <td className="acts">
                              {r.status === 'ready' ? (
                                <a className="btn btn-s sm" href={`/exports/${r.id}/download`}>
                                  <Icon name="down" />
                                  Download
                                </a>
                              ) : r.status === 'counting' || r.status === 'building' ? (
                                <span className="muted">About 2 min</span>
                              ) : r.mine && !r.includes_pii ? (
                                <button
                                  type="button"
                                  className="btn btn-q sm"
                                  disabled={pending}
                                  onClick={() =>
                                    create(r.kind, { from: r.params.from ?? daysAgo(30), to: r.params.to ?? daysAgo(0) }, r.columns, '')
                                  }
                                >
                                  Build again
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {schedules.length ? (
              <details className="fold">
                <summary>
                  Scheduled reports{' '}
                  <small>{`${schedules.length} schedules, ${schedules.filter(s => s.enabled).length} on`}</small>
                </summary>
                <div className="fold__b">
                  <div className="tw">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Report</th>
                          <th>Sent to</th>
                          <th>When</th>
                          <th>Last sent</th>
                          <th>On</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map(s => {
                          const m = SCHEDULES[s.report_kind];
                          const can = role === 'super_admin' || (finance && s.report_kind === 'monthly_earnings');
                          return (
                            <tr key={s.report_kind}>
                              <td>
                                <b>{m.name}</b>
                                <br />
                                <small className="faint">{m.what}</small>
                              </td>
                              <td>{s.recipients.join(', ')}</td>
                              <td className="nw">{m.when}</td>
                              <td className={s.last_sent_at ? 'nw' : 'nw muted'}>
                                {s.last_sent_at
                                  ? new Date(s.last_sent_at).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })
                                  : 'Not yet'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={s.enabled ? 'switch on' : 'switch'}
                                  role="switch"
                                  aria-checked={s.enabled}
                                  aria-label={m.name}
                                  disabled={!can || pending}
                                  onClick={() =>
                                    start(async () => {
                                      const r = await setSchedule(s.report_kind, !s.enabled);
                                      showToast(
                                        r.ok
                                          ? `${m.name} ${s.enabled ? 'is off' : 'is on'}. The audit log records it.`
                                          : (r.error ?? "That didn't save."),
                                      );
                                    })
                                  }
                                ></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <span className="hint">Reports email a link that needs a staff sign-in, never the file itself.</span>
                </div>
              </details>
            ) : null}
          </div>
          <div className="panel">
            <div className="panel__head">
              <h2>New export</h2>
            </div>
            <div className="panel__body">
              <div className="form">
                <div className="f">
                  <label htmlFor="x-kind">What to export</label>
                  <div className="inp sel">
                    <select
                      id="x-kind"
                      value={kind}
                      style={{ appearance: 'none' }}
                      onChange={e => {
                        const k = e.target.value as ExportKind;
                        setKind(k);
                        setPicked((COLUMNS[k] ?? []).map(c => c.on));
                      }}
                    >
                      {kinds.map(k => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevd" size="s" />
                  </div>
                </div>
                <div className="f">
                  <span className="lbl">Dates</span>
                  <div className="seg" role="tablist">
                    {(
                      [
                        ['7', 'Last 7 days'],
                        ['30', 'Last 30 days'],
                        ['custom', 'Custom'],
                      ] as const
                    ).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={range === k}
                        className={range === k ? 'is-selected' : ''}
                        onClick={() => setRange(k)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {range === 'custom' ? (
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="x-from">From</label>
                      <div className="inp">
                        <input id="x-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
                      </div>
                    </div>
                    <div className="f">
                      <label htmlFor="x-to">To</label>
                      <div className="inp">
                        <input id="x-to" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
                      </div>
                    </div>
                  </div>
                ) : null}
                {groups.length ? (
                  <details className="fold">
                    <summary>
                      More options <small>columns, personal details</small>
                    </summary>
                    <div className="fold__b">
                      <div className="stack s8">
                        {groups.map((g, i) => (
                          <label
                            key={g.label}
                            className="checkrow"
                            onClick={e => {
                              e.preventDefault();
                              if (g.pii && !canPersonal) return;
                              setPicked(p => p.map((v, j) => (j === i ? !v : v)));
                            }}
                          >
                            <span className={picked[i] ? 'cb on' : 'cb'} role="checkbox" aria-checked={!!picked[i]} aria-disabled={g.pii && !canPersonal}></span>
                            <span>{g.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="note warn">
                        <span className="grow">
                          <b>Personal details need a reason</b>Only Super admins can export emails or phone numbers. It is
                          logged with your name and reason.
                        </span>
                      </div>
                      <div className="f">
                        <label htmlFor="x-why">
                          Reason <span className="opt">only for personal details</span>
                        </label>
                        <div className="inp">
                          <input
                            id="x-why"
                            value={reason}
                            placeholder="For example: welcome-back email list"
                            aria-label="Reason"
                            disabled={!pii}
                            onChange={e => setReason(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </details>
                ) : (
                  <span className="hint">
                    {finance ? 'Finance exports leave out contact details.' : 'Every column, without contact details.'}
                  </span>
                )}
                {error ? (
                  <div className="note err" role="alert">
                    <span className="grow">{error}</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-p block"
                  disabled={pending || (pii && reason.trim().length < 5) || (range === 'custom' && from > to)}
                  aria-busy={pending}
                  onClick={() => create(kind, params, groups.length ? columns : [], pii ? reason : '')}
                >
                  {pending ? 'Starting…' : 'Create export'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
