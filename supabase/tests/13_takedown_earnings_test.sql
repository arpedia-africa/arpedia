-- Flow 13 · spec check 13-4: upholding a copyright claim holds back that book's earnings from the
-- claim date (takedown exclusions), keeps earlier earnings paid, nets a charge and its undo together
-- (also an undo written after the uphold), turns rows of an already closed month into a negative
-- adjustment, and stops holding the author's other books once no claim is open.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
create function pg_temp.charge(p_book uuid, c int, k text, at timestamptz) returns void language sql as $$
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                    idempotency_key, created_at)
  values ('13400000-0000-4000-a000-000000000002', -c, 'chapter', 'topup', p_book,
          '13400000-0000-4000-a000-000000000001', c * 160, k, at)
$$;
create function pg_temp.undo(k text, at timestamptz) returns void language sql as $$
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                    idempotency_key, ref_ledger_id, created_at)
  select user_id, -delta, 'undo', bucket, book_id, author_id, -author_earning_kobo, 'undo:' || k, id, at
  from public.credit_ledger where idempotency_key = k
$$;

-- Author Au (verified bank), reader R, Publisher P. Book D gets the claim, book K is unrelated.
insert into auth.users (id, email, raw_user_meta_data) values
  ('13400000-0000-4000-a000-000000000001', 'au@t134.local', '{"full_name":"Takedown Author"}'),
  ('13400000-0000-4000-a000-000000000002', 'r@t134.local', '{"full_name":"Takedown Reader"}'),
  ('13400000-0000-4000-a000-000000000003', 'p@t134.local', '{"full_name":"Takedown Publisher"}');
insert into public.staff_roles (user_id, role) values ('13400000-0000-4000-a000-000000000003', 'publisher');
insert into public.author_profiles (user_id, pen_name, status) values
  ('13400000-0000-4000-a000-000000000001', 'Takedown Author', 'active');
insert into public.author_bank_accounts (author_id, bank_code, bank_name, account_last4, account_number_enc,
                                         bank_account_name, match_score, status, payouts_resume_at)
values ('13400000-0000-4000-a000-000000000001', '058', 'GTBank', '1234', 'enc', 'Takedown Author', 100, 'verified', now());
insert into public.books (id, author_id, title, status) values
  ('13400000-0000-4000-b000-000000000001', '13400000-0000-4000-a000-000000000001', 'Disputed Book', 'live'),
  ('13400000-0000-4000-b000-000000000002', '13400000-0000-4000-a000-000000000001', 'Kept Book', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits) values
  ('13400000-0000-4000-c000-000000000001', '13400000-0000-4000-b000-000000000001', 1, 'live', 25000, 100, 50),
  ('13400000-0000-4000-c000-000000000002', '13400000-0000-4000-b000-000000000002', 1, 'live', 25000, 100, 50);
update public.books set current_revision_id = '13400000-0000-4000-c000-000000000001' where id = '13400000-0000-4000-b000-000000000001';
update public.books set current_revision_id = '13400000-0000-4000-c000-000000000002' where id = '13400000-0000-4000-b000-000000000002';

insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('13400000-0000-4000-a000-000000000002', 200, 'top_up', 'topup', 't134:top', '2025-01-10 10:00+01');
-- Claim opened 10 Feb. Feb 5 is before it (paid); Feb 20 after it, in a month closed before the uphold.
select pg_temp.charge('13400000-0000-4000-b000-000000000001', 10, 't134:before', '2025-02-05 12:00+01');
select pg_temp.charge('13400000-0000-4000-b000-000000000001', 6, 't134:feb', '2025-02-20 12:00+01');
select pg_temp.charge('13400000-0000-4000-b000-000000000001', 4, 't134:mar', '2025-03-05 12:00+01');
select pg_temp.charge('13400000-0000-4000-b000-000000000001', 5, 't134:undone', '2025-03-06 12:00+01');
select pg_temp.undo('t134:undone', '2025-03-06 12:05+01');
select pg_temp.charge('13400000-0000-4000-b000-000000000002', 20, 't134:kept', '2025-03-07 12:00+01');
select pg_temp.charge('13400000-0000-4000-b000-000000000001', 3, 't134:late', now() - interval '2 minutes');
insert into public.copyright_claims (book_id, claimant_name, type, details, created_at)
values ('13400000-0000-4000-b000-000000000001', 'Claimant', 'copyright', 'My novel', '2025-02-10 09:00+01');

select public._close_cycle('2025-02-01');
select is((select amount_kobo from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2025-02-01' and e.author_id = '13400000-0000-4000-a000-000000000001'), 2560::bigint,
  'before the decision the month pays every charge');

select pg_temp.as_staff('13400000-0000-4000-a000-000000000003');
select lives_ok($$ select public.decide_claim((select id from public.copyright_claims
                                              where book_id = '13400000-0000-4000-b000-000000000001'), 'uphold', 'Full copy') $$,
  'a Publisher upholds the claim');
select pg_temp.as_owner();

select is((select array_agg(l.idempotency_key order by l.id) from public.earning_exclusions x
           join public.credit_ledger l on l.id = x.ledger_id where x.reason = 'takedown'),
  array['t134:feb', 't134:mar', 't134:undone', 'undo:t134:undone', 't134:late'],
  'every earning row of the book since the claim date is held back, charges and undos alike');
select ok(not exists (select 1 from public.earning_exclusions where ledger_id = pg_temp.id('t134:before')),
  'earnings before the claim date stay paid (open question 6)');
select ok(not exists (select 1 from public.earning_exclusions where ledger_id = pg_temp.id('t134:kept')),
  'the author''s other book is not touched');
select is((select (after ->> 'earnings_held_back_rows')::int from public.audit_log
           where action = 'claim.uphold' order by id desc limit 1), 5, 'the audit entry counts them');

-- An undo of a held-back charge written after the uphold (10-minute window) is held back too.
select pg_temp.undo('t134:late', now());
select ok(exists (select 1 from public.earning_exclusions where ledger_id = pg_temp.id('undo:t134:late') and reason = 'takedown'),
  'a later undo of a held-back charge is held back, so the pair nets to zero');

select public._close_cycle('2025-03-01');
select is((select amount_kobo from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2025-03-01' and e.author_id = '13400000-0000-4000-a000-000000000001'), 3200::bigint,
  'March pays only the other book');
select is((select adjustment_kobo from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2025-03-01' and e.author_id = '13400000-0000-4000-a000-000000000001'), -960::bigint,
  'the charge from the closed February comes off as a negative adjustment');

select is((select status::text from public._line_status('13400000-0000-4000-a000-000000000001', 500000, 100000)), 'payable',
  'with no claim open, the taken-down book no longer holds the author''s other earnings');
insert into public.copyright_claims (book_id, claimant_name, type, details)
values ('13400000-0000-4000-b000-000000000001', 'Second claimant', 'copyright', 'Mine too');
select is((select status::text from public._line_status('13400000-0000-4000-a000-000000000001', 500000, 100000)), 'held_dispute',
  'another open claim on the taken-down book still holds the line');

select * from finish();
rollback;
