-- Flow 02 · spec check 02-18 and 02-19.
--   02-18: Top 10 honours pins as well as excluded books (Discover curation: automatic sections
--          "accept pins and excluded books"). A pinned book holds its slot (its shelf position + 1,
--          1 to 10; pins that collide take the next free slot); the most read books fill the rest.
--   02-19: a trending search that maps to exactly one author now carries author_id (when it doesn't
--          map to exactly one book), and get_close_matches gives the no-results "You might like":
--          the most read books in the genre closest to the query, or overall.

-- ─── 02-18 ──────────────────────────────────────────────────────────────────
create or replace function public.get_top10() returns jsonb
language sql stable security definer set search_path = '' as $$
  with h as (
    select id from public.home_sections where key = 'top10'
  ), pins as (
    select s.item_id as book_id, least(s.position + 1, 10) as want,
           row_number() over (order by s.position, s.item_id) as k
    from public.shelf_items s
    join h on h.id = s.section_id
    join public.catalog_books c on c.id = s.item_id
    where s.item_type = 'book' and s.pinned and not s.excluded
  ), pin_slots as (
    -- Each pin takes the slot it wants, or the next free one after the pins before it.
    select book_id, k + max(want - k) over (order by k rows unbounded preceding) as slot from pins
  ), placed as (
    select book_id, slot from pin_slots where slot <= 10
  ), free as (
    select g.slot, row_number() over (order by g.slot) as k
    from generate_series(1, 10) g(slot)
    where not exists (select 1 from placed p where p.slot = g.slot)
  ), cur as (
    select r.book_id, row_number() over (order by r.rank) as k
    from public.book_rankings r
    where r.kind = 'hourly' and r.snapshot_at = public._latest_hourly()
      and not exists (select 1 from public.shelf_items s join h on h.id = s.section_id
                      where s.item_type = 'book' and s.item_id = r.book_id and (s.excluded or s.pinned))
  ), ranked as (
    select book_id, slot as rank from placed
    union all
    select cur.book_id, free.slot from cur join free on free.k = cur.k
  ), prev as (
    select r.book_id, r.rank from public.book_rankings r
    where r.kind = 'weekly' and r.snapshot_at = (select max(snapshot_at) from public.book_rankings where kind = 'weekly')
  )
  select coalesce(jsonb_agg(public._book_json(c) || jsonb_build_object('rank', k.rank,
      'prev_rank', case when p.rank <= 10 then p.rank end) order by k.rank), '[]')
  from ranked k join public.catalog_books c on c.id = k.book_id left join prev p on p.book_id = k.book_id
  where k.rank <= 10
$$;

-- ─── 02-19: trending query → one author ─────────────────────────────────────
create or replace function public.get_search_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trending', coalesce((select jsonb_agg(jsonb_build_object('query', t.query_norm, 'searchers', t.n,
        'book_id', t.book_id, 'author_id', case when t.book_id is null then t.author_id end)
        order by t.n desc, t.query_norm) from (
      select e.query_norm, count(distinct e.user_id)::int as n,
        (select case when count(*) = 1 then min(b.id::text)::uuid end from public._search_books(e.query_norm) b) as book_id,
        (select case when count(*) = 1 then min(a.id::text)::uuid end from public._search_authors(e.query_norm) a) as author_id
      from public.search_events e
      where e.created_at > now() - interval '7 days' and e.result_count > 0 and e.user_id is not null
        and not exists (select 1 from public.banned_tags bt
          where cardinality(public.norm_words(bt.word)) > 0
            and strpos(' ' || array_to_string(public.norm_words(e.query_norm), ' ') || ' ',
                       ' ' || array_to_string(public.norm_words(bt.word), ' ') || ' ') > 0)
      group by e.query_norm
      having count(distinct e.user_id) >= 20
      order by count(distinct e.user_id) desc, e.query_norm limit 5) t), '[]'),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug,
        'book_count', g.book_count) order by g.position) from (
      select * from public.genre_book_counts where visible order by position limit 6) g), '[]'),
    'authors', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name,
        'avatar_url', a.avatar_url) order by a.ord) from (
      select p.id, p.full_name, p.avatar_url, s.position as ord
      from public.shelf_items s join public.home_sections h on h.id = s.section_id and h.key = 'authors'
      join public.profiles p on p.id = s.item_id
      where s.item_type = 'author' and not s.excluded
      order by s.position limit 6) a), '[]'))
  where public._uid() is not null
$$;

-- ─── 02-19: "You might like" on no results (rule 27) ────────────────────────
-- {genre: {slug, name} | null, items: up to 3 most read books}. The closest genre is the visible
-- genre whose name shares the most words with the query (3+ letters, prefix or one typo, as search
-- does); none matches → overall.
create function public.get_close_matches(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := public.norm_query(p_q);
  v_slug text;
  v_name text;
begin
  perform public._uid();
  if char_length(q) >= 2 then
    select x.slug, x.name into v_slug, v_name from (
      select gc.slug, gc.name, gc.position,
             (select count(*) from unnest(public.norm_words(q)) qw
              where char_length(qw) >= 3
                and exists (select 1 from unnest(public.norm_words(gc.name)) w where public.word_hits(qw, w, 1))) as score
      from public.genre_book_counts gc where gc.visible and gc.book_count > 0) x
    where x.score > 0
    order by x.score desc, x.position limit 1;
  end if;
  return jsonb_build_object(
    'genre', case when v_slug is not null then jsonb_build_object('slug', v_slug, 'name', v_name) end,
    'items', coalesce(public.list_books(v_slug, null, 'most_read', null, 3) -> 'items', '[]'::jsonb));
end $$;

revoke execute on function public.get_close_matches(text) from public, anon;
grant execute on function public.get_close_matches(text) to authenticated;
