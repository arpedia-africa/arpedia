-- Flow 15 · feed rows (spec check 15-7, 15-8, 15-9, 15-10): Account pushes reach the feed,
-- a campaign writes its row on open, the feed keeps 60 days and 200 items, Messages has three levels.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('15700000-0000-4000-a000-000000000001', 'f1@t157.local', '{"full_name":"Feed One"}'),
  ('15700000-0000-4000-a000-000000000002', 'f2@t157.local', '{"full_name":"Feed Two"}');

-- ─── 15-7: account push writes a feed row ───────────────────────────────────
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(array_length(public.log_pushes(jsonb_build_array(jsonb_build_object(
  'user_id', '15700000-0000-4000-a000-000000000001', 'type', 'account_notice', 'status', 'sent',
  'feed', jsonb_build_object('kind', 'account_notice', 'category', 'account', 'title', 'Your payout is on its way',
    'body', '₦12,000', 'target_type', 'screen', 'target_id', 'earnings')))), 1) = 1, 'account push logged');
select is((select category from public.notifications
           where user_id = '15700000-0000-4000-a000-000000000001' and kind = 'account_notice'),
  'account', 'account push writes an Account feed row');

-- ─── 15-8: campaign row on open ─────────────────────────────────────────────
insert into public.notification_preferences (user_id, offers) values
  ('15700000-0000-4000-a000-000000000001', true), ('15700000-0000-4000-a000-000000000002', true);
insert into public.campaigns (id, title, body, open_target, ab_test, status) values
  ('15700000-0000-4000-b000-000000000001', 'New this week', 'Three new books',
   '{"kind": "screen", "screen": "explore"}', '{"title_b": "Fresh books for you", "split": 0.2}', 'sent');
create temp table p157 as
  select unnest(public.log_pushes(jsonb_build_array(
    jsonb_build_object('user_id', '15700000-0000-4000-a000-000000000001', 'type', 'campaign', 'status', 'sent',
      'campaign_id', '15700000-0000-4000-b000-000000000001', 'variant', 'a'),
    jsonb_build_object('user_id', '15700000-0000-4000-a000-000000000002', 'type', 'campaign', 'status', 'sent',
      'campaign_id', '15700000-0000-4000-b000-000000000001', 'variant', 'b')))) as id;
grant select on p157 to authenticated;
select is((select count(*)::int from public.notifications where kind = 'campaign'
           and user_id in ('15700000-0000-4000-a000-000000000001', '15700000-0000-4000-a000-000000000002')),
  0, 'a campaign writes no feed row at send');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15700000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.push_opened(min(id)) from p157 $$, 'reader opens the campaign push');
select lives_ok($$ select public.push_opened(min(id)) from p157 $$, 'opening twice is fine');
select set_config('request.jwt.claims', '{"sub":"15700000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select lives_ok($$ select public.push_opened(max(id)) from p157 $$, 'variant B reader opens it');
select lives_ok($$ select public.push_opened(min(id)) from p157 $$, 'someone else''s push id changes nothing');
reset role;

select is((select count(*)::int from public.notifications
           where user_id = '15700000-0000-4000-a000-000000000001' and kind = 'campaign'), 1,
  'one feed row after open, not one per open');
select is((select title || '|' || category || '|' || target_type || '|' || target_id from public.notifications
           where user_id = '15700000-0000-4000-a000-000000000001' and kind = 'campaign'),
  'New this week|books|screen|explore', 'the row carries the campaign title and target');
select is((select title from public.notifications
           where user_id = '15700000-0000-4000-a000-000000000002' and kind = 'campaign'),
  'Fresh books for you', 'variant B gets its own title');

-- ─── 15-9: 60 days, 200 items ───────────────────────────────────────────────
insert into public.notifications (user_id, kind, category, title, created_at)
select '15700000-0000-4000-a000-000000000002', 'test', 'books', 'Item ' || g, now() - make_interval(mins => g)
from generate_series(1, 205) g;
select is((select count(*)::int from public.notifications where user_id = '15700000-0000-4000-a000-000000000002'),
  200, 'the feed keeps the newest 200 items');
select ok(not exists (select 1 from public.notifications where user_id = '15700000-0000-4000-a000-000000000002'
                      and title in ('Item 200', 'Item 205')), 'the oldest items go first');
update public.notifications set created_at = now() - interval '61 days'
where user_id = '15700000-0000-4000-a000-000000000001' and kind = 'account_notice';
select public.purge_discovery();
select is((select count(*)::int from public.notifications where user_id = '15700000-0000-4000-a000-000000000001'),
  1, 'items older than 60 days go');

-- ─── 15-10: messages level ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15700000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select messages_level || '|' || clubs from public.set_notification_preferences('{"messages_level": "all"}')),
  'all|true', 'Messages can be set to All');
select is((select messages_level || '|' || clubs from public.set_notification_preferences('{"messages_level": "off"}')),
  'off|false', 'Off turns club items off too');
reset role;

select * from finish();
rollback;
