-- Flow 15 · Engage and insights: push_log / analytics_daily / exports visibility, marketing cap,
-- quiet-hours helpers, staff_schedule_campaign (quiet move, confirm, reviewer), receipts move
-- forward only, banners (one modal a day, dismiss, end date), email variables, export rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, email) values
  ('15000000-0000-4000-a000-000000000001', 'ops15@arpedia.africa'),
  ('15000000-0000-4000-a000-000000000002', 'ops15b@arpedia.africa'),
  ('15000000-0000-4000-a000-000000000003', 'pub15@arpedia.africa'),
  ('15000000-0000-4000-a000-000000000004', 'fin15@arpedia.africa'),
  ('15000000-0000-4000-a000-000000000005', 'sa15@arpedia.africa'),
  ('15000000-0000-4000-a000-000000000011', 'r1@test.local'),
  ('15000000-0000-4000-a000-000000000012', 'r2@test.local'),
  ('15000000-0000-4000-a000-000000000013', 'r3@test.local'),
  ('15000000-0000-4000-a000-000000000014', 'r4@test.local'),
  ('15000000-0000-4000-a000-000000000015', 'r5@test.local');
insert into public.profiles (id, full_name) select id, email from auth.users where email like '%15@%' or email like 'r_@test.local'
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('15000000-0000-4000-a000-000000000001', 'operations_admin'),
  ('15000000-0000-4000-a000-000000000002', 'operations_admin'),
  ('15000000-0000-4000-a000-000000000003', 'publisher'),
  ('15000000-0000-4000-a000-000000000004', 'finance'),
  ('15000000-0000-4000-a000-000000000005', 'super_admin');

-- A test genre holding exactly our 5 readers, each with a live token; reader 5 is a minor.
insert into public.genres (id, name, slug, position) values
  ('15000000-0000-4000-b000-000000000001', 'Test 15', 'test-15', 99);
insert into public.user_genres (user_id, genre_id)
select id, '15000000-0000-4000-b000-000000000001' from auth.users where email like 'r_@test.local';
insert into public.user_devices (user_id, device_key, push_token)
select id, 'device-key-' || id, 'ExponentPushToken[' || id || ']' from auth.users where email like 'r_@test.local';
update public.profiles set date_of_birth = current_date - interval '16 years'
  where id = '15000000-0000-4000-a000-000000000015';

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '15000000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- ─── Quiet hours and the marketing cap (as the service role) ────────────────
select ok(public.in_quiet_window('2026-11-19 22:30+01', 'Africa/Lagos', '22:00', '06:00'), '22:30 WAT is quiet');
select ok(public.in_quiet_window('2026-11-20 05:59+01', 'Africa/Lagos', '22:00', '06:00'), '05:59 WAT is quiet');
select ok(not public.in_quiet_window('2026-11-20 06:00+01', 'Africa/Lagos', '22:00', '06:00'), '06:00 is not');
select ok(not public.in_quiet_window('2026-11-19 22:30+01', 'Europe/London', '22:00', '06:00'),
  '22:30 WAT is 21:30 in London, not quiet there');
select is(public.quiet_window_end('2026-11-19 23:00+01', 'Africa/Lagos', '22:00', '07:00'),
  '2026-11-20 07:00+01'::timestamptz, 'a send at 23:00 moves to 07:00 next morning');
select is(public.quiet_window_end('2026-11-20 03:00+01', 'Africa/Lagos', '22:00', '07:00'),
  '2026-11-20 07:00+01'::timestamptz, 'a send at 03:00 moves to 07:00 the same morning');

insert into public.push_log (user_id, type, category, status, created_at) values
  ('15000000-0000-4000-a000-000000000011', 'offer', 'marketing', 'delivered', now() - interval '1 day'),
  ('15000000-0000-4000-a000-000000000011', 'campaign', 'marketing', 'opened', now() - interval '6 days'),
  ('15000000-0000-4000-a000-000000000012', 'offer', 'marketing', 'sent', now() - interval '2 days'),
  ('15000000-0000-4000-a000-000000000012', 'offer', 'marketing', 'sent', now() - interval '8 days'),
  ('15000000-0000-4000-a000-000000000012', 'offer', 'marketing', 'skipped_cap', now() - interval '1 day'),
  ('15000000-0000-4000-a000-000000000013', 'renewal_failed', 'account', 'sent', now() - interval '1 day'),
  ('15000000-0000-4000-a000-000000000013', 'renewal_failed', 'account', 'sent', now() - interval '2 day'),
  ('15000000-0000-4000-a000-000000000013', 'renewal_failed', 'account', 'sent', now() - interval '3 day');
