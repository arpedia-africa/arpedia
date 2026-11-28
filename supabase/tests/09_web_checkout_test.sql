-- Flow 09 · spec check 09-3 (rule 8): a web checkout is started by the api Worker only. The
-- database picks the current web price and writes the tx_ref the Flutterwave webhook reads; it
-- refuses unknown or inactive products, readers with a live plan, deleted accounts and accounts
-- without an email. One payment plan is kept per plan and price. A checkout grants nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- 71 reader, 72 reader on a plan, 73 deleted, 74 no email, 75 finance.
insert into auth.users (id, email)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid,
       case when n = 74 then null else 'wc' || n || '@flow09.test' end
from generate_series(71, 75) n;
insert into public.profiles (id, full_name)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'Web ' || n
from generate_series(71, 75) n
on conflict (id) do nothing;
update public.profiles set full_name = 'Web 71' where id = '90900000-0000-4000-a000-000000000071';
update public.profiles set deleted_at = now() where id = '90900000-0000-4000-a000-000000000073';
insert into public.staff_roles (user_id, role) values ('90900000-0000-4000-a000-000000000075', 'finance');
insert into public.subscriptions (user_id, plan_code, status, store, store_original_txn_id, period_end)
values ('90900000-0000-4000-a000-000000000072', 'monthly', 'active', 'play', 'wc-play-72', now() + interval '10 days');

-- Expected values, read before switching roles (_plan is not granted to the Worker's role).
select set_config('t.price', public._plan('monthly') ->> 'price_web_kobo', true),
       set_config('t.credits', public._plan('monthly') ->> 'total_credits', true);

-- Readers cannot start one for themselves or anyone else.
select set_config('request.jwt.claims', '{"sub":"90900000-0000-4000-a000-000000000071","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'plan', 'monthly')$$,
  '42501', null, 'a signed-in reader cannot call start_web_checkout');
select throws_ok($$select public.set_web_payment_plan('x', '1')$$, '42501', null,
  'nor set_web_payment_plan');
select is((select count(*) from public.web_checkouts)::int, 0, 'readers see no checkouts');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table r as
select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'plan', 'monthly') j;
select ok((select j ->> 'tx_ref' from r) ~ '^arp:plan:monthly:90900000-0000-4000-a000-000000000071:[0-9a-f]{32}$',
  'the tx_ref is arp:{kind}:{code}:{user}:{nonce}');
select is((select (j ->> 'amount_kobo')::bigint from r), current_setting('t.price')::bigint,
  'a plan costs its current web price');
select is((select (j ->> 'credits')::int from r), current_setting('t.credits')::int,
  'and carries its credits');
select is((select concat_ws(' | ', j ->> 'email', j ->> 'name', j ->> 'months', j ->> 'title',
                            coalesce(j ->> 'flutterwave_plan_id', 'none')) from r),
  'wc71@flow09.test | Web 71 | 1 | Arpedia Monthly | none', 'email, name, months and title; no payment plan yet');
select is((select concat_ws(' | ', user_id, kind, code, amount_kobo) from public.web_checkouts
           where tx_ref = (select j ->> 'tx_ref' from r)),
  concat_ws(' | ', '90900000-0000-4000-a000-000000000071', 'plan', 'monthly',
            current_setting('t.price')),
  'the checkout is kept');
select is((select count(*) from public.credit_ledger where user_id = '90900000-0000-4000-a000-000000000071')::int, 0,
  'a checkout grants no credits');

-- The payment plan is saved once per plan and price; the first one saved wins.
select is(public.set_web_payment_plan((select j ->> 'tx_ref' from r), '4242'), '4242', 'the payment plan is saved');
create temp table r2 as
select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'plan', 'monthly') j;
select is((select j ->> 'flutterwave_plan_id' from r2), '4242', 'the next checkout at that price reuses it');
select is(public.set_web_payment_plan((select j ->> 'tx_ref' from r2), '5555'), '4242',
  'a second plan created at the same time is not saved');
select isnt((select j ->> 'tx_ref' from r2), (select j ->> 'tx_ref' from r), 'every checkout has its own tx_ref');
select throws_ok($$select public.set_web_payment_plan('arp:topup:nope', '1')$$, '22023', 'bad_request',
  'a payment plan needs a plan checkout');

-- Top-ups: a one-off charge at the top-up price.
select is((select concat_ws(' | ', j ->> 'amount_kobo', j ->> 'credits', j ->> 'title', coalesce(j ->> 'months', 'none'))
           from (select public.start_web_checkout('90900000-0000-4000-a000-000000000072', 'topup', 'topup_200') j) t),
  (select concat_ws(' | ', price_kobo, credits, 'Arpedia ' || credits || ' credits', 'none')
   from public.topup_products where code = 'topup_200'),
  'a top-up costs its price, even for a reader on a plan');

-- Refusals.
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000072', 'plan', 'yearly')$$,
  '23505', 'already_subscribed', 'a reader on a live plan manages it instead');
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'plan', 'weekly')$$,
  'P0002', 'unknown_product', 'an unknown plan is refused');
update public.topup_products set active = false where code = 'topup_500';
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'topup', 'topup_500')$$,
  'P0002', 'unknown_product', 'a top-up off sale is refused');
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000073', 'topup', 'topup_200')$$,
  '42501', 'account_unavailable', 'a deleted account cannot pay');
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000074', 'topup', 'topup_200')$$,
  '22023', 'no_email', 'an account without an email cannot pay on the web');
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'gift', 'monthly')$$,
  '22023', 'bad_request', 'only plans and top-ups');

-- Ten checkouts an hour per reader (71 has two; eight more, then the eleventh is refused).
do $$ begin
  for i in 1..8 loop
    perform public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'topup', 'topup_200');
  end loop;
end $$;
select throws_ok($$select public.start_web_checkout('90900000-0000-4000-a000-000000000071', 'topup', 'topup_200')$$,
  '54000', 'rate_limited', 'the eleventh checkout in an hour is refused');
reset role;

-- Finance can look checkouts up; nobody writes them from a client.
select set_config('request.jwt.claims', '{"sub":"90900000-0000-4000-a000-000000000075","role":"authenticated"}', true);
set local role authenticated;
select ok((select count(*) from public.web_checkouts) >= 3, 'Finance reads checkouts');
reset role;

select * from finish();
rollback;
