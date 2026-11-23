-- Flow 17 · a reader reports someone's comment on an author's post (create_report 'post_comment'):
-- once per reader, snapshot for staff, not your own comment, not a hidden comment or a draft post,
-- and the auto-hide action reaches the comment.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

-- Reader R, commenter C, author Au (all old accounts).
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('17000000-0000-4000-a000-000000000001', 'r@t17rp.local', '{"full_name":"Reader R"}', now() - interval '30 days'),
  ('17000000-0000-4000-a000-000000000002', 'c@t17rp.local', '{"full_name":"Commenter C"}', now() - interval '30 days'),
  ('17000000-0000-4000-a000-000000000003', 'au@t17rp.local', '{"full_name":"Author Au"}', now() - interval '30 days');
insert into public.author_posts (id, author_id, title, body, state, published_at) values
  ('17000000-0000-4000-e000-000000000001', '17000000-0000-4000-a000-000000000003', 'Hello', 'Welcome readers', 'published', now()),
  ('17000000-0000-4000-e000-000000000002', '17000000-0000-4000-a000-000000000003', 'Draft', 'Not yet', 'draft', null);
insert into public.post_comments (id, post_id, user_id, client_id, body, state) values
  ('17000000-0000-4000-f000-000000000001', '17000000-0000-4000-e000-000000000001', '17000000-0000-4000-a000-000000000002', gen_random_uuid(), 'Buy my stuff', 'visible'),
  ('17000000-0000-4000-f000-000000000002', '17000000-0000-4000-e000-000000000001', '17000000-0000-4000-a000-000000000002', gen_random_uuid(), 'Already hidden', 'auto_hidden'),
  ('17000000-0000-4000-f000-000000000003', '17000000-0000-4000-e000-000000000002', '17000000-0000-4000-a000-000000000002', gen_random_uuid(), 'On a draft', 'visible'),
  ('17000000-0000-4000-f000-000000000004', '17000000-0000-4000-e000-000000000001', '17000000-0000-4000-a000-000000000001', gen_random_uuid(), 'My own comment', 'visible');

select pg_temp.as_user('17000000-0000-4000-a000-000000000001');
select ok(public.create_report('post_comment', '17000000-0000-4000-f000-000000000001', 'other') like 'RPT-%',
  'a reader reports someone''s post comment');
-- Readers can't read reports; check what staff see as the owner.
select pg_temp.as_owner();
select is((select reported_user_id from public.reports where content_id = '17000000-0000-4000-f000-000000000001'),
  '17000000-0000-4000-a000-000000000002'::uuid, 'the report points at the commenter');
select is((select snapshot ->> 'body' from public.reports where content_id = '17000000-0000-4000-f000-000000000001'),
  'Buy my stuff', 'the report keeps the comment text for staff');
select pg_temp.as_user('17000000-0000-4000-a000-000000000001');
select throws_ok($$select public.create_report('post_comment', '17000000-0000-4000-f000-000000000001', 'other')$$,
  '23505', 'already_reported', 'the same comment is reported once');
select throws_ok($$select public.create_report('post_comment', '17000000-0000-4000-f000-000000000004', 'other')$$,
  '42501', 'own_content', 'you cannot report your own comment');
select throws_ok($$select public.create_report('post_comment', '17000000-0000-4000-f000-000000000002', 'other')$$,
  'P0002', 'not_found', 'a hidden comment cannot be reported');
select throws_ok($$select public.create_report('post_comment', '17000000-0000-4000-f000-000000000003', 'other')$$,
  'P0002', 'not_found', 'a comment on an unpublished post cannot be reported');

select pg_temp.as_owner();
select public._set_content_state('post_comment', '17000000-0000-4000-f000-000000000001', 'hidden');
select is((select state::text from public.post_comments where id = '17000000-0000-4000-f000-000000000001'),
  'auto_hidden', 'the hide action reaches the comment');

select * from finish();
rollback;
