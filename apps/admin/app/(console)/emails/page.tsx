import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { EmailsView, type TemplateRow } from './emails-view';

export const metadata: Metadata = { title: 'Emails · Arpedia Admin' };

/** s-emails: every system email with trigger, last editor, volume and open rate; sender settings. */
export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const staff = await requireStaff();
  if (!canOpen('emails', staff.permissions)) return <NoAccess page="emails" label="Emails" role={staff.role} />;
  const supabase = await serverSupabase();
  const [list, sender, health] = await Promise.all([
    supabase.rpc('staff_list_email_templates'),
    supabase.from('email_sender').select('from_address, reply_to, footer').maybeSingle(),
    supabase.rpc('staff_email_health'),
  ]);
  return (
    <EmailsView
      rows={list.error ? null : ((list.data as unknown as TemplateRow[] | null) ?? [])}
      sender={sender.data ?? null}
      health={(health.data as unknown as { sent: number; bounce_pct: number | null } | null) ?? null}
      email={staff.email}
      done={done?.slice(0, 200)}
    />
  );
}
