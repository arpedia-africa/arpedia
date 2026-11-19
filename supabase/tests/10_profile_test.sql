-- Flow 10 · Profile and settings: RLS on goals, preferences, deletions and staff notes; goal and
-- preference RPCs; name-change limit; remove_device; account deletion and erasure; staff reader RPCs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

insert into auth.users (id, email, encrypted_password) values
  ('10000000-0000-4000-a000-000000000001', 'reader10@test.local', extensions.crypt('old-password', extensions.gen_salt('bf'))),
  ('10000000-0000-4000-a000-000000000002', 'other10@test.local', null),
  ('10000000-0000-4000-a000-000000000003', 'author10@test.local', null),
  ('10000000-0000-4000-a000-000000000004', 'support10@arpedia.africa', null),
  ('10000000-0000-4000-a000-000000000005', 'pub10@arpedia.africa', null),
  ('10000000-0000-4000-a000-000000000006', 'fin10@arpedia.africa', null),
  ('10000000-0000-4000-a000-000000000007', 'gone10@test.local', null);
update public.profiles set full_name = 'Reader Ten', onboarding_step = 'done', phone = '+2348031234512'
  where id = '10000000-0000-4000-a000-000000000001';
update public.profiles set full_name = 'Other Ten', onboarding_step = 'done' where id = '10000000-0000-4000-a000-000000000002';
update public.profiles set full_name = 'Author Ten', onboarding_step = 'done', is_author = true
  where id = '10000000-0000-4000-a000-000000000003';
update public.profiles set full_name = 'Gone Ten', onboarding_step = 'done' where id = '10000000-0000-4000-a000-000000000007';
insert into public.staff_roles (user_id, role) values
  ('10000000-0000-4000-a000-000000000004', 'support'),
  ('10000000-0000-4000-a000-000000000005', 'publisher'),
  ('10000000-0000-4000-a000-000000000006', 'finance');

-- Two sessions and two devices for the reader: this phone (session …e1) and another (…e2).
insert into auth.sessions (id, user_id, created_at) values
  ('10000000-0000-4000-e000-000000000001', '10000000-0000-4000-a000-000000000001', now()),
  ('10000000-0000-4000-e000-000000000002', '10000000-0000-4000-a000-000000000001', now());
insert into public.user_devices (id, user_id, device_key, model, download_enabled, session_id) values
  ('10000000-0000-4000-d000-000000000001', '10000000-0000-4000-a000-000000000001', 'this-phone-key-0001', 'Tecno Camon 30', true,
   '10000000-0000-4000-e000-000000000001'),
  ('10000000-0000-4000-d000-000000000002', '10000000-0000-4000-a000-000000000001', 'other-phone-key-0002', 'Samsung Galaxy A15', true,
   '10000000-0000-4000-e000-000000000002');

-- The author has earned and not been paid (no payouts before flow 13).
insert into public.credit_ledger (user_id, delta, reason, bucket) values
  ('10000000-0000-4000-a000-000000000007', 100, 'top_up', 'topup');
insert into public.credit_ledger (user_id, delta, reason, bucket, author_id, author_earning_kobo) values
  ('10000000-0000-4000-a000-000000000007', -10, 'chapter', 'topup', '10000000-0000-4000-a000-000000000003', 1600);

create function pg_temp.as_user(uid text, sid text default null, age interval default '1 minute') returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated',
    'session_id', coalesce(sid, '10000000-0000-4000-f000-' || right(uid, 12)),
    'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
             'timestamp', extract(epoch from now() - age)::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text, text, interval) to authenticated;

set local role authenticated;
select pg_temp.as_user('10000000-0000-4000-a000-000000000001', '10000000-0000-4000-e000-000000000001');

