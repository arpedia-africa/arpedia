import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { StaffRole } from '@arpedia/core';
import { serverSupabase } from './supabase/server';

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  /** A verified authenticator exists (otherwise first-visit setup). */
  mfaEnrolled: boolean;
  /** Two-step passed in this session within the last 12 hours. */
  mfaOk: boolean;
  codeLockedUntil: string | null;
  backupCodesLeft: number;
  permissions: string[];
}

export { roleLabel, rolePlural, STAFF_DOMAIN, STAFF_PASSWORD_MIN } from './staff-rules';

interface StaffContext {
  user_id: string;
  name: string | null;
  email: string | null;
  role: StaffRole;
  mfa_enrolled: boolean;
  mfa_ok: boolean;
  code_locked_until: string | null;
  backup_codes_left: number;
  permissions: string[];
}

/**
 * The signed-in staff member, read live on every request (get_staff_context: active staff row,
 * two-step state, permissions). Null for anyone without an active staff row.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc('get_staff_context');
  const c = data as unknown as StaffContext | null;
  if (!c) return null;
  return {
    id: c.user_id,
    name: c.name || c.email || 'Staff',
    email: c.email ?? '',
    role: c.role,
    mfaEnrolled: c.mfa_enrolled,
    mfaOk: c.mfa_ok,
    codeLockedUntil: c.code_locked_until,
    backupCodesLeft: c.backup_codes_left,
    permissions: c.permissions,
  };
});

/** Console pages: active staff who passed two-step, or off to the step they still owe. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  if (!staff.mfaEnrolled) redirect('/sign-in/two-step/setup');
  if (!staff.mfaOk) redirect('/sign-in/two-step');
  return staff;
}
