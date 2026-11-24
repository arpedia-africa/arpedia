-- Flow 15 · welcome and receipt notices (spec check 15-6): finishing onboarding queues one welcome;
-- a paid web checkout queues a receipt with amount and item; Play purchases and pending web
-- payments queue none. An email sign-up gets a one-time verify link that proves the address once.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

-- ─── verify email ───────────────────────────────────────────────────────────
select is((select count(*) from pgmq.q_user_notify where message ->> 'kind' = 'verify_email'
  and message ->> 'user_id' = '15a00000-0000-4000-a000-000000000001'), 1::bigint, 'an email sign-up queues a verify email');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15a00000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.issue_email_verification('15a00000-0000-4000-a000-000000000001') $$, '42501', null,
  'readers cannot issue links');
select throws_ok($$ select public.confirm_email_verification('x') $$, '42501', null, 'or confirm them directly');
select throws_ok($$ select * from public.email_verifications $$, '42501', null, 'and cannot read tokens');
reset role;

create temp table tok as select public.issue_email_verification('15a00000-0000-4000-a000-000000000001') as t;
select ok((select t from tok) ~ '^[0-9a-f]{48}$', 'an unproven address gets a token');
select isnt((select token_hash from public.email_verifications), (select t from tok), 'only the hash is stored');
select is(public.confirm_email_verification(repeat('0', 48)), 'invalid', 'a wrong token is refused');
select is(public.confirm_email_verification((select t from tok)), 'verified', 'the right token confirms');
select isnt((select email_verified_at from public.profiles where id = '15a00000-0000-4000-a000-000000000001'), null,
  'and proves the address');
select is(public.confirm_email_verification((select t from tok)), 'invalid', 'a token works once');
select is(public.issue_email_verification('15a00000-0000-4000-a000-000000000001'), null,
  'a proven address gets no new token');

update public.profiles set email_verified_at = null where id = '15a00000-0000-4000-a000-000000000001';
update tok set t = public.issue_email_verification('15a00000-0000-4000-a000-000000000001');
update auth.users set email = 'new@t15a.local' where id = '15a00000-0000-4000-a000-000000000001';
select is(public.confirm_email_verification((select t from tok)), 'expired', 'a link for an old address no longer proves');
update tok set t = public.issue_email_verification('15a00000-0000-4000-a000-000000000001');
update public.email_verifications set expires_at = now() - interval '1 minute';
select is(public.confirm_email_verification((select t from tok)), 'expired', 'an old link has expired');

select * from finish();
rollback;
