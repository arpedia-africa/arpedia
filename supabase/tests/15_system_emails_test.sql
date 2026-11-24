-- Flow 15 · welcome and receipt notices (spec check 15-6): finishing onboarding queues one welcome;
-- a paid web checkout queues a receipt with amount and item; Play purchases and pending web
-- payments queue none.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('15a00000-0000-4000-a000-000000000001', 'w1@t15a.local', '{"full_name":"Ifeoma Nwosu"}');
update public.profiles set onboarding_step = 'signup' where id = '15a00000-0000-4000-a000-000000000001';

create temp view welcomes as
  select * from pgmq.q_user_notify
  where message ->> 'kind' = 'welcome' and message ->> 'user_id' = '15a00000-0000-4000-a000-000000000001';
create temp view receipts as
  select * from pgmq.q_user_notify
  where message ->> 'kind' = 'receipt' and message ->> 'user_id' = '15a00000-0000-4000-a000-000000000001';

-- ─── welcome ────────────────────────────────────────────────────────────────
update public.profiles set onboarding_step = 'profile' where id = '15a00000-0000-4000-a000-000000000001';
select is((select count(*) from welcomes), 0::bigint, 'no welcome before onboarding finishes');
update public.profiles set onboarding_step = 'plans' where id = '15a00000-0000-4000-a000-000000000001';
select is((select count(*) from welcomes), 1::bigint, 'reaching plans queues the welcome');
update public.profiles set onboarding_step = 'done' where id = '15a00000-0000-4000-a000-000000000001';
select is((select count(*) from welcomes), 1::bigint, 'and only once');

-- ─── receipt ────────────────────────────────────────────────────────────────
insert into public.transactions (user_id, kind, topup_code, store, store_txn_id, gross_kobo, credits_granted)
values ('15a00000-0000-4000-a000-000000000001', 'topup', 'topup_500', 'play', 't15a-play', 150000, 500);
select is((select count(*) from receipts), 0::bigint, 'Play purchases get no receipt from us');

insert into public.transactions (user_id, kind, plan_code, store, store_txn_id, gross_kobo, status)
values ('15a00000-0000-4000-a000-000000000001', 'plan', 'quarterly', 'web', 't15a-web', 210000, 'pending');
select is((select count(*) from receipts), 0::bigint, 'a pending web payment gets no receipt yet');

update public.transactions set status = 'succeeded' where store_txn_id = 't15a-web';
select is((select message ->> 'item' || ' ' || (message ->> 'amount_kobo') from receipts),
  'Quarterly plan 210000', 'paid web checkout queues a receipt with item and amount');
update public.transactions set status = 'refunded' where store_txn_id = 't15a-web';
select is((select count(*) from receipts), 1::bigint, 'later status changes send no second receipt');

select * from finish();
rollback;
