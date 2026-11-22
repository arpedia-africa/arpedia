import { notFound } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import type { Staff } from '@/lib/staff';
import type { Plan, ReaderHead } from '../shared';

// Flow 10 · one call (staff_get_reader) feeds every reader tab.

export interface Reader extends ReaderHead {
  username: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  has_phone: boolean;
  date_of_birth: string | null;
  is_author: boolean;
  erased_at: string | null;
  email_verified: boolean;
  last_sign_in_at: string | null;
  plan: Plan | null;
  credits: number;
  interests: string[];
  unlocked: { book_id: string; title: string; at: string; credits: number | null }[];
  notes: { id: string; body: string; at: string; author: string | null }[];
  consent: { offers: boolean; marketing_at: string | null; terms_version: number | null; privacy_version: number | null };
  devices: {
    id: string;
    model: string | null;
    os: string | null;
    app_version: string | null;
    city: string | null;
    last_seen_at: string;
    download_enabled: boolean;
    revoked_at: string | null;
    revoked_by: string | null;
  }[];
  reading: { book_id: string; title: string; percent: number; last_opened_at: string }[];
  reading_minutes_30d: number | null;
  counts: { bookmark: number; highlight: number; note: number; books_read: number };
  deletion: { status: string; erase_after: string; grace_until: string | null; requested_via: string } | null;
  earnings_waiting: boolean;
}

export async function loadReader(id: string): Promise<Reader> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_get_reader', { p_user: id });
  if (error?.code === 'P0002') notFound();
  if (error) throw error;
  const r = data as unknown as Omit<Reader, 'last_seen'>;
  const lastDevice = r.devices.find(d => !d.revoked_at)?.last_seen_at ?? null;
  return { ...r, last_seen: lastDevice ?? r.last_sign_in_at };
}

/** What this staff member may do on reader pages (mirrors the RPC checks). */
export function readerRights(staff: Staff) {
  const r = staff.role;
  return {
    canAct: ['super_admin', 'operations_admin', 'support'].includes(r),
    canReveal: ['super_admin', 'support'].includes(r),
    canDelete: ['super_admin', 'support'].includes(r),
    canChangeRole: r === 'super_admin',
  };
}
