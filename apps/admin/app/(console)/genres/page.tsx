import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { GenresView, type GenreRow, type MergeSuggestion, type TagRow } from './client';

/** Groups tags that differ only by case, accents, a trailing "s" or "life"/"hood" endings. */
function mergeSuggestions(tags: TagRow[]): MergeSuggestion[] {
  const stem = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\b(life|hood|s)$/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const groups = new Map<string, TagRow[]>();
  for (const t of tags) {
    const k = stem(t.name);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => {
      const sorted = [...g].sort((a, b) => b.books - a.books);
      return { keep: sorted[0]!, merge: sorted.slice(1), books: g.reduce((n, t) => n + t.books, 0) };
    })
    .sort((a, b) => b.books - a.books)
    .slice(0, 5);
}

/** Genres and tags (s-genres): order and show/hide genres, onboarding counts, merge and ban tags. */
export default async function GenresPage() {
  const staff = await requireStaff();
  if (!canOpen('genres', staff.permissions)) return <NoAccess page="genres" label="Genres and tags" role={staff.role} />;
  const supabase = await serverSupabase();
  const [genres, picks, tags, bookTags, banned] = await Promise.all([
    supabase.from('genre_book_counts').select('id, name, position, visible, book_count').order('position'),
    supabase.rpc('genre_pick_counts'),
    supabase.from('tags').select('id, name').is('merged_into', null),
    supabase.from('book_tags').select('tag_id'),
    supabase.from('banned_tags').select('word').order('word'),
  ]);
  const picked = new Map((picks.data ?? []).map(p => [p.genre_id, p.readers]));
  const perTag = new Map<string, number>();
  for (const r of bookTags.data ?? []) perTag.set(r.tag_id, (perTag.get(r.tag_id) ?? 0) + 1);

  const rows: GenreRow[] = (genres.data ?? []).map(g => ({
    id: g.id!,
    name: g.name ?? '',
    visible: g.visible ?? true,
    books: g.book_count ?? 0,
    readers: picked.get(g.id!) ?? 0,
  }));
  const tagRows: TagRow[] = (tags.data ?? [])
    .map(t => ({ id: t.id, name: t.name, books: perTag.get(t.id) ?? 0 }))
    .sort((a, b) => b.books - a.books);

  return (
    <GenresView
      genres={rows}
      tags={tagRows}
      suggestions={mergeSuggestions(tagRows)}
      banned={(banned.data ?? []).map(b => b.word)}
      error={!!genres.error}
    />
  );
}