-- ─── Reading goal ───────────────────────────────────────────────────────────
select is((public.get_profile_summary() -> 'goal'), 'null'::jsonb, 'no goal yet');
select is((public.get_profile_summary() ->> 'books_read')::int, 0, 'books read is a real zero');
select throws_ok($$select public.set_reading_goal(extract(year from now() at time zone 'Africa/Lagos')::int, 366)$$, '22023', 'goal_target', 'goal above 365 refused');
select throws_ok($$select public.set_reading_goal(extract(year from now() at time zone 'Africa/Lagos')::int, 0)$$, '22023', 'goal_target', 'goal of 0 refused');
select throws_ok($$select public.set_reading_goal(extract(year from now() at time zone 'Africa/Lagos')::int - 1, 12)$$, '22023', 'goal_year', 'last year refused');
select is((public.set_reading_goal(extract(year from now() at time zone 'Africa/Lagos')::int, 24)).target_books, 24, 'goal set');
select is((public.set_reading_goal(extract(year from now() at time zone 'Africa/Lagos')::int, 12)).target_books, 12, 'goal changed in place');
select is((public.get_profile_summary() ->> 'goal')::int, 12, 'summary shows the goal');
select lives_ok($$select public.set_reading_goal(extract(year from now() at time zone 'Africa/Lagos')::int + 1, 30)$$, 'next year allowed');
select throws_ok($$insert into public.reading_goals (user_id, year, target_books)
  values ('10000000-0000-4000-a000-000000000001', 2030, 5)$$, '42501', null, 'no direct insert into goals');

