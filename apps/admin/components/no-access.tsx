import Link from 'next/link';
import type { StaffRole } from '@arpedia/core';
import { pageAccess } from '@/lib/nav';
import { roleLabel, rolePlural } from '@/lib/staff-rules';
import { serverSupabase } from '@/lib/supabase/server';

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * s-no-access: a pasted or shared link to a page the role cannot open. Names the page, the
 * person's role and the roles that can open it (read from role_permissions).
 */
export async function NoAccess({ page, label, role }: { page: string; label: string; role: StaffRole }) {
  const supabase = await serverSupabase();
  const { data } = await supabase.from('role_permissions').select('role').in('permission', pageAccess[page] ?? []);
  // Super admins last, as in the prototype ("open to Finance and Super admins").
  const roles = [...new Set((data ?? []).map(r => r.role))].sort(
    (a, b) => Number(a === 'super_admin') - Number(b === 'super_admin'),
  );
  const verb = /s$/.test(label) ? 'are' : 'is';
  return (
    <section className="screen enter">
      <div className="page page--narrow">
        <div className="panel">
          <div className="empty">
            <b>{`You don't have access to ${label}`}</b>
            <span>{`Your role is ${roleLabel[role]}. ${label} ${verb} open to ${list(roles.map(r => rolePlural[r]))}.`}</span>
            <span>If you need it for your work, ask a super admin to change your role.</span>
            <div className="row">
              <Link className="btn btn-p" href="/">
                Go to Overview
              </Link>
              <Link className="btn btn-g" href="/roles">
                See what each role can do
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