select is(public.marketing_pushes_7d('15000000-0000-4000-a000-000000000011'), 2, 'two marketing pushes this week');
select ok(public.at_marketing_cap('15000000-0000-4000-a000-000000000011'), 'reader 1 is at the cap');
select ok(not public.at_marketing_cap('15000000-0000-4000-a000-000000000012'),
  'older than 7 days and skipped rows do not count');
select ok(not public.at_marketing_cap('15000000-0000-4000-a000-000000000013'), 'account pushes are never counted');

select results_eq(
  $$select reason, count(*)::int from public.campaign_recipients(
      '{"kind": "genre", "genre_id": "15000000-0000-4000-b000-000000000001"}', false, true)
    group by reason order by reason nulls first$$,
  $$values (null::text, 3), ('cap', 1), ('minor', 1)$$,
  '5 test devices, 1 at the cap and 1 minor: 3 get it');
select is((select count(*)::int from public.campaign_recipients(
      '{"kind": "genre", "genre_id": "15000000-0000-4000-b000-000000000001"}', true, true) where reason is null), 5,
  'a service push reaches everyone with a token');

-- ─── Receipts move forward only ─────────────────────────────────────────────
insert into public.push_log (user_id, type, category, status, ticket_ids) values
  ('15000000-0000-4000-a000-000000000014', 'author_reply', 'messages', 'sent', '{tk-1}');
select is(public.apply_push_receipts('[{"ticket_id": "tk-1", "status": "delivered"}]'), 1, 'delivered applied');
update public.push_log set status = 'opened', opened_at = now() where ticket_ids @> '{tk-1}';
select is(public.apply_push_receipts('[{"ticket_id": "tk-1", "status": "delivered"}, {"ticket_id": "tk-1", "status": "failed"}]'),
  0, 'a late or repeated receipt never moves an opened push back');
select is((select status::text from public.push_log where ticket_ids @> '{tk-1}'), 'opened', 'still opened');
select public.apply_push_receipts(jsonb_build_array(jsonb_build_object('ticket_id', 'tk-x', 'status', 'failed',
  'error', 'DeviceNotRegistered', 'token', 'ExponentPushToken[15000000-0000-4000-a000-000000000014]')));
select isnt((select push_disabled_at from public.user_devices where user_id = '15000000-0000-4000-a000-000000000014'),
  null, 'DeviceNotRegistered disables the token');

-- ─── Readers: own push rows only, no staff tables ───────────────────────────
set local role authenticated;
select pg_temp.as_user('15000000-0000-4000-a000-000000000011');
select is((select count(*)::int from public.push_log), 2, 'a reader sees only their own push_log rows');
select is((select count(*)::int from public.analytics_daily), 0, 'readers read no analytics');
select is((select count(*)::int from public.campaigns), 0, 'readers read no campaigns');
select throws_ok($$insert into public.push_log (user_id, type, category) values (auth.uid(), 'offer', 'marketing')$$,
  '42501', null, 'clients never write push_log');
select throws_ok($$select public.staff_save_campaign(null, '{"title": "Hi"}')$$, '42501', null,
  'readers cannot draft pushes');

-- ─── Staff: campaigns ───────────────────────────────────────────────────────
select pg_temp.as_user('15000000-0000-4000-a000-000000000003');
select lives_ok($$select public.staff_save_campaign(null, '{"title": "Draft by publisher", "body": "Body"}')$$,
  'Publisher can draft');
select throws_ok($$select public.staff_schedule_campaign((select id from public.campaigns where title = 'Draft by publisher'))$$,
  '42501', null, 'Publisher cannot send');

select pg_temp.as_user('15000000-0000-4000-a000-000000000001');
select throws_ok($$select public.staff_save_campaign(null, jsonb_build_object('title', repeat('x', 66)))$$,
  '22001', null, 'title over 65 characters is refused');
