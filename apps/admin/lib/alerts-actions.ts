'use server';

import type { StaffAlerts } from './alerts';
import { serverSupabase } from './supabase/server';

/** s-staff-alerts: the alerts this staff member's role and switches allow (get_staff_alerts). */
export async function loadStaffAlerts(): Promise<StaffAlerts> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('get_staff_alerts');
  if (error) throw new Error('alerts_failed');
  return data as unknown as StaffAlerts;
}

/** Mark all read: what is there now stops counting as new. Returns the previous mark, for Undo. */
export async function markStaffAlertsRead(until?: string): Promise<{ ok: boolean; prev?: string }> {
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('mark_staff_alerts_read', until ? { p_until: until } : {});
  return error ? { ok: false } : { ok: true, prev: String(data) };
}
