import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import type { HelpCategory } from '../labels';
import { HelpEditor, type HelpArticle } from './help-editor';

export const metadata: Metadata = { title: 'Help article · Arpedia Admin' };

/** s-help-article: edit once, shown in the app Help screen and on the website. `/help/new` starts one. */
export default async function HelpArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === 'new';
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaff();
  if (!canOpen('help', staff.permissions))
    return <NoAccess page="help" label="Help articles" role={staff.role} />;
  const supabase = await serverSupabase();
  const [detail, list] = await Promise.all([
    isNew ? Promise.resolve({ data: null, error: null }) : supabase.rpc('admin_get_help', { p_article: id }),
    supabase.rpc('admin_list_help'),
  ]);
  if (!isNew && !detail.error && !detail.data) notFound();
  const others = (list.data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category as HelpCategory,
  }));
  const stats = list.data?.find((a) => a.id === id);
  return (
    <HelpEditor
      key={`${id}-${(detail.data as { versions?: { id: string }[] } | null)?.versions?.[0]?.id ?? 0}`}
      article={(detail.data as unknown as HelpArticle | null) ?? null}
      failed={!!detail.error}
      others={others.filter((a) => a.id !== id)}
      stats={stats ? { views: Number(stats.views_30d), helpful: stats.helpful_pct } : null}
    />
  );
}
