-- Flow 14 · spec check 14-4 and 08-2: readers can report reviews, discussion comments, post
-- comments and author posts; hide, restore, remove and mark-as-spoiler act on each.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('14400000-0000-4000-a000-000000000001', 'rep@t144.local', '{"full_name":"Reporter"}', now() - interval '30 days'),
  ('14400000-0000-4000-a000-000000000002', 'bad@t144.local', '{"full_name":"Poster"}', now() - interval '30 days'),
  ('14400000-0000-4000-a000-000000000003', 'au@t144.local', '{"full_name":"Author"}', now() - interval '90 days');
insert into public.books (id, author_id, title, status) values
  ('14400000-0000-4000-b000-000000000001', '14400000-0000-4000-a000-000000000003', 'Report Book', 'live');
insert into public.reviews (id, book_id, user_id, stars, body) values
  ('14400000-0000-4000-c000-000000000001', '14400000-0000-4000-b000-000000000001', '14400000-0000-4000-a000-000000000002', 1, 'The twist is that she dies');
insert into public.passage_comments (id, book_id, para_id, user_id, body) values
  ('14400000-0000-4000-c000-000000000002', '14400000-0000-4000-b000-000000000001', 'p1', '14400000-0000-4000-a000-000000000002', 'Buy followers here');
insert into public.author_posts (id, author_id, title, body, state, published_at) values
  ('14400000-0000-4000-c000-000000000003', '14400000-0000-4000-a000-000000000003', 'News', 'Book two soon', 'published', now());
insert into public.post_comments (id, post_id, user_id, client_id, body) values
  ('14400000-0000-4000-c000-000000000004', '14400000-0000-4000-c000-000000000003', '14400000-0000-4000-a000-000000000002', gen_random_uuid(), 'You are an idiot');

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- ─── create_report accepts every content type ───────────────────────────────
select pg_temp.as_user('14400000-0000-4000-a000-000000000001');
select ok(public.create_report('review', '14400000-0000-4000-c000-000000000001', 'spoilers') like 'RPT-%', 'a review can be reported');
select ok(public.create_report('discussion_comment', '14400000-0000-4000-c000-000000000002', 'spam') like 'RPT-%',
  'a discussion comment can be reported');
select ok(public.create_report('post_comment', '14400000-0000-4000-c000-000000000004', 'harassment') like 'RPT-%',
  'a comment on an author post can be reported');
select ok(public.create_report('author_post', '14400000-0000-4000-c000-000000000003', 'other') like 'RPT-%',
  'an author post can be reported');

select pg_temp.as_owner();
select is((select reported_user_id from public.reports where content_id = '14400000-0000-4000-c000-000000000004'),
  '14400000-0000-4000-a000-000000000002'::uuid, 'the report names the comment''s writer');
select is((select snapshot ->> 'body' from public.reports where content_id = '14400000-0000-4000-c000-000000000001'),
  'The twist is that she dies', 'and snapshots the review');

-- ─── content state per type ─────────────────────────────────────────────────
select public._set_content_state('review', '14400000-0000-4000-c000-000000000001', 'spoiler');
select is((select status || '/' || spoiler from public.reviews where id = '14400000-0000-4000-c000-000000000001'), 'visible/true',
  'mark as spoiler keeps a review visible, blurred');
select public._set_content_state('review', '14400000-0000-4000-c000-000000000001', 'removed');
select is((select status from public.reviews where id = '14400000-0000-4000-c000-000000000001'), 'hidden_by_mod',
  'remove hides a review');
select public._set_content_state('review', '14400000-0000-4000-c000-000000000001', 'visible');
select is((select status from public.reviews where id = '14400000-0000-4000-c000-000000000001'), 'visible',
  'keep restores it');

select public._set_content_state('discussion_comment', '14400000-0000-4000-c000-000000000002', 'hidden');
select is((select status from public.passage_comments where id = '14400000-0000-4000-c000-000000000002'), 'removed',
  'auto-hide takes a discussion comment down');

select public._set_content_state('post_comment', '14400000-0000-4000-c000-000000000004', 'hidden');
select is((select state::text from public.post_comments where id = '14400000-0000-4000-c000-000000000004'), 'auto_hidden',
  'auto-hide hides a post comment');
select public._set_content_state('post_comment', '14400000-0000-4000-c000-000000000004', 'removed');
select public._set_content_state('post_comment', '14400000-0000-4000-c000-000000000004', 'hidden');
select is((select state::text from public.post_comments where id = '14400000-0000-4000-c000-000000000004'), 'removed',
  'a removed comment is not brought back to auto-hidden');

select public._set_content_state('author_post', '14400000-0000-4000-c000-000000000003', 'removed');
select is((select state::text from public.author_posts where id = '14400000-0000-4000-c000-000000000003'), 'removed',
  'remove takes an author post down');
select public._set_content_state('author_post', '14400000-0000-4000-c000-000000000003', 'visible');
select is((select state::text from public.author_posts where id = '14400000-0000-4000-c000-000000000003'), 'published',
  'keep republishes it');

-- ─── hidden content can't be reported ───────────────────────────────────────
select public._set_content_state('review', '14400000-0000-4000-c000-000000000001', 'removed');
select pg_temp.as_user('14400000-0000-4000-a000-000000000003');
select throws_ok($$ select public.create_report('review', '14400000-0000-4000-c000-000000000001', 'spam') $$,
  'P0002', 'not_found', 'a hidden review can''t be reported');
select throws_ok($$ select public.create_report('discussion_comment', '14400000-0000-4000-c000-000000000002', 'spam') $$,
  'P0002', 'not_found', 'nor a removed discussion comment');

select * from finish();
rollback;
