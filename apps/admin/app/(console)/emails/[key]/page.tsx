import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import type { TemplateRow } from '../emails-view';
import { TemplateEdit, type Version } from './template-edit';

export const metadata: Metadata = { title: 'Edit email · Arpedia Admin' };

/** s-email-template. */
export default async function EmailTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-z_]{2,40}$/.test(key)) notFound();
  const staff = await requireStaff();
  if (!canOpen('emails', staff.permissions)) return <NoAccess page="emails" label="Emails" role={staff.role} />;
  const supabase = await serverSupabase();
  const [list, versions, sender] = await Promise.all([
    supabase.rpc('staff_list_email_templates'),
    supabase.rpc('staff_email_versions', { p_key: key }),
    supabase.from('email_sender').select('from_address, footer').maybeSingle(),
  ]);
  const t = ((list.data as unknown as TemplateRow[] | null) ?? []).find(r => r.key === key);
  if (!t) notFound();
  return (
    <TemplateEdit
      template={t}
      versions={(versions.data as unknown as Version[] | null) ?? []}
      from={sender.data?.from_address ?? 'Arpedia <hello@arpedia.africa>'}
      footer={sender.data?.footer ?? ''}
      email={staff.email}
    />
  );
}
