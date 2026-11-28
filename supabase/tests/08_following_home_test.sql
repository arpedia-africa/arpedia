-- Flow 08 rule 6 / spec check 08-11: the "From authors you follow" Home section.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- 01 reader who follows 21, 02 reader who follows nobody; 21 and 22 are authors.
insert into auth.users (id, email)
select ('08110000-0000-4000-a000-0000000000' || n)::uuid, 'u' || n || '@t0811.local'
from unnest(array['01', '02', '21', '22']) n;
insert into public.profiles (id, full_name, is_author) values
  ('08110000-0000-4000-a000-000000000021', 'Followed Author', true),
  ('08110000-0000-4000-a000-000000000022', 'Other Author', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.follows (follower_id, followee_id) values
  ('08110000-0000-4000-a000-000000000001', '08110000-0000-4000-a000-000000000021');

-- Books 01-12 by author 21 (01 is a draft), 13 by author 22. Book n published n days ago.
insert into public.books (id, author_id, title, genres, status)
select ('08110000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  case when n <= 12 then '08110000-0000-4000-a000-000000000021' else '08110000-0000-4000-a000-000000000022' end::uuid,
  'Following Book ' || n, '{Fiction}', case when n = 1 then 'draft' else 'live' end::public.book_status
from generate_series(1, 13) n;
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord, published_at)
select ('08110000-0000-4000-d000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('08110000-0000-4000-c000-0000000000' || lpad(n::text, 2, '0'))::uuid, 1,
  case when n = 1 then 'draft' else 'live' end::public.revision_status, 50000, 200, 100, 10, 0,
  now() - make_interval(days => n)
from generate_series(1, 13) n;
update public.books set current_revision_id = ('08110000-0000-4000-d000-' || right(id::text, 12))::uuid
where id::text like '08110000-0000-4000-c000-%';

create function pg_temp.following() returns jsonb language sql as $$
  select s -> 'items' from jsonb_array_elements(public.get_home() -> 'sections') s where s ->> 'key' = 'following'
$$;
grant execute on function pg_temp.following() to authenticated;

select is(
  (select array_agg(key order by position) from public.home_sections where key in ('recommended', 'following', 'genres')),
  array['recommended', 'following', 'genres'], 'the section sits after Recommended, before Browse genres');
select is((select kind from public.home_sections where key = 'following'), 'automatic', 'it is an automatic section');

set local role authenticated;
select pg_temp.as_user('08110000-0000-4000-a000-000000000001');
select is(jsonb_array_length(pg_temp.following()), 10, 'at most max_items (10) books');
select is((select array_agg(right(e ->> 'id', 2) order by o) from jsonb_array_elements(pg_temp.following())
             with ordinality x(e, o) where o <= 3),
  array['02', '03', '04'], 'newest books by followed authors first');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.following()) e
                      where right(e ->> 'id', 2) in ('01', '13')),
  'no draft book and no book by an author the reader does not follow');
select is((pg_temp.following() -> 0 ->> 'author_name'), 'Followed Author', 'items are book cards like other rails');

select pg_temp.as_user('08110000-0000-4000-a000-000000000002');
select is(pg_temp.following(), '[]'::jsonb, 'a reader who follows nobody gets an empty section (the app hides it)');

reset role;
insert into public.shelf_items (section_id, item_type, item_id, position, pinned, excluded)
select id, 'book', '08110000-0000-4000-c000-000000000002', 0, false, true from public.home_sections where key = 'following';
set local role authenticated;
select pg_temp.as_user('08110000-0000-4000-a000-000000000001');
select is(right(pg_temp.following() -> 0 ->> 'id', 2), '03', 'a book staff excluded drops out');

select * from finish();
rollback;
