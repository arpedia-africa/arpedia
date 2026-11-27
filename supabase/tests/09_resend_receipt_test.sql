-- Spec check 09-10: Finance and Super admin resend a web payment's receipt; store payments and unpaid
-- charges have none; Support cannot; every resend is audited.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- 61 reader, 62 finance, 63 support, 64 super admin.
insert into auth.users (id, email)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'rr' || n || '@flow09.test'
from generate_series(61, 64) n;
insert into public.profiles (id, full_name)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'Receipt ' || n
from generate_series(61, 64) n
on conflict (id) do nothing;
insert into public.staff_roles (user_id, role) values
  ('90900000-0000-4000-a000-000000000062', 'finance'),
  ('90900000-0000-4000-a000-000000000063', 'support'),
  ('90900000-0000-4000-a000-000000000064', 'super_admin');

insert into public.transactions (id, user_id, kind, plan_code, topup_code, store, store_txn_id, gross_kobo, status,
                                 created_at)
values
  ('90900000-0000-4000-f000-000000000061', '90900000-0000-4000-a000-000000000061', 'topup', null, 'topup_200',
   'web', 'rr-web-ok', 60000, 'succeeded', '2026-11-10 13:22:00+00'),
  ('90900000-0000-4000-f000-000000000062', '90900000-0000-4000-a000-000000000061', 'plan', 'monthly', null,
   'play', 'rr-play', 90000, 'succeeded', now()),
  ('90900000-0000-4000-f000-000000000063', '90900000-0000-4000-a000-000000000061', 'plan', 'monthly', null,
   'web', 'rr-web-failed', 90000, 'failed', now());

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
create function pg_temp.resent() returns setof jsonb language sql security definer as $$
  select message from pgmq.q_user_notify where message ->> 'kind' = 'receipt' and (message ->> 'resent')::boolean
$$;
grant execute on function pg_temp.resent() to authenticated;

set local role authenticated;

select pg_temp.as_user('90900000-0000-4000-a000-000000000062');
select is(public.staff_resend_receipt('90900000-0000-4000-f000-000000000061') ->> 'status', 'sent',
  'Finance resends a web receipt');
select results_eq($$select m ->> 'user_id', m ->> 'item', (m ->> 'amount_kobo')::bigint, (m ->> 'paid_at')::timestamptz
                    from pg_temp.resent() m$$,
  $$values ('90900000-0000-4000-a000-000000000061'::text, '200 credits'::text, 60000::bigint,
            '2026-11-10 13:22:00+00'::timestamptz)$$,
  'the same receipt notice goes to the reader, dated when they paid');
select throws_ok($$select public.staff_resend_receipt('90900000-0000-4000-f000-000000000062')$$, 'P0001', 'not_web',
  'a Google Play payment has no Arpedia receipt');
select throws_ok($$select public.staff_resend_receipt('90900000-0000-4000-f000-000000000063')$$, 'P0001', 'not_paid',
  'a failed charge has no receipt');
select throws_ok($$select public.staff_resend_receipt('90900000-0000-4000-f000-0000000000ff')$$, 'P0001',
  'unknown_transaction', 'an unknown payment is refused');

select pg_temp.as_user('90900000-0000-4000-a000-000000000064');
select is(public.staff_resend_receipt('90900000-0000-4000-f000-000000000061') ->> 'status', 'sent',
  'a Super admin can resend too');
select is((select count(*)::int from pg_temp.resent()), 2, 'each resend queues one notice');

select pg_temp.as_user('90900000-0000-4000-a000-000000000063');
select throws_ok($$select public.staff_resend_receipt('90900000-0000-4000-f000-000000000061')$$, '42501', null,
  'Support cannot resend receipts');
select pg_temp.as_user('90900000-0000-4000-a000-000000000061');
select throws_ok($$select public.staff_resend_receipt('90900000-0000-4000-f000-000000000061')$$, '42501', null,
  'a reader cannot either');

reset role;
select is((select count(*)::int from public.audit_log
           where action = 'resend_receipt' and object_id = '90900000-0000-4000-f000-000000000061'), 2,
  'every resend is in the audit log');

select * from finish();
rollback;
