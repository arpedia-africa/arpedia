import type { Metadata } from 'next';
import type { StaffRole } from '@arpedia/core';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { TeamView, type TeamRow } from './team-view';

export const metadata: Metadata = { title: 'Team and roles · Arpedia Admin' };

/** s-team: staff, open invites, two-step, last active. Super admins only (manage_team). */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const staff = await requireStaff();
  if (!canOpen('team', staff.permissions)) return <NoAccess page="team" label="Team and roles" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('list_staff');
  const rows: TeamRow[] = (data ?? []).map(r => ({
    kind: r.kind as TeamRow['kind'],
    id: r.id,
    name: r.full_name,
    email: r.email,
    role: r.role as StaffRole,
    active: r.active,
    mfaOn: r.mfa_on,
    lastActiveAt: r.last_active_at,
    invitedBy: r.invited_by_name,
    expiresAt: r.expires_at,
    isSelf: r.is_self,
  }));
  return <TeamView rows={rows} failed={!!error} openInvite={invite === '1'} />;
}