select throws_ok($$select public.staff_save_campaign(null, '{"title": "T", "respect_quiet": false, "quiet_override_reason": "urgent outage"}')$$,
  '42501', null, 'only a Super admin can turn quiet hours off');
create temp table c15 on commit drop as
  select public.staff_save_campaign(null, '{"title": "New this week", "body": "Three new books",
    "audience": {"kind": "genre", "genre_id": "15000000-0000-4000-b000-000000000001"}}') id;
grant select on c15 to authenticated;
select is(public.staff_schedule_campaign((select id from c15),
    ((current_date + 1)::timestamp + time '23:30') at time zone 'Africa/Lagos') - 'reach',
  jsonb_build_object('status', 'scheduled', 'moved', true, 'needs_confirm', false,
    'send_at', (((current_date + 2)::timestamp + time '07:00') at time zone 'Africa/Lagos')),
  'a schedule at 23:30 WAT moves to 07:00 and says so');
select is((select reach from public.campaigns where id = (select id from c15)), 2,
  'reach leaves out the capped reader, the minor and the dead token');
select is((select count(*)::int from public.audit_log where object_id = (select id::text from c15)
           and action = 'campaign.schedule'), 1, 'scheduling writes audit_log');
select lives_ok($$select public.staff_cancel_campaign((select id from c15))$$, 'a scheduled push can be cancelled');
select throws_ok($$select public.staff_pause_campaign((select id from c15))$$, '22023', null,
  'a cancelled push cannot be paused');

-- More than 1,000 readers needs the confirm step; more than 10,000 a second reviewer.
reset role;
insert into auth.users (id, email)
select ('15000000-0000-4000-c000-' || lpad(g::text, 12, '0'))::uuid, 'bulk' || g || '@test.local'
from generate_series(1, 1001) g;
insert into public.profiles (id) select id from auth.users where email like 'bulk%@test.local' on conflict do nothing;
insert into public.genres (id, name, slug, position) values
  ('15000000-0000-4000-b000-000000000002', 'Bulk 15', 'bulk-15', 98);
insert into public.user_genres (user_id, genre_id)
select id, '15000000-0000-4000-b000-000000000002' from auth.users where email like 'bulk%@test.local';
insert into public.user_devices (user_id, device_key, push_token)
select id, 'device-key-' || id, 'ExponentPushToken[' || id || ']' from auth.users where email like 'bulk%@test.local';
set local role authenticated;
select pg_temp.as_user('15000000-0000-4000-a000-000000000001');
create temp table c16 on commit drop as
  select public.staff_save_campaign(null, '{"title": "Big one", "body": "To many",
    "audience": {"kind": "genre", "genre_id": "15000000-0000-4000-b000-000000000002"}}') id;
select is(public.staff_schedule_campaign((select id from c16), now() + interval '1 day') ->> 'needs_confirm', 'true',
  'more than 1,000 readers asks for confirmation');
select is((select status::text from public.campaigns where id = (select id from c16)), 'draft',
  'nothing is scheduled before confirming');
select is(public.staff_schedule_campaign((select id from c16), now() + interval '1 day', true) ->> 'status', 'scheduled',
  'confirmed, it is scheduled');

-- ─── Banners ────────────────────────────────────────────────────────────────
create temp table b15 on commit drop as
  select public.staff_save_banner(null, '{"placement": "launch_modal", "headline": "Harmattan sale", "publish": true}') id;
select pg_temp.as_user('15000000-0000-4000-a000-000000000011');
select is(jsonb_array_length(public.get_active_banners('launch_modal')), 1, 'the launch modal shows');
select is(jsonb_array_length(public.get_active_banners('launch_modal')), 0, 'only once per reader per day');
select pg_temp.as_user('15000000-0000-4000-a000-000000000001');
create temp table b16 on commit drop as
  select public.staff_save_banner(null, '{"placement": "home_top", "headline": "Join a room", "publish": true}') id;
select pg_temp.as_user('15000000-0000-4000-a000-000000000012');
select public.dismiss_banner((select id from b16));
select is(jsonb_array_length(public.get_active_banners('home_top')), 0, 'a dismissed card does not return');
select pg_temp.as_user('15000000-0000-4000-a000-000000000001');
select public.staff_end_banner((select id from b16));
select pg_temp.as_user('15000000-0000-4000-a000-000000000013');
select is(jsonb_array_length(public.get_active_banners('home_top')), 0, 'an ended banner is gone for everyone');

