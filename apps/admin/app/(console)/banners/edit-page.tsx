import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { BannerEdit } from './banner-edit';
import type { Banner } from './labels';

/** s-banner-edit for a new announcement (id null) or an existing one. */
export async function BannerEditPage({ id }: { id: string | null }) {
  const staff = await requireStaff();
  if (!staff.permissions.includes('send_push'))
    return <NoAccess page="banners" label="In-app announcements" role={staff.role} />;
  const supabase = await serverSupabase();
  const [list, genres, books, authors] = await Promise.all([
    id ? supabase.rpc('staff_list_banners') : Promise.resolve({ data: [], error: null }),
    supabase.from('genres').select('id, name').eq('visible', true).order('position'),
    supabase.from('books').select('id, title').eq('status', 'live').order('title').limit(500),
    supabase.from('profiles').select('id, full_name').eq('is_author', true).is('deleted_at', null).order('full_name').limit(500),
  ]);
  const banner = id ? ((list.data as unknown as Banner[] | null) ?? []).find(b => b.id === id) : null;
  if (id && !banner) notFound();
  return (
    <BannerEdit
      banner={banner ?? null}
      genres={(genres.data ?? []).map(g => ({ id: g.id, label: g.name }))}
      books={(books.data ?? []).map(b => ({ id: b.id, label: b.title }))}
      authors={(authors.data ?? []).map(a => ({ id: a.id, label: a.full_name }))}
    />
  );
}
