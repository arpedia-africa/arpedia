import { serverSupabase } from '@/lib/supabase/server';
import { NewBookForm, type Author } from './client';

const AV = ['r', 'g', 'b', 'o', 'm', 't', 'n', 'k'];
const avClass = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV[h % AV.length]!;
};

/** Upload a book (s-book-new, rule 51): staff upload on an author's behalf; `q` searches authors. */
export default async function NewBookPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const supabase = await serverSupabase();
  let query = supabase.from('profiles').select('id, full_name, username').eq('is_author', true);
  const term = q.trim().replace(/[%_,()]/g, ' ');
  if (term) query = query.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`);
  const [{ data: people, error }, { data: genreRows }] = await Promise.all([
    query.order('full_name').limit(6),
    supabase.from('books').select('genres').in('status', ['live', 'scheduled']).limit(500),
  ]);
  if (error) throw error;
  const ids = (people ?? []).map(p => p.id);
  const { data: live } = ids.length
    ? await supabase.from('books').select('author_id').eq('status', 'live').in('author_id', ids)
    : { data: [] };
  const counts = new Map<string, number>();
  for (const b of live ?? []) counts.set(b.author_id, (counts.get(b.author_id) ?? 0) + 1);
  const authors: Author[] = (people ?? []).map(p => ({
    id: p.id,
    name: p.full_name,
    handle: p.username ? `@${p.username}` : '',
    live: counts.get(p.id) ?? 0,
    av: avClass(p.id),
  }));
  const genres = [...new Set((genreRows ?? []).flatMap(b => b.genres ?? []))].sort();
  return <NewBookForm q={q} authors={authors} genres={genres} />;
}
