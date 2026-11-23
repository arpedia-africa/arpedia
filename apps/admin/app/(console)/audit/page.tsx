import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { avClass, initials, n0 } from '@/lib/money';
import { canOpen } from '@/lib/nav';
import { requireStaff, roleLabel } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import type { StaffRole } from '@arpedia/core';
import { RowLink } from '../books/row';
import { AuditToolbar } from './toolbar';
import {
  actionLabel,
  filterHref,
  longDate,
  objectHref,
  RANGES,
  readFilters,
  rpcArgs,
  when,
  whenLong,
  type AuditPage as AuditList,
} from './shared';

export const metadata: Metadata = { title: 'Audit log · Arpedia Admin' };

interface Entry {
  id: number;
  at: string;
  actor_name: string | null;
  actor_role: string | null;
  area: string;
  action: string;
  object_type: string | null;
  object_id: string | null;
  object_label: string | null;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  request_id: string | null;
  ip: string | null;
  device: string | null;
  mfa_verified_at: string | null;
  retain_until: string | null;
}

const show = (v: unknown) => (v === null || v === undefined ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Values({ title, values, keys }: { title: string; values: Record<string, unknown> | null; keys: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {keys.length ? (
        <dl className="kv tight">
          {keys.map(k => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd className="mono" style={{ overflowWrap: 'anywhere' }}>
                {show(values?.[k])}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <span className="muted">Nothing recorded</span>
      )}
    </div>
  );
}

/** s-audit-entry: one action with before and after; request id, IP, device and two-step folded. */
function EntryDrawer({ e, back, now }: { e: Entry; back: string; now: number }) {
  const keys = [...new Set([...Object.keys(e.before ?? {}), ...Object.keys(e.after ?? {})])];
  const href = objectHref(e.object_type, e.object_id);
  const role = e.actor_role ? (roleLabel[e.actor_role as StaffRole] ?? e.actor_role) : null;
  const mfa = e.mfa_verified_at ? `Verified ${when(e.mfa_verified_at, now)}` : 'Not recorded';
  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={back} aria-label="Close" scroll={false}></Link>
      <div className="drawer" role="dialog" aria-label="Audit entry">
        <div className="modal__h">
          <div className="grow">
            <h2>{`${e.actor_name ?? 'System'}: ${e.summary ?? actionLabel(e.action)}`}</h2>
            <p>{whenLong(e.at, now)}</p>
          </div>
          <Link className="ib" href={back} aria-label="Close" scroll={false}>
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="sy-ba">
            <Values title="Before" values={e.before} keys={keys} />
            <Values title="After" values={e.after} keys={keys} />
          </div>
          <dl className="kv">
            <dt>Staff</dt>
            <dd>{[e.actor_name ?? 'System', role].filter(Boolean).join(' · ')}</dd>
            <dt>Action</dt>
            <dd className="mono">{e.action}</dd>
            <dt>Object</dt>
            <dd>
              {href ? (
                <Link className="link" href={href}>
                  {e.object_label ?? e.object_id}
                </Link>
              ) : (
                (e.object_label ?? e.object_id ?? '–')
              )}
            </dd>
            {e.reason && (
              <>
                <dt>Reason</dt>
                <dd>{e.reason}</dd>
              </>
            )}
            <dt>Kept until</dt>
            <dd>{e.retain_until ? `${longDate(e.retain_until)}. This entry cannot be edited or deleted.` : '–'}</dd>
          </dl>
          <details className="fold">
            <summary>
              More details <small>request id, device, two-step</small>
            </summary>
            <div className="fold__b">
              <dl className="kv">
                <dt>Request id</dt>
                <dd className="mono">{e.request_id ?? '–'}</dd>
                <dt>IP address</dt>
                <dd className="mono">{e.ip ?? '–'}</dd>
                <dt>Device</dt>
                <dd>{e.device ?? '–'}</dd>
                <dt>Two-step</dt>
                <dd>{mfa}</dd>
              </dl>
            </div>
          </details>
        </div>
        <div className="modal__f">
          {href && (
            <Link className="btn btn-g" href={href}>
              {`Open ${e.object_label ?? 'object'}`}
            </Link>
          )}
          <Link className="btn btn-n" href={back} scroll={false}>
            Close
          </Link>
        </div>
      </div>
    </section>
  );
}

/** s-audit: the permanent, filterable list of staff actions (rules 19–23). */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaff();
  if (!canOpen('audit', staff.permissions)) return <NoAccess page="audit" label="Audit log" role={staff.role} />;
  const sp = await searchParams;
  const f = readFilters(sp);
  const now = Date.now();
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('list_audit', rpcArgs(f, now));
  if (error) throw error;
  const list = data as unknown as AuditList;
  const entryId = Math.floor(Number(sp.entry));
  let entry: Entry | null = null;
  if (entryId > 0) {
    const { data: e } = await supabase.rpc('get_audit_entry', { p_id: entryId });
    entry = (e as unknown as Entry | null) ?? null;
  }
  const base = filterHref(f, { page: f.page });
  const withEntry = (id: number) => `${base}${base.includes('?') ? '&' : '?'}entry=${id}`;
  const filtered = !!(f.q || f.actor || f.area || f.action);
  const range = RANGES[f.days]!;
  const hasOlder = f.page * f.per < list.total;

  return (
    <>
      <section className="screen enter">
        <div className="band">
          <div className="band__row">
            <div className="band__text">
              <h1>Audit log</h1>
            </div>
            <div className="band__acts">
              <a className="ib" href={filterHref(f, {}, '/audit/export')} aria-label="Export log" download>
                <Icon name="down" />
              </a>
            </div>
          </div>
        </div>
        <div className="page">
          <AuditToolbar filters={f} actors={list.actors} />
          <div className="panel panel--flush">
            {list.rows.length ? (
              <>
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Staff</th>
                        <th>Action</th>
                        <th>Object</th>
                        <th>Details</th>
                        <th>IP and place</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.rows.map(r => {
                        const name = r.actor_name ?? 'System';
                        const href = objectHref(r.object_type, r.object_id);
                        return (
                          <RowLink key={r.id} href={withEntry(r.id)}>
                            <td className="nw">{when(r.at, now)}</td>
                            <td>
                              <div className="who">
                                <span className={`av xs ${avClass(r.actor_id ?? name)}`}>{initials(name)}</span>
                                <span>
                                  <small>{name}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <b>{actionLabel(r.action)}</b>
                            </td>
                            <td>
                              {href ? (
                                <Link className="link" href={href}>
                                  {r.object_label ?? r.object_id}
                                </Link>
                              ) : (
                                (r.object_label ?? <span className="faint">–</span>)
                              )}
                            </td>
                            <td className="muted">{r.summary}</td>
                            <td className="nw mono">{r.ip ?? '–'}</td>
                          </RowLink>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <span>{`Showing ${n0(list.rows.length)} of ${n0(list.total)}${f.days ? ` in the ${range.toLowerCase()}` : ''}`}</span>
                  <span className="row">
                    {f.page > 1 ? (
                      <Link className="btn btn-g sm" href={filterHref(f, { page: f.page - 1 })}>
                        Newer
                      </Link>
                    ) : (
                      <button className="btn btn-g sm" type="button" disabled>
                        Newer
                      </button>
                    )}
                    {hasOlder ? (
                      <Link className="btn btn-g sm" href={filterHref(f, { page: f.page + 1 })}>
                        Older
                      </Link>
                    ) : (
                      <button className="btn btn-g sm" type="button" disabled>
                        Older
                      </button>
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="empty" style={{ padding: '64px 24px' }}>
                <b>No actions match</b>
                <span>
                  {filtered
                    ? `Nothing in the ${range.toLowerCase()} matches these filters.`
                    : `No staff actions in the ${range.toLowerCase()}.`}
                </span>
                {(filtered || f.days !== 7) && (
                  <Link className="btn btn-g sm" href="/audit">
                    Clear filters
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
      {entry && <EntryDrawer e={entry} back={base} now={now} />}
    </>
  );
}
