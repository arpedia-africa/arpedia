-- Flow 06 · spec check 06-7 (set the pinned weekly reading) and 06-11 (appoint moderators, max 5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '20000000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- Owner 1, members 2 to 8 (8 is banned). Book with 3 chapters.
insert into auth.users (id, email)
select ('06c00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t06c.local' from generate_series(1, 8) n;
insert into public.profiles (id, full_name, is_author)
select ('06c00000-0000-4000-a000-00000000000' || n)::uuid, 'Member ' || n, n = 1 from generate_series(1, 8) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.groups (id, kind, name, visibility, owner_id, member_count) values
  ('06c00000-0000-4000-b000-000000000001', 'club', 'Tools Club', 'public', '06c00000-0000-4000-a000-000000000001', 8);
insert into public.group_members (group_id, user_id, role, banned_at)
select '06c00000-0000-4000-b000-000000000001', ('06c00000-0000-4000-a000-00000000000' || n)::uuid,
  (case when n = 1 then 'owner' else 'member' end)::public.group_role, case when n = 8 then now() end
from generate_series(1, 8) n;

insert into public.books (id, author_id, title, genres, status) values
  ('06c00000-0000-4000-c000-000000000001', '06c00000-0000-4000-a000-000000000001', 'Weekly Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent)
values ('06c00000-0000-4000-d000-000000000001', '06c00000-0000-4000-c000-000000000001', 1, 'live', 3000, 12, 6, 10);
update public.books set current_revision_id = '06c00000-0000-4000-d000-000000000001'
where id = '06c00000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, words_before, pages, price_credits)
select '06c00000-0000-4000-d000-000000000001', gen_random_uuid(), n, 'Ch ' || n, 1000, n * 1000, 4, 2
from generate_series(0, 2) n;

set local role authenticated;

-- ─── 06-11 ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('06c00000-0000-4000-a000-000000000002');
select throws_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000003')$$, '42501', null, 'a member cannot appoint moderators');

select pg_temp.as_user('06c00000-0000-4000-a000-000000000001');
select lives_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001', ('06c00000-0000-4000-a000-00000000000' || n)::uuid)
  from generate_series(2, 6) n$$, 'the owner appoints five moderators');
select is((select count(*)::int from public.group_members where group_id = '06c00000-0000-4000-b000-000000000001'
  and role = 'moderator'), 5, 'five moderators');
select throws_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000007')$$, '23514', 'moderator_limit', 'a sixth is refused');
select throws_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000008')$$, 'P0002', 'not_member', 'a banned member cannot be one');
select throws_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000001', false)$$, '22023', 'is_owner', 'the owner stays owner');
select lives_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000006', false)$$, 'the owner removes one');
select lives_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000008', false)$$, 'a banned member can still be stepped down');
select pg_temp.as_user('00000000-0000-4000-b000-000000000004');
select lives_ok($$select public.set_group_moderator('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-a000-000000000007')$$, 'a staff Moderator appoints one');
reset role;
select is((select count(*)::int from public.audit_log where action = 'channel.moderator_add'
  and object_id = '06c00000-0000-4000-b000-000000000001'), 1, 'staff changes are audited (owner changes are not)');
set local role authenticated;

-- ─── 06-7 ───────────────────────────────────────────────────────────────────
select pg_temp.as_user('06c00000-0000-4000-a000-000000000007');
select throws_ok($$select public.set_weekly_reading('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-c000-000000000001', 1, 4)$$, '22023', 'bad_chapters', 'chapters must exist in the book');
select throws_ok($$select public.set_weekly_reading('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-c000-000000000001', 1, 2, repeat('x', 121))$$, '22023', 'bad_note', 'the note is one short line');
select lives_ok($$select public.set_weekly_reading('06c00000-0000-4000-b000-000000000001',
  '06c00000-0000-4000-c000-000000000001', 1, 2, ' Read with us ')$$, 'a moderator sets the weekly reading');
reset role;
select is((select array[weekly_from_chapter, weekly_to_chapter] from public.groups
  where id = '06c00000-0000-4000-b000-000000000001'), array[1, 2], 'chapters stored');
select is((select weekly_note from public.groups where id = '06c00000-0000-4000-b000-000000000001'), 'Read with us',
  'note trimmed');
set local role authenticated;
select pg_temp.as_user('06c00000-0000-4000-a000-000000000006');
select throws_ok($$select public.set_weekly_reading('06c00000-0000-4000-b000-000000000001', null)$$, '42501', null,
  'a plain member cannot change it');
select pg_temp.as_user('06c00000-0000-4000-a000-000000000001');
select lives_ok($$select public.set_weekly_reading('06c00000-0000-4000-b000-000000000001', null)$$, 'owner clears');
reset role;
select is((select weekly_book_id from public.groups where id = '06c00000-0000-4000-b000-000000000001'), null,
  'the owner clears it');

select * from finish();
rollback;