select pg_temp.as_user('10000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.reading_goals), 0, 'another reader sees no goals of others');

-- ─── Notification preferences ───────────────────────────────────────────────
select pg_temp.as_user('10000000-0000-4000-a000-000000000001', '10000000-0000-4000-e000-000000000001');
select ok((public.get_notification_preferences()).clubs and not (public.get_notification_preferences()).offers,
  'defaults: clubs on, offers off');
select is((public.set_notification_preferences('{"reminders": false}')).reminders, false, 'toggle saves');
select is((public.get_notification_preferences()).clubs, true, 'other toggles kept');
select is((public.set_notification_preferences('{"offers": true}')).offers, true, 'offers on');
select is((select count(*)::int from public.consent_log where kind = 'marketing' and granted), 1, 'marketing consent logged');
select throws_ok($$select public.set_notification_preferences('{"spam": true}')$$, '22023', null, 'unknown key refused');
select throws_ok($$select public.set_notification_preferences('{"clubs": "yes"}')$$, '22023', null, 'non-boolean refused');
select pg_temp.as_user('10000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.notification_preferences), 0, 'preferences are private');

-- ─── Edit profile and the name limit ────────────────────────────────────────
select pg_temp.as_user('10000000-0000-4000-a000-000000000001', '10000000-0000-4000-e000-000000000001');
select is((public.update_profile('{"bio": "Reads on the bus"}')).bio, 'Reads on the bus', 'bio saved');
select throws_ok($$select public.update_profile(jsonb_build_object('bio', repeat('a', 161)))$$, '22023', null, 'bio over 160 refused');
select throws_ok($$select public.update_profile('{"phone": "+23480312"}')$$, '22023', null, 'bad phone refused');
select throws_ok($$select public.update_profile(jsonb_build_object('date_of_birth', (current_date - interval '15 years')::date))$$,
  '22023', null, 'under 16 refused');
select lives_ok($$select public.update_profile('{"full_name": "Reader A"}')$$, 'name change 1');
select lives_ok($$select public.update_profile('{"full_name": "Reader B"}')$$, 'name change 2');
select lives_ok($$select public.update_profile('{"full_name": "Reader C"}')$$, 'name change 3');
select throws_ok($$select public.update_profile('{"full_name": "Reader D"}')$$, '22023', 'name_change_limit', 'fourth change in 30 days refused');
select throws_ok($$update public.profiles set full_name = 'Reader E' where id = auth.uid()$$, '22023', 'name_change_limit',
  'direct update hits the same limit');

-- ─── Devices ────────────────────────────────────────────────────────────────
select is((public.list_my_devices() ->> 'enabled')::int, 2, 'two download devices');
select throws_ok($$select public.remove_device('10000000-0000-4000-d000-000000000001')$$, '22023', 'this_device',
  'cannot remove the device of this session');
select throws_ok($$select public.remove_device('10000000-0000-4000-d000-000000000002', 'other-phone-key-0002')$$, '22023', 'this_device',
  'cannot remove the device by its own key');
select lives_ok($$select public.remove_device('10000000-0000-4000-d000-000000000002')$$, 'removes the other device');
select is((select count(*)::int from auth.sessions where id = '10000000-0000-4000-e000-000000000002'), 0, 'its session ended');
select is((public.list_my_devices() ->> 'enabled')::int, 1, 'slot freed');
select pg_temp.as_user('10000000-0000-4000-a000-000000000002');
select throws_ok($$select public.remove_device('10000000-0000-4000-d000-000000000001')$$, 'P0002', null,
  'another reader cannot remove my device');

-- ─── Account deletion ───────────────────────────────────────────────────────
select throws_ok($$select public.request_account_deletion('DELETE ME')$$, '22023', 'confirm_text', 'needs exactly DELETE');
select pg_temp.as_user('10000000-0000-4000-a000-000000000003');
select throws_ok($$select public.request_account_deletion('DELETE')$$, '22023', 'earnings_waiting',
  'author with unpaid earnings cannot delete');
select pg_temp.as_user('10000000-0000-4000-a000-000000000007');
select is((public.request_account_deletion('delete')).status, 'pending'::public.deletion_status, 'deletion queued (any case)');
select is((select count(*)::int from public.public_profiles where id = '10000000-0000-4000-a000-000000000007'), 0,
  'profile hidden at once');
select pg_temp.as_user('10000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.account_deletions), 0, 'readers do not see others'' deletions');
select throws_ok($$select public.erase_account((select id from public.account_deletions limit 1))$$, '42501', null,
  'erase is not callable by readers');

-- ─── Staff reader RPCs ──────────────────────────────────────────────────────
select pg_temp.as_user('10000000-0000-4000-a000-000000000005');
select throws_ok($$select public.staff_get_reader('10000000-0000-4000-a000-000000000001')$$, '42501', null,
  'Publisher cannot open reader pages');
select pg_temp.as_user('10000000-0000-4000-a000-000000000006');
select is(public.staff_get_reader('10000000-0000-4000-a000-000000000001') ->> 'email', null, 'Finance sees no contact details');
select throws_ok($$select public.staff_sign_out_all('10000000-0000-4000-a000-000000000001')$$, '42501', null,
  'Finance cannot sign readers out');
select pg_temp.as_user('10000000-0000-4000-a000-000000000004');
select is(public.staff_get_reader('10000000-0000-4000-a000-000000000001') ->> 'phone', '+234 803 ••• ••12', 'Support sees a masked phone');
select is(public.staff_reveal_contact('10000000-0000-4000-a000-000000000001', 'Caller verified on ticket 12') ->> 'phone',
  '+2348031234512', 'reveal returns the full phone');

-- ─── Erasure (service role) ─────────────────────────────────────────────────
reset role;
select is((select count(*)::int from public.audit_log where action = 'contact_revealed'
           and object_id = '10000000-0000-4000-a000-000000000001'), 1, 'reveal is audited');
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select ok(public.erase_account((select id from public.account_deletions
  where user_id = '10000000-0000-4000-a000-000000000007')), 'erased');
select ok((select full_name = 'Former reader' and phone is null and erased_at is not null from public.profiles
           where id = '10000000-0000-4000-a000-000000000007')
          and (select email like 'erased+%' from auth.users where id = '10000000-0000-4000-a000-000000000007'),
  'name becomes Former reader, email freed');
select is((select count(*)::int from public.credit_ledger where user_id = '10000000-0000-4000-a000-000000000007'), 2,
  'ledger rows kept');
select ok(not public.erase_account((select id from public.account_deletions
  where user_id = '10000000-0000-4000-a000-000000000007')), 'erasing again does nothing');

select * from finish();
rollback;
