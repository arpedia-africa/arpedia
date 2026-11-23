-- Flow 17: unmatched store events recorded once and read only by Finance and Super admin; resolving
-- one is audited; launch_check and the first Super admin invite are service-role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('17000000-0000-4000-a000-000000000001', 'sa17@arpedia.africa'),
  ('17000000-0000-4000-a000-000000000002', 'fin17@arpedia.africa'),
  ('17000000-0000-4000-a000-000000000003', 'sup17@arpedia.africa'),
  ('17000000-0000-4000-a000-000000000004', 'reader17@test.local');
insert into public.profiles (id, full_name) values
  ('17000000-0000-4000-a000-000000000001', 'Sa'),
  ('17000000-0000-4000-a000-000000000002', 'Fin'),
  ('17000000-0000-4000-a000-000000000003', 'Sup'),
  ('17000000-0000-4000-a000-000000000004', 'Reader')
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('17000000-0000-4000-a000-000000000001', 'super_admin'),
  ('17000000-0000-4000-a000-000000000002', 'finance'),
  ('17000000-0000-4000-a000-000000000003', 'support');

-- JWT claims for `uid`: aal2 with a fresh TOTP proof, or aal1 when mfa is false.
create function pg_temp.as_user(uid text, mfa boolean default true) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '17000000-0000-4000-f000-' || right(uid, 12),
    'aal', case when mfa then 'aal2' else 'aal1' end,
    'amr', jsonb_build_array(jsonb_build_object('method', case when mfa then 'totp' else 'password' end,
                                                'timestamp', extract(epoch from now())::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text, boolean) to authenticated;
create function pg_temp.as_service() returns void
language sql as $$ select set_config('request.jwt.claims', '{"role":"service_role"}', true) $$;
grant execute on function pg_temp.as_service() to service_role;

-- ─── Recorded once, by the Worker only ──────────────────────────────────────
set local role service_role;
select pg_temp.as_service();
select is(public.log_unmatched_store_event('revenuecat', 'rc-v25-1', 'arpedia_v25_monthly', '$RCAnonymousID:abc'),
  true, 'an unknown product event is recorded');
select is(public.log_unmatched_store_event('revenuecat', 'rc-v25-1', 'arpedia_v25_monthly', '$RCAnonymousID:abc'),
  false, 'the same event again changes nothing');
select is(public.log_unmatched_store_event('revenuecat', 'rc-v25-2', 'arpedia_v25_yearly', null),
  true, 'a second event is its own row');
select throws_ok($$insert into public.unmatched_store_events (provider, event_id) values ('revenuecat', 'x')$$,
  '42501', null, 'the service role writes only through the function');
reset role;
select is((select count(*)::int from public.unmatched_store_events where event_id like 'rc-v25-%'), 2,
  'two rows for three deliveries');
-- Nothing was granted for them: no subscription, credits or payment event.
select is((select count(*)::int from public.payment_events where event_id like 'rc-v25-%'), 0,
  'no payment event for an unknown product');

-- ─── Who reads ──────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('17000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.unmatched_store_events), 0, 'a reader sees none');
select throws_ok($$select public.log_unmatched_store_event('revenuecat', 'r', 'p', null)$$,
  '42501', null, 'a reader cannot record one');
select pg_temp.as_user('17000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.unmatched_store_events), 0, 'Support sees none');
select pg_temp.as_user('17000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.unmatched_store_events where event_id like 'rc-v25-%'), 2, 'Finance reads them');
select pg_temp.as_user('17000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.unmatched_store_events where event_id like 'rc-v25-%'), 2, 'Super admin reads them');
select throws_ok($$update public.unmatched_store_events set note = 'x'$$, '42501', null, 'nobody edits rows directly');

-- ─── Resolve ────────────────────────────────────────────────────────────────
select pg_temp.as_user('17000000-0000-4000-a000-000000000003');
select throws_ok($$select public.resolve_unmatched_store_event(
    (select id from public.unmatched_store_events where event_id = 'rc-v25-1'), 'refunded')$$,
  '42501', null, 'Support cannot resolve');
select pg_temp.as_user('17000000-0000-4000-a000-000000000002', false);
select throws_ok($$select public.resolve_unmatched_store_event(1, 'refunded')$$,
  '42501', null, 'Finance needs two-step to resolve');
select pg_temp.as_user('17000000-0000-4000-a000-000000000002');
create temp table ids as select id from public.unmatched_store_events where event_id = 'rc-v25-1';
select lives_ok($$select public.resolve_unmatched_store_event((select id from ids), 'Refunded in Play Console')$$,
  'Finance resolves with a note');
select throws_ok($$select public.resolve_unmatched_store_event((select id from ids), 'again')$$,
  'P0002', null, 'an event resolves once');
reset role;
select is((select action || ':' || reason from public.audit_log where object_type = 'unmatched_store_event'),
  'store_event.resolve:Refunded in Play Console', 'resolving writes the audit log');

-- ─── Server only ────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('17000000-0000-4000-a000-000000000001');
select throws_ok($$select public.launch_check()$$, '42501', null, 'launch_check is not for staff');
reset role;
set local role service_role;
select pg_temp.as_service();
select throws_ok($$select public.invite_first_super_admin('new@arpedia.africa', 'New', repeat('a', 64))$$,
  '23505', null, 'no first-admin invite once a Super admin exists');
reset role;

select * from finish();
rollback;
