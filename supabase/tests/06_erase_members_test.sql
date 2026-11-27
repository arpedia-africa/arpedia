-- Flow 06 · spec check 06-21: erasing an account takes the person out of every club, channel and
-- room they don't own (member_count drops), keeps their club messages anonymised ("Former reader"),
-- and keeps an owner's own row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('06210000-0000-4000-a000-000000000001', 'gone@t0621.local', '{"full_name":"Leaving Reader"}', now() - interval '60 days'),
  ('06210000-0000-4000-a000-000000000002', 'stay@t0621.local', '{"full_name":"Staying Reader"}', now() - interval '60 days');
insert into public.groups (id, kind, name, visibility, owner_id) values
  ('06210000-0000-4000-d000-000000000001', 'club', 'Book Club', 'public', '06210000-0000-4000-a000-000000000002'),
  ('06210000-0000-4000-d000-000000000002', 'club', 'Own Club', 'public', '06210000-0000-4000-a000-000000000001');
insert into public.group_members (group_id, user_id, role) values
  ('06210000-0000-4000-d000-000000000001', '06210000-0000-4000-a000-000000000002', 'owner'),
  ('06210000-0000-4000-d000-000000000001', '06210000-0000-4000-a000-000000000001', 'moderator'),
  ('06210000-0000-4000-d000-000000000002', '06210000-0000-4000-a000-000000000001', 'owner'),
  ('06210000-0000-4000-d000-000000000002', '06210000-0000-4000-a000-000000000002', 'member');
insert into public.messages (id, group_id, sender_id, client_id, body) values
  ('06210000-0000-4000-e000-000000000001', '06210000-0000-4000-d000-000000000001',
   '06210000-0000-4000-a000-000000000001', gen_random_uuid(), 'Loved chapter 3');
insert into public.account_deletions (id, user_id, requested_via, requested_by)
values ('06210000-0000-4000-f000-000000000001', '06210000-0000-4000-a000-000000000001', 'app',
        '06210000-0000-4000-a000-000000000001');

select is((select member_count from public.groups where id = '06210000-0000-4000-d000-000000000001'), 2,
  'two members before');
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select ok(public.erase_account('06210000-0000-4000-f000-000000000001'), 'erased');
select is((select count(*)::int from public.group_members where group_id = '06210000-0000-4000-d000-000000000001'
           and user_id = '06210000-0000-4000-a000-000000000001'), 0, 'they leave a club they were in');
select is((select member_count from public.groups where id = '06210000-0000-4000-d000-000000000001'), 1,
  'and no longer count toward its members');
select is((select role::text from public.group_members where group_id = '06210000-0000-4000-d000-000000000002'
           and user_id = '06210000-0000-4000-a000-000000000001'), 'owner', 'a club they own keeps its owner');
select is((select m.body || ' · ' || p.full_name from public.messages m join public.profiles p on p.id = m.sender_id
           where m.id = '06210000-0000-4000-e000-000000000001'), 'Loved chapter 3 · Former reader',
  'their club message stays, shown as Former reader');
set local role service_role;
select throws_ok($$ select public._erase_account_v2('06210000-0000-4000-f000-000000000001') $$, '42501', null,
  'the inner erase is not callable by the service role');
reset role;
select ok(not public.erase_account('06210000-0000-4000-f000-000000000001'), 'erasing again does nothing');

select * from finish();
rollback;
