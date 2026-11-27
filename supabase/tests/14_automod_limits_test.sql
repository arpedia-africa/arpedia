-- Flow 14 · 14-14 (rule 23): the Safety rules page's limits and new-account rules are read by the
-- checks they describe.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- 1 joined 2 days ago, 2 joined 20 days ago.
insert into auth.users (id, email, created_at) values
  ('14140000-0000-4000-a000-000000000001', 'new@flow1414.test', now() - interval '2 days'),
  ('14140000-0000-4000-a000-000000000002', 'old@flow1414.test', now() - interval '20 days');
insert into public.groups (id, kind, name, owner_id, visibility) values
  ('14140000-0000-4000-c000-000000000001', 'room', 'Night readers', '14140000-0000-4000-a000-000000000002', 'private');
insert into public.group_members (group_id, user_id, role) values
  ('14140000-0000-4000-c000-000000000001', '14140000-0000-4000-a000-000000000002', 'owner'),
  ('14140000-0000-4000-c000-000000000001', '14140000-0000-4000-a000-000000000001', 'member');
insert into public.books (id, author_id, title, status) values
  ('14140000-0000-4000-b000-000000000001', '14140000-0000-4000-a000-000000000002', 'A Book', 'live');

-- The error a statement raises, or 'ok'.
create function pg_temp.err(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.err(text) to authenticated;

select is(public._automod_int('rate_limits', 'messages_per_minute', 99), 20, 'reads the saved value');
select is(public._automod_int('rate_limits', 'nothing_here', 99), 99, 'a missing field falls back');

-- New-account days follow the link rule's setting.
select ok(public._is_new_account('14140000-0000-4000-a000-000000000001'), 'two days old is new at 7 days');
update public.automod_settings set value = jsonb_set(value, '{block_new_accounts_days}', '1') where key = 'links';
select ok(not public._is_new_account('14140000-0000-4000-a000-000000000001'), 'and not at 1 day');
select is(public.get_group_access('14140000-0000-4000-c000-000000000001', '14140000-0000-4000-a000-000000000001') -> 'new_account',
  'false'::jsonb, 'the chat access answer agrees');

-- Rooms: new accounts wait no_room_posts_days; 0 switches it off.
select is((select reason from public.post_block_for('14140000-0000-4000-c000-000000000001', '14140000-0000-4000-a000-000000000001')),
  'new_account', 'a two-day-old member cannot post in a room at 7 days');
update public.automod_settings set value = jsonb_set(value, '{no_room_posts_days}', '0') where key = 'new_accounts';
select is((select reason from public.post_block_for('14140000-0000-4000-c000-000000000001', '14140000-0000-4000-a000-000000000001')),
  null, 'and can at 0 (rule off)');

-- Chat limits reach the Durable Object.
update public.automod_settings set value = jsonb_set(value, '{messages_per_minute}', '7') where key = 'rate_limits';
select is(public.get_group_access('14140000-0000-4000-c000-000000000001', '14140000-0000-4000-a000-000000000001') -> 'limits',
  '{"messages_per_minute": 7, "identical_messages": 3, "identical_window_minutes": 5}'::jsonb, 'limits in the access answer');

-- Paid DMs per day follow the setting.
update public.automod_settings set value = jsonb_set(value, '{dms_per_day}', '12') where key = 'rate_limits';
select is((select value from public.app_config where key = 'author_message_daily_limit'), '12'::jsonb,
  'the paid-message daily limit follows DMs per day');

-- Reviews wait for day 3.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"14140000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(pg_temp.err($$ select public.post_review('14140000-0000-4000-b000-000000000001', 5, 'Lovely', false) $$),
  'review_wait', 'a two-day-old account waits to review');
select is(pg_temp.err($$ select public._post_review_rules('14140000-0000-4000-b000-000000000001', 5, 'Lovely', false) $$),
  'permission denied for function _post_review_rules', 'the inner function is not callable around the wait');
reset role;
update public.automod_settings set value = jsonb_set(value, '{review_wait_days}', '0') where key = 'new_accounts';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"14140000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select isnt(pg_temp.err($$ select public.post_review('14140000-0000-4000-b000-000000000001', 5, 'Lovely', false) $$),
  'review_wait', 'with the rule off there is no wait');
select set_config('request.jwt.claims', '{"sub":"14140000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select isnt(pg_temp.err($$ select public.post_review('14140000-0000-4000-b000-000000000001', 5, 'Lovely', false) $$),
  'review_wait', 'an older account never waits');
reset role;

select * from finish();
rollback;
