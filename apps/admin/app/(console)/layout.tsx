import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Shell } from '@/components/shell';
import { navFor } from '@/lib/nav';
import { PREVIEW_COOKIE, previewRoleOf } from '@/lib/preview-as';
import { requireStaff, roleLabel } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

// Every console page is checked on the server: no active staff role or no two-step, no page.
export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  // Preview as (spec check 16-25): a Super admin sees that role's sidebar; their own rights stay.
  const preview = previewRoleOf(staff.role, (await cookies()).get(PREVIEW_COOKIE)?.value);
  let permissions = staff.permissions;
  if (preview) {
    const { data } = await (await serverSupabase())
      .from('role_permissions')
      .select('permission')
      .eq('role', preview);
    if (data) permissions = data.map(r => r.permission);
  }
  return (
    <Shell
      staff={{ name: staff.name, roleLabel: roleLabel[staff.role] }}
      nav={navFor(permissions)}
      env={process.env.NEXT_PUBLIC_APP_ENV ?? 'local'}
    >
      {children}
    </Shell>
  );
}