-- ─── Emails ─────────────────────────────────────────────────────────────────
select pg_temp.as_user('15000000-0000-4000-a000-000000000001');
select throws_ok($$select public.staff_save_email_template('welcome', 'Hi {{first_nam}}', '', 'Body')$$, '22023',
  'Unknown variable: first_nam', 'an unknown variable blocks save');
select throws_ok($$select public.staff_save_email_template('receipt', 'Receipt', '', 'Body', false)$$, '22023', null,
  'money emails cannot be switched off');
select is(public.staff_save_email_template('welcome', 'Welcome, {{first_name}}', '', 'Body'), 2,
  'saving creates version 2');

-- ─── Exports ────────────────────────────────────────────────────────────────
select pg_temp.as_user('15000000-0000-4000-a000-000000000004');
select throws_ok($$select public.staff_create_export('readers', '{}', '{email}', 'audit')$$, '42501', null,
  'Finance cannot export readers with emails');
select lives_ok($$select public.staff_create_export('transactions', '{}', '{date,amount}')$$,
  'Finance exports transactions without contact details');
select pg_temp.as_user('15000000-0000-4000-a000-000000000005');
select throws_ok($$select public.staff_create_export('readers', '{}', '{email}')$$, '22023', null,
  'personal details need a reason');
select lives_ok($$select public.staff_create_export('readers', '{}', '{email,joined}', 'NDPA data request #12')$$,
  'Super admin with a reason can export emails');
select pg_temp.as_user('15000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.exports), 0, 'exports are visible to their creator and Super admin only');

-- ─── Worker helpers (service role) ──────────────────────────────────────────
reset role;
create temp table q15 on commit drop as
  select unnest(public.log_pushes(jsonb_build_array(jsonb_build_object('user_id', '15000000-0000-4000-a000-000000000013',
    'type', 'author_new_post', 'status', 'queued', 'author_id', '15000000-0000-4000-a000-000000000003')))) id;
select ok((select author_pushed_today from public.push_recipients(array['15000000-0000-4000-a000-000000000013']::uuid[],
    'author_new_post', null, '15000000-0000-4000-a000-000000000003')),
  'a queued author push counts for one per author per day');
select is(public.mark_pushes_sent(jsonb_build_array(jsonb_build_object('id', (select id from q15), 'status', 'sent',
    'ticket_ids', jsonb_build_array('tk-q'), 'ticket_tokens', jsonb_build_object('tk-q', 'tok')))), 1,
  'a queued push moves to sent with its tickets');
select is(public.mark_pushes_sent(jsonb_build_array(jsonb_build_object('id', (select id from q15), 'status', 'failed'))),
  0, 'a sent push is never marked again');

select is((select count(*)::int from public.campaign_audience((select id from c15)) where user_id =
    '15000000-0000-4000-a000-000000000011'), 1, 'the campaign audience lists a reader before any push');
insert into public.push_log (user_id, type, category, campaign_id, status)
values ('15000000-0000-4000-a000-000000000011', 'campaign', 'marketing', (select id from c15), 'skipped_cap');
select is((select count(*)::int from public.campaign_audience((select id from c15)) where user_id =
    '15000000-0000-4000-a000-000000000011'), 0, 'a reader already logged for the campaign is not pushed again');

select ok((select bool_and(r ? 'email') from jsonb_array_elements(public.export_rows(
    (select id from public.exports where includes_pii), 0, 50)) r), 'a cleared personal export carries emails');
insert into public.exports (kind, columns, created_by, status, file_key, expires_at)
values ('readers', '{reader_id,email}', '15000000-0000-4000-a000-000000000001', 'ready', 'exports/x/readers.csv',
        now() - interval '1 minute');
select ok((select bool_and(not r ? 'email') from jsonb_array_elements(public.export_rows(
    (select id from public.exports where file_key = 'exports/x/readers.csv'), 0, 50)) r),
  'an export not cleared for personal details never carries emails');
select ok('exports/x/readers.csv' = any (public.expire_exports()), 'expiry hands back the file key to delete');

select * from finish();
rollback;
