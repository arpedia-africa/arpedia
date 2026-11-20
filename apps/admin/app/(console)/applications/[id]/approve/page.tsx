import { notFound, redirect } from 'next/navigation';
import { gate } from '../../../authors/shared';
import { serverSupabase } from '@/lib/supabase/server';
import { ApproveModal } from '../modals';
import { ApplicationView } from '../view';

/** Approve application (s-application-approve), drawn over the application. */
export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate();
  if ('denied' in g) return g.denied;
  const supabase = await serverSupabase();
  const { data: a } = await supabase
    .from('author_applications')
    .select('status, legal_name, pen_name')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  if (a.status !== 'new') redirect(`/applications/${id}`);
  const name = a.pen_name || a.legal_name;
  return (
    <>
      <ApplicationView id={id} />
      <ApproveModal id={id} name={name} club={`${name.slice(0, 55)} club`} />
    </>
  );
}
