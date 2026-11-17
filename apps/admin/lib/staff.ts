import { cache } from 'react';
import type { StaffRole } from '@arpedia/core';
import { serverSupabase } from './supabase/server';

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

/** Google sign-in is limited to this workspace domain. */
export const STAFF_DOMAIN = 'arpedia.africa';

export const roleLabel: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  operations_admin: 'Operations admin',
  publisher: 'Publisher',
  moderator: 'Moderator',
  finance: 'Finance',
  support: 'Support',
  analyst: 'Analyst',
};

/**
 * The signed-in staff member, checked on the server on every request (the token is verified by
 * Supabase with getUser, and the role comes from staff_roles under RLS). Null for anyone else.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: role }, { data: profile }] = await Promise.all([
    supabase.from('staff_roles').select('role, active').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ]);
  if (!role?.active) return null;
  return { id: user.id, name: profile?.full_name || user.email || 'Staff', email: user.email ?? '', role: role.role };
});
