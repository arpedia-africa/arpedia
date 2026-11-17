import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { getStaff, roleLabel } from '@/lib/staff';

// Every console page is checked on the server: no active staff role, no page.
export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  return (
    <Shell staff={{ name: staff.name, roleLabel: roleLabel[staff.role] }} env={process.env.NEXT_PUBLIC_APP_ENV ?? 'local'}>
      {children}
    </Shell>
  );
}
