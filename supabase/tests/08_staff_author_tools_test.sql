-- Flow 08 · spec check 08-12: staff message an author and edit their profile from the admin author
-- page. Support, Operations admin and Super admin only; both are audited.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1 author · 2 support · 3 publisher (not allowed) · 4 reader.
insert into auth.users (id, email, created_at)
select ('80120000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t812.local', now() - interval '60 days'
from generate_series(1, 4) n;
insert into public.profiles (id, full_name, is_author)
select ('80120000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 1 from generate_series(1, 4) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.author_profiles (user_id, pen_name, bio, location) values
  ('80120000-0000-4000-a000-000000000001', 'Ifeoma N.', 'Writes about faith.', 'Enugu, Nigeria');
insert into public.staff_roles (user_id, role) values
  ('80120000-0000-4000-a000-000000000002', 'support'),
  ('80120000-0000-4000-a000-000000000003', 'publisher');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

-- ─── Message ────────────────────────────────────────────────────────────────
select pg_temp.as_user('80120000-0000-4000-a000-000000000002');
select is(public.staff_message_author('80120000-0000-4000-a000-000000000001', '  Your book is featured this week!  ') ->> 'ok',
  'true', 'support messages the author');
select is((select message -> 'data' -> 'vars' ->> 'body' from pgmq.q_push_fanout
           where message -> 'user_ids' ? '80120000-0000-4000-a000-000000000001' and message ->> 'type' = 'account_notice'
           order by msg_id desc limit 1),
  'Your book is featured this week!', 'the author gets it as a push, trimmed');
select is((select after ->> 'body' from public.audit_log where action = 'author.message'
             and object_id = '80120000-0000-4000-a000-000000000001'),
  'Your book is featured this week!', 'and the message is in the audit log');
select throws_ok($$select public.staff_message_author('80120000-0000-4000-a000-000000000001', '   ')$$,
  'P0001', 'bad_body', 'an empty message is refused');
select throws_ok($$select public.staff_message_author('80120000-0000-4000-a000-000000000004', 'Hello')$$,
  'P0001', 'not_author', 'only authors can be messaged from here');

-- ─── Edit profile ───────────────────────────────────────────────────────────
select is(public.staff_update_author_profile('80120000-0000-4000-a000-000000000001', 'Ifeoma Nwachukwu',
  'Writes about faith and family.', '') ->> 'changed', 'true', 'support edits the profile');
select results_eq($$select pen_name, bio, location from public.author_profiles
                    where user_id = '80120000-0000-4000-a000-000000000001'$$,
  $$values ('Ifeoma Nwachukwu', 'Writes about faith and family.', null::text)$$,
  'the new pen name and bio are saved; an empty location clears it');
select is((select before ->> 'pen_name' from public.audit_log where action = 'author.profile_edit'
             and object_id = '80120000-0000-4000-a000-000000000001'),
  'Ifeoma N.', 'the old values are audited');
select is(public.staff_update_author_profile('80120000-0000-4000-a000-000000000001', 'Ifeoma Nwachukwu',
  'Writes about faith and family.', null) ->> 'changed', 'false', 'saving the same profile changes nothing');
select throws_ok($$select public.staff_update_author_profile('80120000-0000-4000-a000-000000000001', ' ', '', '')$$,
  'P0001', 'bad_pen_name', 'a pen name is needed');

-- ─── Roles ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('80120000-0000-4000-a000-000000000003');
select throws_ok($$select public.staff_message_author('80120000-0000-4000-a000-000000000001', 'Hi')$$,
  '42501', null, 'a publisher cannot message authors from here');
select pg_temp.as_user('80120000-0000-4000-a000-000000000004');
select throws_ok($$select public.staff_update_author_profile('80120000-0000-4000-a000-000000000001', 'X', '', '')$$,
  '42501', null, 'a reader cannot edit an author profile');

select * from finish();
rollback;
