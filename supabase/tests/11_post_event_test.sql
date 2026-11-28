-- Flow 11 · 11-14 (Analytics: author_post_created), server half: the event reaches the analytics
-- outbox once when a post first goes live, from the author, with no title or body.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('11140000-0000-4000-a000-000000000001', 'u1@flow1114.test');
insert into public.profiles (id, full_name, is_author)
values ('11140000-0000-4000-a000-000000000001', 'User 1', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, status) values
  ('11140000-0000-4000-b000-000000000001', '11140000-0000-4000-a000-000000000001', 'Harmattan Road', 'live');
delete from public.analytics_outbox;

create function pg_temp.n() returns int
language sql as $$ select count(*)::int from public.analytics_outbox where event = 'author_post_created' $$;
create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- Through Studio's Post an update.
set local role authenticated;
select pg_temp.as_user('11140000-0000-4000-a000-000000000001');
select public.publish_author_post('Chapter 12 is out', 'Thank you for reading!', '11140000-0000-4000-b000-000000000001');
select public.publish_author_post('Chapter 12 is out', 'Thank you for reading!', '11140000-0000-4000-b000-000000000001');
reset role;
select is(pg_temp.n(), 1, 'one event per post; a retry returns the first post and adds nothing');
select is((select props from public.analytics_outbox where event = 'author_post_created'),
  '{"has_book": true, "source": "server"}'::jsonb, 'author_post_created {has_book}; no title or body');
select is((select distinct_id from public.analytics_outbox where event = 'author_post_created'),
  '11140000-0000-4000-a000-000000000001', 'from the author');

-- A draft is not counted until it goes live, and then once.
insert into public.author_posts (id, author_id, title, body) values
  ('11140000-0000-4000-c000-000000000001', '11140000-0000-4000-a000-000000000001', 'Draft', 'Not yet');
select is(pg_temp.n(), 1, 'a draft is not counted');
update public.author_posts set state = 'published', published_at = now() where id = '11140000-0000-4000-c000-000000000001';
select is((select props from public.analytics_outbox where event = 'author_post_created' order by id desc limit 1),
  '{"has_book": false, "source": "server"}'::jsonb, 'a draft that goes live is counted, without a book');

-- Hidden by moderation and restored: not a new post.
update public.author_posts set state = 'removed' where id = '11140000-0000-4000-c000-000000000001';
update public.author_posts set state = 'published' where id = '11140000-0000-4000-c000-000000000001';
select is(pg_temp.n(), 2, 'a post restored after moderation is not counted again');

-- A post stored as published straight away (seed, staff tools) counts too.
insert into public.author_posts (author_id, title, body, state, published_at)
values ('11140000-0000-4000-a000-000000000001', 'Another', 'Hello again', 'published', now());
select is(pg_temp.n(), 3, 'a post inserted as published is counted');

select * from finish();
