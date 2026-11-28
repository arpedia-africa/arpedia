-- Flow 13 · spec check 13-18: a closed cycle carries the month's net revenue (gross less store fees
-- less refunds), refreshed until the run is approved, then kept.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('13b00000-0000-4000-a000-000000000001', 'u@t13n.local');
insert into public.profiles (id, full_name) values ('13b00000-0000-4000-a000-000000000001', 'Buyer')
on conflict (id) do nothing;
create function pg_temp.txn(p_ref text, p_gross bigint, p_fee bigint, p_refunded bigint, p_status text, p_at timestamptz)
returns void language sql as $$
  insert into public.transactions (user_id, kind, topup_code, store, store_txn_id, gross_kobo, fee_kobo, refunded_kobo,
                                   status, created_at)
  values ('13b00000-0000-4000-a000-000000000001', 'topup', (select code from public.topup_products limit 1), 'web',
          p_ref, p_gross, p_fee, p_refunded, p_status, p_at)
$$;
-- March 2025 (WAT): 1 Mar 00:30 WAT is 28 Feb 23:30 UTC and belongs to March.
select pg_temp.txn('t13n-1', 100000, 1400, 0, 'succeeded', '2025-02-28 23:30+00');
select pg_temp.txn('t13n-2', 50000, 700, 50000, 'refunded', '2025-03-10 12:00+01');
select pg_temp.txn('t13n-3', 90000, 0, 0, 'failed', '2025-03-11 12:00+01');
select pg_temp.txn('t13n-4', 70000, 1000, 0, 'succeeded', '2025-04-01 00:30+01');

insert into public.earning_cycles (month) values ('2025-03-01');
select is((select net_revenue_kobo from public.earning_cycles where month = '2025-03-01'), null,
  'an open cycle has no net revenue yet');

update public.earning_cycles set status = 'closed' where month = '2025-03-01';
select is((select net_revenue_kobo from public.earning_cycles where month = '2025-03-01'), 98600 - 700::bigint,
  'closing writes gross less fees less refunds for the WAT month (failed and next-month sales left out)');

select pg_temp.txn('t13n-5', 20000, 300, 0, 'succeeded', '2025-03-20 12:00+01');
update public.earning_cycles set status = 'prepared' where month = '2025-03-01';
select is((select net_revenue_kobo from public.earning_cycles where month = '2025-03-01'), 97900 + 19700::bigint,
  'a late sale is picked up while the cycle is prepared');

update public.transactions set refunded_kobo = 20000, status = 'refunded' where store_txn_id = 't13n-5';
update public.earning_cycles set status = 'approved' where month = '2025-03-01';
select is((select net_revenue_kobo from public.earning_cycles where month = '2025-03-01'), 117600::bigint,
  'once approved it is kept as it was');

select is(public._cycle_net_revenue('2025-03-01'), 97600::bigint, 'the helper follows the ledger of sales');

select * from finish();
rollback;
