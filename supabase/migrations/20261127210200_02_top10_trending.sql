-- Flow 02 · spec check 02-18 and 02-19.
-- 02-18: Top 10 honours pins (Admin: automatic sections "accept pins and excluded books"), like
--        New arrivals: pinned books first in pin order, then the most read; excluded books never.
-- 02-19: a trending query that maps to exactly one author opens that author (rule 20), and
--        get_close_matches gives "You might like" on no results: the most read books in the
--        genre closest to the query, or overall when no genre is close (rule 27).

-- ─── 02-18: Top 10 with pins ────────────────────────────────────────────────
create or replace function public.get_top10() returns jsonb
language sql stable security definer set search_path = '' as $$
  with sec as (
    select s.item_id, s.position, s.pinned, s.excluded
    from public.shelf_items s join public.home_sections h on h.id = s.section_id
    where h.key = 'top10' and s.item_type = 'book'
  ), cur as (
    select c.id as book_id, r.rank, case when sec.pinned then sec.position end as pin_pos
    from public.catalog_books c
    left join public.book_rankings r
      on r.book_id = c.id and r.kind = 'hourly' and r.snapshot_at = public._latest_hourly()
    left join sec on sec.item_id = c.id
    where (r.book_id is not null or coalesce(sec.pinned, false))
      and not coalesce(sec.excluded, false)
  ), ranked as (
    select cur.book_id,
      row_number() over (order by cur.pin_pos nulls last, cur.rank nulls last, cur.book_id) as rank
    from cur
  ), prev as (
    select r.book_id, r.rank from public.book_rankings r
    where r.kind = 'weekly' and r.snapshot_at = (select max(snapshot_at) from public.book_rankings where kind = 'weekly')
  )
  select coalesce(jsonb_agg(public._book_json(c) || jsonb_build_object('rank', k.rank,
      'prev_rank', case when p.rank <= 10 then p.rank end) order by k.rank), '[]')
  from ranked k join public.catalog_books c on c.id = k.book_id left join prev p on p.book_id = k.book_id
  where k.rank <= 10
$$;

-- ─── 02-19: trending query to one book or one author ───────────────────────
-- One book: exactly one book matches and no author, or the only author is that book's.
-- One author: exactly one author matches and every matching book is theirs (with two or more
-- books, the author page is the one place that holds them all).
create function public._trending_target(p_q text) returns table (book_id uuid, author_id uuid)
language sql stable security definer set search_path = '' as $$
  with b as (select s.id, c.author_id from public._search_books(p_q) s
             join public.search_catalog c on c.id = s.id),
  a as (select id from public._search_authors(p_q)),
  n as (select (select count(*) from b) as books, (select count(*) from a) as authors,
               (select min(id::text)::uuid from a) as the_author)
  select
    case when n.books = 1 and (n.authors = 0 or (n.authors = 1 and (select author_id from b) = n.the_author))
         then (select id from b) end,
    case when n.authors = 1 and n.books <> 1 and not exists (select 1 from b where b.author_id <> n.the_author)
         then n.the_author end
  from n
$$;

create or replace function public.get_search_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trending', coalesce((select jsonb_agg(jsonb_build_object('query', t.query_norm, 'searchers', t.n,
        'book_id', tt.book_id, 'author_id', tt.author_id) order by t.n desc, t.query_norm) from (
      select e.query_norm, count(distinct e.user_id)::int as n
      from public.search_events e
      where e.created_at > now() - interval '7 days' and e.result_count > 0 and e.user_id is not null
        and not exists (select 1 from public.banned_tags bt
          where cardinality(public.norm_words(bt.word)) > 0
            and strpos(' ' || array_to_string(public.norm_words(e.query_norm), ' ') || ' ',
                       ' ' || array_to_string(public.norm_words(bt.word), ' ') || ' ') > 0)
      group by e.query_norm
      having count(distinct e.user_id) >= 20
      order by count(distinct e.user_id) desc, e.query_norm limit 5) t
      cross join lateral public._trending_target(t.query_norm) tt), '[]'),
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

-- ─── 02-19: "You might like" on no results ─────────────────────────────────
-- The closest genre is the visible genre whose name is most like the query (trigram word
-- similarity above 0.3); up to 3 of its most read books, else the 3 most read overall.
create function public.get_close_matches(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := public.norm_query(p_q);
  v_genre text;
  v jsonb;
begin
  perform public._uid();
  if char_length(q) >= 2 then
    select g.name into v_genre
    from public.genre_book_counts g
    where g.visible and g.book_count > 0
      and extensions.word_similarity(q, lower(g.name)) > 0.3
    order by extensions.word_similarity(q, lower(g.name)) desc, g.position
    limit 1;
  end if;
  select coalesce(jsonb_agg(x.j order by x.rank nulls last, x.published_at desc), '[]') into v
  from (
    select public._book_json(c) as j, r.rank, c.published_at
    from public.catalog_books c
    left join public.book_rankings r
      on r.book_id = c.id and r.kind = 'hourly' and r.snapshot_at = public._latest_hourly()
    where v_genre is null or exists (select 1 from unnest(c.genres) x where lower(x) = lower(v_genre))
    order by r.rank nulls last, c.published_at desc
    limit 3
  ) x;
  return jsonb_build_object('genre', v_genre, 'items', v);
end $$;

revoke all on function public._trending_target(text) from public, anon, authenticated;
revoke all on function public.get_close_matches(text) from public, anon;
grant execute on function public.get_close_matches(text) to authenticated;
