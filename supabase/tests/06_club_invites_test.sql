-- Flow 06 · spec check 06-20: private clubs are joined by invitation link.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '20000000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- 1 owner, 2 moderator, 3 member, 4 outsider, 5 banned, 6 muted-then-left. Groups: private club,
-- public club, private archived club.
insert into auth.users (id, email)
select ('06d00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t06d.local' from generate_series(1, 6) n;
insert into public.profiles (id, full_name)
select ('06d00000-0000-4000-a000-00000000000' || n)::uuid, 'Person ' || n from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name;
insert into public.groups (id, kind, name, description, visibility, owner_id, archived_at) values
  ('06d00000-0000-4000-b000-000000000001', 'club', 'Secret Club', 'Invite only', 'private',
   '06d00000-0000-4000-a000-000000000001', null),
  ('06d00000-0000-4000-b000-000000000002', 'club', 'Open Club', null, 'public',
   '06d00000-0000-4000-a000-000000000001', null),
  ('06d00000-0000-4000-b000-000000000003', 'club', 'Old Club', null, 'private',
   '06d00000-0000-4000-a000-000000000001', now());
insert into public.group_members (group_id, user_id, role, banned_at) values
  ('06d00000-0000-4000-b000-000000000001', '06d00000-0000-4000-a000-000000000001', 'owner', null),
  ('06d00000-0000-4000-b000-000000000001', '06d00000-0000-4000-a000-000000000002', 'moderator', null),
  ('06d00000-0000-4000-b000-000000000001', '06d00000-0000-4000-a000-000000000003', 'member', null),
  ('06d00000-0000-4000-b000-000000000001', '06d00000-0000-4000-a000-000000000005', 'member', now()),
  ('06d00000-0000-4000-b000-000000000002', '06d00000-0000-4000-a000-000000000001', 'owner', null),
  ('06d00000-0000-4000-b000-000000000003', '06d00000-0000-4000-a000-000000000001', 'owner', null);
insert into public.group_mute_carry (group_id, user_id, muted_until, muted_by) values
  ('06d00000-0000-4000-b000-000000000001', '06d00000-0000-4000-a000-000000000006', now() + interval '2 days',
   '06d00000-0000-4000-a000-000000000001');

create temp table t (k text primary key, v text);
grant all on t to authenticated;

set local role authenticated;

-- ─── Who can read the link ──────────────────────────────────────────────────
select pg_temp.as_user('06d00000-0000-4000-a000-000000000003');
select throws_ok($$select public.get_group_invite('06d00000-0000-4000-b000-000000000001')$$,
  '42501', 'not_allowed', 'a plain member cannot read the link');
select pg_temp.as_user('06d00000-0000-4000-a000-000000000004');
select throws_ok($$select public.get_group_invite('06d00000-0000-4000-b000-000000000001')$$,
  '42501', 'not_allowed', 'an outsider cannot read the link');
select throws_ok($$select public.reset_group_invite('06d00000-0000-4000-b000-000000000001')$$,
  '42501', 'not_allowed', 'an outsider cannot reset the link');

select pg_temp.as_user('06d00000-0000-4000-a000-000000000001');
insert into t select 'first', public.get_group_invite('06d00000-0000-4000-b000-000000000001');
select matches((select v from t where k = 'first'), '^[0-9a-f]{24}$', 'the owner gets a 24-character link token');
select is(public.get_group_invite('06d00000-0000-4000-b000-000000000001'), (select v from t where k = 'first'),
  'asking again returns the same link');
select throws_ok($$select public.get_group_invite('06d00000-0000-4000-b000-000000000002')$$,
  '22023', 'not_private', 'public groups have no invitation link (Join is enough)');
select throws_ok($$select public.get_group_invite('06d00000-0000-4000-b000-000000000003')$$,
  'P0002', 'not_found', 'archived groups have no link');

select pg_temp.as_user('06d00000-0000-4000-a000-000000000002');
select is(public.get_group_invite('06d00000-0000-4000-b000-000000000001'), (select v from t where k = 'first'),
  'a moderator reads the same link');

-- ─── Preview and join ───────────────────────────────────────────────────────
select pg_temp.as_user('06d00000-0000-4000-a000-000000000004');
select is(public.get_invite_preview((select v from t where k = 'first')) - 'group_id',
  jsonb_build_object('kind', 'club', 'name', 'Secret Club', 'description', 'Invite only', 'avatar_url', null,
                     'member_count', 3, 'joined', false, 'banned', false),
  'the link shows the club name, description and members');
select is(public.get_invite_preview('ffffffffffffffffffffffff'), null, 'an unknown link shows nothing');
select is(public.join_group_invite(upper(' ' || (select v from t where k = 'first') || ' ')),
  '06d00000-0000-4000-b000-000000000001'::uuid, 'an outsider joins with the link (case and spaces ignored)');
reset role;
select ok(public.is_group_member('06d00000-0000-4000-b000-000000000001', '06d00000-0000-4000-a000-000000000004'),
  'they are now a member');
select is((select role::text from public.group_members where group_id = '06d00000-0000-4000-b000-000000000001'
  and user_id = '06d00000-0000-4000-a000-000000000004'), 'member', 'as a plain member');
set local role authenticated;
select lives_ok($$select public.join_group_invite((select v from t where k = 'first'))$$, 'joining twice is a no-op');
select is((public.get_invite_preview((select v from t where k = 'first')) ->> 'joined')::boolean, true,
  'the preview says they are in');

select pg_temp.as_user('06d00000-0000-4000-a000-000000000005');
select throws_ok($$select public.join_group_invite((select v from t where k = 'first'))$$,
  '42501', 'banned', 'a banned member cannot come back through the link');

select pg_temp.as_user('06d00000-0000-4000-a000-000000000006');
select lives_ok($$select public.join_group_invite((select v from t where k = 'first'))$$,
  'someone who left while muted rejoins');
reset role;
select ok((select muted_until > now() from public.group_members where group_id = '06d00000-0000-4000-b000-000000000001'
  and user_id = '06d00000-0000-4000-a000-000000000006'), 'and stays muted (leaving does not clear a mute)');
set local role authenticated;

select throws_ok($$select public.join_group('06d00000-0000-4000-b000-000000000001')$$,
  '42501', 'not_joinable', 'plain Join still refuses private groups');

-- ─── Reset ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('06d00000-0000-4000-a000-000000000001');
insert into t select 'second', public.reset_group_invite('06d00000-0000-4000-b000-000000000001');
select isnt((select v from t where k = 'second'), (select v from t where k = 'first'), 'reset makes a new link');
select pg_temp.as_user('06d00000-0000-4000-a000-000000000004');
select throws_ok($$select public.join_group_invite((select v from t where k = 'first'))$$,
  'P0002', 'invite_invalid', 'the old link stops working');

-- ─── Staff ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-b000-000000000004');
select is(public.get_group_invite('06d00000-0000-4000-b000-000000000001'), (select v from t where k = 'second'),
  'a staff Moderator reads the link');
select lives_ok($$select public.reset_group_invite('06d00000-0000-4000-b000-000000000001')$$,
  'a staff Moderator resets it');
reset role;
select is((select count(*)::int from public.audit_log where action in ('channel.invite_link', 'channel.invite_reset')
  and object_id = '06d00000-0000-4000-b000-000000000001'), 1,
  'the staff reset is audited (reading an existing link and owner changes are not)');

select * from finish();
rollback;
