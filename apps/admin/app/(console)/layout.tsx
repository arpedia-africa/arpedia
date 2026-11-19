import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { navFor } from '@/lib/nav';
import { requireStaff, roleLabel } from '@/lib/staff';

// Every console page is checked on the server: no active staff role or no two-step, no page.
export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  return (
    <Shell
      staff={{ name: staff.name, roleLabel: roleLabel[staff.role] }}
      nav={navFor(staff.permissions)}
      env={process.env.NEXT_PUBLIC_APP_ENV ?? 'local'}
    >
      {children}
    </Shell>
  );
}
