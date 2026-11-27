-- Flow 13 · spec check 13-6: a chapter returned by Support (flow 14 credit_returns) is a staff_return
-- exclusion, nets out of book credits as well as kobo (credits stay amount ÷ 160), and a return of
-- a charge from an earlier month is a late adjustment. Rows written before ref_ledger_id was set
-- are matched by their idempotency key.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.as_staff(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create function pg_temp.id(k text) returns bigint language sql as $$
  select id from public.credit_ledger where idempotency_key = k
$$;
-- The rows flow 14's _do_credit_return writes for one returned charge row.
create function pg_temp.returned(k text, at timestamptz, with_ref boolean) returns void language sql as $$
  insert into public.credit_ledger (user_id, delta, reason, bucket, ref_type, ref_id, idempotency_key, book_id,
                                    author_id, author_earning_kobo, note, ref_ledger_id, created_at)
  select user_id, -delta, 'refund', bucket, 'credit_return', gen_random_uuid()::text, 'credit_return:' || id,
         book_id, author_id, -author_earning_kobo, 'Staff return', case when with_ref then id end, at
  from public.credit_ledger where idempotency_key = k
$$;

-- 1 author, 2 reader, 3 support.
insert into auth.users (id, email)
select ('13600000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t13r.local' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('13600000-0000-4000-a000-00000000000' || n)::uuid, 'Returner ' || n, n = 1 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values ('13600000-0000-4000-a000-000000000003', 'support');
insert into public.books (id, author_id, title, status) values
  ('13600000-0000-4000-b000-000000000001', '13600000-0000-4000-a000-000000000001', 'Returned', 'live');

-- February 2025: one charge, returned by Support in March (late). March: a kept charge, a charge
-- returned with ref_ledger_id, and one returned before ref_ledger_id was set (key only).
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('13600000-0000-4000-a000-000000000002', 100, 'top_up', 'topup', 't13r:top', '2025-01-10 10:00+01');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at)
select '13600000-0000-4000-a000-000000000002', -c, 'chapter', 'topup', '13600000-0000-4000-b000-000000000001',
       '13600000-0000-4000-a000-000000000001', c * 160, k, at::timestamptz
from (values (6, 't13r:feb', '2025-02-20 12:00+01'), (10, 't13r:kept', '2025-03-05 12:00+01'),
             (5, 't13r:ret', '2025-03-06 12:00+01'), (4, 't13r:old', '2025-03-07 12:00+01')) v(c, k, at);
select pg_temp.returned('t13r:feb', '2025-03-10 12:00+01', true);
select pg_temp.returned('t13r:ret', '2025-03-11 12:00+01', true);
select pg_temp.returned('t13r:old', '2025-03-12 12:00+01', false);

select public._close_cycle('2025-02-01');
select public._close_cycle('2025-03-01');
select results_eq($$select book_credits, amount_kobo, adjustment_kobo, excluded_credits
                    from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
                    where c.month = '2025-03-01' and e.author_id = '13600000-0000-4000-a000-000000000001'$$,
  $$values (10, 1600::bigint, -960::bigint, 0)$$,
  'returned chapters net out of credits and kobo; the February return is an adjustment');
select is((select book_credits * 160::bigint - amount_kobo from public.author_earnings e
           join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2025-03-01' and e.author_id = '13600000-0000-4000-a000-000000000001'),
  0::bigint, 'book credits equal kobo ÷ 160 after Support returns');
select is((select book_credits from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2025-02-01' and e.author_id = '13600000-0000-4000-a000-000000000001'),
  6, 'February keeps its own line (closed months never change)');
select results_eq($$select l.idempotency_key, x.credits, x.kobo::bigint from public.earning_exclusions x
                    join public.credit_ledger l on l.id = x.ledger_id
                    where x.reason = 'staff_return' and l.idempotency_key like 't13r:%' order by 1$$,
  $$values ('t13r:feb', 6, 960::bigint), ('t13r:old', 4, 640::bigint), ('t13r:ret', 5, 800::bigint)$$,
  'each Support return is a staff_return under what was not paid, old rows included');
select is((select (ledger_check ->> 'diff_kobo')::bigint from public.earning_cycles where month = '2025-03-01'),
  0::bigint, 'ledger check still balances');
select lives_ok($$select public._close_cycle('2025-03-01')$$, 'closing again is allowed');
select is((select count(*)::int from public.earning_exclusions x join public.credit_ledger l on l.id = x.ledger_id
           where l.idempotency_key like 't13r:%'), 3, 'and adds no second exclusion');

-- ─── A real return now names the charge it reverses ─────────────────────────
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits)
values ('13600000-0000-4000-c100-000000000001', '13600000-0000-4000-b000-000000000001', 1, 'live', 10000, 40, 20);
update public.books set current_revision_id = '13600000-0000-4000-c100-000000000001'
where id = '13600000-0000-4000-b000-000000000001';
insert into public.chapters (id, revision_id, chapter_uid, ord, title, words, pages, price_credits) values
  ('13600000-0000-4000-c200-000000000001', '13600000-0000-4000-c100-000000000001',
   '13600000-0000-4000-c300-000000000001', 1, 'One', 1500, 6, 3);
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, book_id, chapter_id, author_id,
                                  author_earning_kobo, idempotency_key, created_at) values
  ('13600000-0000-4000-a000-000000000002', -3, 'chapter', 'topup', '13600000-0000-4000-f000-000000000001',
   '13600000-0000-4000-b000-000000000001', '13600000-0000-4000-c200-000000000001',
   '13600000-0000-4000-a000-000000000001', 480, 't13r:now', now() - interval '20 minutes');
select pg_temp.as_staff('13600000-0000-4000-a000-000000000003');
select is((public.staff_return_chapter_charge(pg_temp.id('t13r:now'), 'skipped_ahead') ->> 'state'), 'done',
  'Support returns a chapter charge');
select pg_temp.as_owner();
select is((select ref_ledger_id from public.credit_ledger where idempotency_key = 'credit_return:' || pg_temp.id('t13r:now')),
  pg_temp.id('t13r:now'), 'the return row points at the charge it reverses');

select * from finish();
rollback;
