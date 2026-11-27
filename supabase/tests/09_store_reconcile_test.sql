-- Spec check 09-5: the weekly store_reconcile records each provider's run and raises one open
-- store_unmatched alert per unmatched purchase (never twice); only the service role writes, only
-- Finance reads the runs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 71 reader, 72 finance, 73 support.
insert into auth.users (id, email)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'sr' || n || '@flow09.test'
from generate_series(71, 73) n;
insert into public.profiles (id, full_name)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'Reconcile ' || n
from generate_series(71, 73) n
on conflict (id) do nothing;
insert into public.staff_roles (user_id, role) values
  ('90900000-0000-4000-a000-000000000072', 'finance'),
  ('90900000-0000-4000-a000-000000000073', 'support');

set local role service_role;
select is(
  public.record_store_reconcile('revenuecat', '2026-11-22 02:00+00', '2026-11-30 01:00+00', 'ok', 3, 2, 1,
    '[{"side": "provider_only", "store_txn_id": "GPA.sr1", "user_id": "90900000-0000-4000-a000-000000000071",
       "amount_kobo": 60000, "at": "2026-11-27T10:00:00Z", "product": "arpedia_topup_200"},
      {"side": "ours_only", "store_txn_id": "GPA.sr2", "user_id": "not-a-uuid"},
      {"side": "provider_only", "store_txn_id": "GPA.sr3", "user_id": "90900000-0000-4000-a000-0000000000ff"}]')
    ->> 'new_alerts', '3', 'each unmatched purchase raises an alert');
select is(
  public.record_store_reconcile('revenuecat', '2026-11-29 02:00+00', '2026-12-07 01:00+00', 'ok', 1, 0, 0,
    '[{"side": "provider_only", "store_txn_id": "GPA.sr1"}]') ->> 'new_alerts', '0',
  'a purchase still unmatched next week keeps its first alert');
select is(
  public.record_store_reconcile('flutterwave', '2026-11-22 02:00+00', '2026-11-30 01:00+00', 'ok', 1, 0, 0,
    '[{"side": "provider_only", "store_txn_id": "GPA.sr1"}]') ->> 'new_alerts', '1',
  'the same id at another provider is its own alert');
select is(
  public.record_store_reconcile('flutterwave', '2026-11-29 02:00+00', '2026-12-07 01:00+00', 'failed', 0, 0, 0,
    '[{"side": "provider_only", "store_txn_id": "x"}]', 'flutterwave transactions: 500') ->> 'new_alerts', '0',
  'a failed run raises nothing');
select throws_ok($$select public.record_store_reconcile('revenuecat', now() - interval '8 days', now(), 'ok', 0, 0, 0,
                     '[{"side": "sideways", "store_txn_id": "y"}]')$$, 'P0001', 'bad_item', 'an unknown side is refused');
select throws_ok($$select public.record_store_reconcile('stripe', now() - interval '8 days', now(), 'ok', 0, 0, 0, '[]')$$,
  '23514', null, 'an unknown provider is refused');
reset role;

select results_eq(
  $$select user_id::text, detail ->> 'side', detail ->> 'summary', (detail ->> 'amount_kobo')::int
    from public.credit_alerts where kind = 'store_unmatched' and detail ->> 'provider' = 'revenuecat'
    order by detail ->> 'store_txn_id'$$,
  $$values ('90900000-0000-4000-a000-000000000071'::text, 'provider_only'::text,
            'Google Play has a payment we never recorded'::text, 60000),
           (null, 'ours_only', 'We recorded a payment Google Play does not list', null),
           (null, 'provider_only', 'Google Play has a payment we never recorded', null)$$,
  'alerts name the reader only when they exist');
select results_eq(
  $$select provider, status, unmatched, error from public.store_reconcile_runs order by id$$,
  $$values ('revenuecat'::text, 'ok'::text, 3, null::text), ('revenuecat', 'ok', 1, null),
           ('flutterwave', 'ok', 1, null), ('flutterwave', 'failed', 0, 'flutterwave transactions: 500')$$,
  'every run is recorded');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set local role authenticated;
select pg_temp.as_user('90900000-0000-4000-a000-000000000072');
select is((select count(*)::int from public.store_reconcile_runs), 4, 'Finance reads the runs');
select pg_temp.as_user('90900000-0000-4000-a000-000000000073');
select is((select count(*)::int from public.store_reconcile_runs), 0, 'Support does not');
select throws_ok($$select public.record_store_reconcile('revenuecat', now() - interval '8 days', now(), 'ok', 0, 0, 0, '[]')$$,
  '42501', null, 'staff cannot record a run');
select throws_ok($$insert into public.store_reconcile_runs (provider, window_start, window_end, status)
                   values ('revenuecat', now() - interval '1 day', now(), 'ok')$$,
  '42501', null, 'nobody writes runs directly');
reset role;

select * from finish();
rollback;
