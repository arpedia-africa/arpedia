import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { AppealView, type AppealDetail } from './appeal-view';

export const metadata: Metadata = { title: 'Appeal · Arpedia Admin' };

/** s-appeal: the appellant's words, the original report and decision, and the reply sent with the outcome. */
export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaff();
  if (!canOpen('appeals', staff.permissions)) return <NoAccess page="appeals" label="Appeals" role={staff.role} />;
  const supabase = await serverSupabase();
  const [detail, queue] = await Promise.all([
    supabase.rpc('admin_get_appeal', { p_appeal: id }),
    supabase.rpc('admin_list_appeals', { p_status: 'open' }),
  ]);
  if (detail.error?.message.includes('not_found')) notFound();
  const ids = (queue.data ?? []).map((a) => a.id);
  const at = ids.indexOf(id);
  const nextId = ids.find((x, i) => i > at && x !== id) ?? ids.find((x) => x !== id) ?? null;
  return (
    <AppealView
      detail={(detail.data as unknown as AppealDetail | null) ?? null}
      failed={!!detail.error}
      position={at >= 0 ? at + 1 : null}
      total={ids.length}
      nextId={nextId}
      nextName={queue.data?.find((a) => a.id === nextId)?.user_name ?? null}
    />
  );
}
