import type { Metadata } from 'next';
import Link from 'next/link';
import type { StaffRole } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { OfflineBanner } from '@/components/online';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { ROLE_ORDER, roleLabel } from '@/lib/staff-rules';
import { serverSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Roles and permissions · Arpedia Admin' };

const TWO_PERSON: [string, string][] = [
  ['Release payouts', 'Finance calculates, a Super admin releases'],
  ['Change a price', 'Finance proposes, a Super admin confirms'],
  ['Grant over 500 credits', 'A second Super admin or Operations admin approves'],
  ['Export personal details', 'Super admin, with a reason'],
];

type Cell = { level: 'allow' | 'limited'; limit_note: string | null; second_person: boolean } | undefined;

function MatrixCell({ cell }: { cell: Cell }) {
  if (!cell) return <span className="no">–</span>;
  if (cell.level === 'limited') return <span className="part">{cell.limit_note}</span>;
  return <span className="yes">{cell.second_person ? '✓*' : '✓'}</span>;
}

/**
 * s-roles: the read-only permission matrix (from role_permissions), two-person rules and who has
 * which role. Open to every staff member, so s-no-access can link here.
 */
export default async function RolesPage() {
  const staff = await requireStaff();
  const supabase = await serverSupabase();
  const [{ data: perms }, { data: grants }, { data: holders }, { data: team }] = await Promise.all([
    supabase.from('permissions').select('key, label, matrix_order, more').not('matrix_order', 'is', null).order('matrix_order'),
    supabase.from('role_permissions').select('role, permission, level, limit_note, second_person'),
    supabase.rpc('staff_by_role'),
    canOpen('team', staff.permissions) ? supabase.rpc('list_staff') : Promise.resolve({ data: null }),
  ]);
  const count = team ? team.length : null;
  const cell = (role: StaffRole, permission: string): Cell => grants?.find(g => g.role === role && g.permission === permission);
  const main = (perms ?? []).filter(p => !p.more);
  const more = (perms ?? []).filter(p => p.more);
  const byRole = new Map((holders ?? []).map(h => [h.role, h]));
  const supers = byRole.get('super_admin')?.names ?? [];

  const matrix = (rows: typeof main) => (
    <div className="tw">
      <table className="tbl mx">
        <thead>
          <tr>
            <th>Permission</th>
            {ROLE_ORDER.map(r => (
              <th key={r}>{roleLabel[r]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.key}>
              <td>
                <b>{p.label}</b>
              </td>
              {ROLE_ORDER.map(r => (
                <td key={r}>
                  <MatrixCell cell={cell(r, p.key)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Team and roles</h1>
          </div>
          {canOpen('team', staff.permissions) ? (
            <div className="band__acts">
              <Link className="btn btn-n" href="/team?invite=1">
                <Icon name="uplus" />
                Invite staff
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {canOpen('team', staff.permissions) ? (
          <Link role="tab" aria-selected="false" href="/team">
            Staff {count !== null ? <span className="c">{count}</span> : null}
          </Link>
        ) : null}
        <a role="tab" aria-selected="true" className="is-selected">
          Roles and permissions
        </a>
      </div>
      <div className="page">
        <OfflineBanner />
        <div className="split">
          <div className="panel panel--flush">
            {matrix(main)}
            <div className="pager">
              <span>✓ allowed · – not allowed · orange = limited, see the label</span>
              <span>* needs a second person</span>
            </div>
            {more.length ? (
              <details className="more">
                <summary>{`Show ${more.length} more permissions`}</summary>
                {matrix(more)}
              </details>
            ) : null}
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Two-person rules</h2>
              </div>
              <div className="panel__body">
                <div>
                  {TWO_PERSON.map(([k, v]) => (
                    <div key={k} className="kv-row">
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                Who has which role {supers.length === 1 ? <small>only 1 Super admin, add a second</small> : null}
              </summary>
              <div className="fold__b">
                <div className="list">
                  {ROLE_ORDER.map(r => {
                    const h = byRole.get(r);
                    const names = [...(h?.names ?? []), ...(h?.invited ?? []).map(n => `${n} (invited)`)];
                    return (
                      <div key={r} className="li">
                        <span className="li__body">
                          <b>{roleLabel[r]}</b>
                          <small>{names.length ? names.join(', ') : 'Nobody yet'}</small>
                        </span>
                        <span className="li__trail">{names.length}</span>
                      </div>
                    );
                  })}
                </div>
                {supers.length === 1 ? (
                  <span className="warn-t">
                    <b>Only 1 Super admin.</b>
                    {` Add a second so that two-person rules can still run when ${supers[0]!.split(/\s+/)[0]} is away.`}
                  </span>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
