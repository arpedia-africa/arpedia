import { notFound } from 'next/navigation';
import type { Json } from '@arpedia/core';
import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { ComposeView, type Campaign, type Option } from './compose-view';
import type { AudienceKind, Reach } from './labels';

const KINDS: AudienceKind[] = ['all', 'subscribers', 'lapsed_30', 'genre', 'authors'];

/** s-campaign-new for a new push (id null) or an existing one. */
export async function ComposePage({ id }: { id: string | null }) {
  const staff = await requireStaff();
  const canSend = staff.permissions.includes('send_push');
  const drafter = staff.role === 'publisher' || staff.role === 'moderator';
  if (!canSend && !drafter) return <NoAccess page="campaigns" label="Push notifications" role={staff.role} />;
  const supabase = await serverSupabase();
  const [campaign, genres, books, authors] = await Promise.all([
    id ? supabase.rpc('staff_get_campaign', { p_id: id }) : Promise.resolve({ data: null, error: null }),
    supabase.from('genres').select('id, name').eq('visible', true).order('position'),
    supabase.from('books').select('id, title').eq('status', 'live').order('title').limit(500),
    supabase.from('profiles').select('id, full_name').eq('is_author', true).is('deleted_at', null).order('full_name').limit(500),
  ]);
  const c = campaign.data as unknown as Campaign | null;
  if (id && !c) notFound();
  const genreList: Option[] = (genres.data ?? []).map(g => ({ id: g.id, label: g.name }));
  const genreId = (c?.audience.kind === 'genre' && c.audience.genre_id) || genreList[0]?.id;
  const skip = c?.skip_capped ?? true;
  const reach = Object.fromEntries(
    await Promise.all(
      KINDS.map(async k => {
        if (k === 'genre' && !genreId) return [k, null] as const;
        const { data } = await supabase.rpc('campaign_reach', {
          p_audience: (k === 'genre' ? { kind: k, genre_id: genreId } : { kind: k }) as unknown as Json,
          p_skip_capped: skip,
        });
        return [k, (data as unknown as Reach | null) ?? null] as const;
      }),
    ),
  ) as Record<AudienceKind, Reach | null>;
  return (
    <ComposeView
      campaign={c}
      genres={genreList}
      books={(books.data ?? []).map(b => ({ id: b.id, label: b.title }))}
      authors={(authors.data ?? []).map(a => ({ id: a.id, label: a.full_name }))}
      initialReach={reach}
      staffId={staff.id}
      canSend={canSend}
      isSuper={staff.role === 'super_admin'}
    />
  );
}
