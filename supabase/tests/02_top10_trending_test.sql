-- Flow 02 · spec check 02-18 (Top 10 honours pins) and 02-19 (a trending query that maps to one
-- author opens it; "You might like" uses the closest genre).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Users 01-20 search, 21 and 22 are authors.
insert into auth.users (id, email)
select ('02180000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@t0218.local'
from generate_series(1, 22) n;
insert into public.profiles (id, full_name, is_author) values
  ('02180000-0000-4000-a000-000000000021', 'Vexley Quorn', true),
  ('02180000-0000-4000-a000-000000000022', 'Tomi Adeyemi Bakare', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.genres (name, slug, position) values ('Zorblit', 'zorblit', 99);

-- 12 live books: 1-2 by Vexley Quorn (Zorblit), 3-12 by the other author; 12 is not ranked.
insert into public.books (id, author_id, title, genres, status)
select ('02180000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  case when n <= 2 then '02180000-0000-4000-a000-000000000021' else '02180000-0000-4000-a000-000000000022' end::uuid,
  case n when 1 then 'Okra Season' when 2 then 'Dry Lagoon' when 3 then 'Harmattan Lanterns' else 'Kpxq Book ' || n end,
  case when n <= 2 then '{Zorblit}' else '{Fiction}' end::text[], 'live'
from generate_series(1, 12) n;
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord)
select ('02180000-0000-4000-d000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('02180000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid, 1, 'live', 50000, 200, 100, 10, 0
from generate_series(1, 12) n;
update public.books set current_revision_id = ('02180000-0000-4000-d000-' || right(id::text, 12))::uuid
where id::text like '02180000-0000-4000-c000-%';

-- The hourly ranking holds only books 1-11 (rank = book number), so seeded books stay out.
delete from public.book_rankings;
insert into public.book_rankings (snapshot_at, kind, book_id, rank)
select now(), 'hourly', ('02180000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid, n
from generate_series(1, 11) n;
delete from public.shelf_items where section_id = (select id from public.home_sections where key = 'top10');

create function pg_temp.top_ids() returns text[] language sql as $$
  select array_agg(right(e ->> 'id', 2) order by (e ->> 'rank')::int) from jsonb_array_elements(public.get_top10()) e
$$;

-- 02-18
select is(pg_temp.top_ids(), array['01','02','03','04','05','06','07','08','09','10'],
  'with no pins, the Top 10 is the ranking');
insert into public.shelf_items (section_id, item_type, item_id, position, pinned, excluded)
select h.id, 'book', v.id::uuid, v.pos, v.pinned, v.excluded
from public.home_sections h,
  (values ('02180000-0000-4000-c000-000000000012', 0, true, false),
          ('02180000-0000-4000-c000-000000000009', 1, true, false),
          ('02180000-0000-4000-c000-000000000001', 2, false, true)) v(id, pos, pinned, excluded)
where h.key = 'top10';
select is(pg_temp.top_ids(), array['12','09','02','03','04','05','06','07','08','10'],
  'pinned books lead in pin order (even one with no reads), excluded books drop out');
select is((select count(*)::int from jsonb_array_elements(public.get_top10())), 10, 'still ten books');

-- 02-19: trending targets (only these queries trend in this test)
delete from public.search_events;
insert into public.search_events (user_id, query_norm, result_count)
select ('02180000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, q, 3
from generate_series(1, 20) n, unnest(array['vexley quorn', 'harmattan lanterns', 'kpxq book']) q;

select is((select book_id from public._trending_target('harmattan lanterns')),
  '02180000-0000-4000-c000-000000000003'::uuid, 'a query with one book opens the book');
select is((select author_id from public._trending_target('harmattan lanterns')), null::uuid, '... not an author');
select is((select author_id from public._trending_target('vexley quorn')),
  '02180000-0000-4000-a000-000000000021'::uuid, 'a query with one author and only their books opens the author');
select is((select book_id from public._trending_target('vexley quorn')), null::uuid, '... not a book');
select ok((select book_id is null and author_id is null from public._trending_target('kpxq book')),
  'a query with many books opens the results');

select set_config('request.jwt.claims', '{"sub":"02180000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select t ->> 'author_id' from jsonb_array_elements(public.get_search_home() -> 'trending') t
           where t ->> 'query' = 'vexley quorn'), '02180000-0000-4000-a000-000000000021',
  'Search home carries the author for that trending query');

-- 02-19: You might like
select is(public.get_close_matches('zorblitt') ->> 'genre', 'Zorblit', 'a near miss finds the closest genre');
select is((select array_agg(right(e ->> 'id', 2) order by o) from jsonb_array_elements(
             public.get_close_matches('zorblitt') -> 'items') with ordinality x(e, o)), array['01','02'],
  'and gives that genre''s most read books');
select is((select array_agg(right(e ->> 'id', 2) order by o) from jsonb_array_elements(
             public.get_close_matches('qqjjww') -> 'items') with ordinality x(e, o)), array['01','02','03'],
  'no close genre: the 3 most read overall');

select * from finish();
rollback;
