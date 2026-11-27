-- Flow 02 · spec check 02-18 (Top 10 honours pins) and 02-19 (a trending search for one author
-- carries the author; "You might like" uses the closest genre).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Users 01..20 search; user 21 is the author.
insert into auth.users (id, email)
select ('02180000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@t0218.local'
from generate_series(1, 21) n;
insert into public.profiles (id, full_name, is_author)
select ('02180000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       case when n = 21 then 'Zqauthor Unique' else 'Reader ' || n end, n = 21
from generate_series(1, 21) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.genres (name, slug, position, visible) values ('Qzpoetry', 'qzpoetry', 99, true);

-- Books 01..12: 01..10 Fiction, 11..12 Qzpoetry.
insert into public.books (id, author_id, title, genres, status)
select ('02180000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid, '02180000-0000-4000-a000-000000000021',
  'Vxq Title ' || n, case when n > 10 then '{Qzpoetry}' else '{Fiction}' end::text[], 'live'
from generate_series(1, 12) n;
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord)
select ('02180000-0000-4000-d000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('02180000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid, 1, 'live', 50000, 200, 100, 10, 0
from generate_series(1, 12) n;
update public.books set current_revision_id = ('02180000-0000-4000-d000-' || right(id::text, 12))::uuid
where id::text like '02180000-0000-4000-c000-%';

-- The latest hourly ranking: book n at rank n.
insert into public.book_rankings (snapshot_at, kind, book_id, rank, readers_7d)
select now() + interval '1 minute', 'hourly', ('02180000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  n, 100 - n
from generate_series(1, 12) n;

-- Top 10 shelf: book 12 pinned first, book 11 pinned fifth, book 1 excluded.
delete from public.shelf_items where section_id = (select id from public.home_sections where key = 'top10');
insert into public.shelf_items (section_id, item_type, item_id, position, pinned, excluded)
select h.id, 'book', v.book::uuid, v.pos, v.pinned, v.excluded
from public.home_sections h,
  (values ('02180000-0000-4000-c000-000000000012', 0, true, false),
          ('02180000-0000-4000-c000-000000000011', 4, true, false),
          ('02180000-0000-4000-c000-000000000001', 1, false, true)) v(book, pos, pinned, excluded)
where h.key = 'top10';

select set_config('request.jwt.claims', '{"sub":"02180000-0000-4000-a000-000000000001","role":"authenticated"}', true);

-- ─── 02-18 ──────────────────────────────────────────────────────────────────
create temporary table t10 as
  select (x ->> 'rank')::int as rank, right(x ->> 'id', 2)::int as book from jsonb_array_elements(public.get_top10()) x;
select is((select count(*)::int from t10), 10, 'still ten books');
select is((select book from t10 where rank = 1), 12, 'a book pinned first is first, though it ranks 12th');
select is((select book from t10 where rank = 5), 11, 'a book pinned fifth is fifth');
select is(array(select book from t10 where rank not in (1, 5) order by rank), array[2, 3, 4, 5, 6, 7, 8, 9],
  'the most read fill the other slots, the excluded book is left out');
update public.shelf_items set position = 0
 where item_id = '02180000-0000-4000-c000-000000000011' and pinned;
select is(array(select right(x ->> 'id', 2)::int from jsonb_array_elements(public.get_top10()) x
                where (x ->> 'rank')::int <= 3 order by (x ->> 'rank')::int), array[11, 12, 2],
  'two pins on one slot take it and the next');

-- ─── 02-19 ──────────────────────────────────────────────────────────────────
insert into public.search_events (user_id, query_norm, result_count)
select ('02180000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'zqauthor unique', 12
from generate_series(1, 20) n;
create temporary table sh as
  select x from jsonb_array_elements(public.get_search_home() -> 'trending') x where x ->> 'query' = 'zqauthor unique';
select is((select x ->> 'author_id' from sh), '02180000-0000-4000-a000-000000000021',
  'a trending search for one author opens the author');
select is((select x -> 'book_id' from sh), 'null'::jsonb, 'it matches many books, so no single book');

select is(public.get_close_matches('qzpoetry for rainy days') -> 'genre' ->> 'slug', 'qzpoetry',
  'no results: the closest genre by name');
select is((select array_agg(right(x ->> 'id', 2)::int order by right(x ->> 'id', 2)::int)
           from jsonb_array_elements(public.get_close_matches('qzpoetry for rainy days') -> 'items') x),
  array[11, 12], 'and its most read books');
select is(public.get_close_matches('xx yy') -> 'genre', 'null'::jsonb, 'no genre close: most read overall');

select * from finish();
rollback;
