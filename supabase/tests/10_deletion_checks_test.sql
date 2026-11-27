-- Flow 10 · spec check 10-16 (unpaid earnings net of payouts and exclusions, so a paid author can
-- delete) and 10-19 (RLS on staff_notes and annotations, reviews and passage comments kept as
-- "Former reader" after erasure, wrong roles refused by staff_start_deletion and staff_set_reader_role).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- 1 paid author, 2 part-paid author, 3 author whose only earning was excluded, 4 reader, 5 other reader,
-- 6 support, 7 finance, 8 publisher, 9 reader who is erased, 10 operations admin.
insert into auth.users (id, email, raw_user_meta_data)
select ('10160000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@t1016.local',
       jsonb_build_object('full_name', 'User ' || n)
from generate_series(1, 10) n;
update public.profiles set onboarding_step = 'done', is_author = right(id::text, 2) in ('01', '02', '03')
where id::text like '10160000-%';
insert into public.staff_roles (user_id, role) values
  ('10160000-0000-4000-a000-000000000006', 'support'),
  ('10160000-0000-4000-a000-000000000007', 'finance'),
  ('10160000-0000-4000-a000-000000000008', 'publisher'),
  ('10160000-0000-4000-a000-000000000010', 'operations_admin');

-- Reader 4 spends on the three authors' books.
insert into public.credit_ledger (user_id, delta, reason, bucket) values
  ('10160000-0000-4000-a000-000000000004', 1000, 'top_up', 'topup');
insert into public.credit_ledger (user_id, delta, reason, bucket, author_id, author_earning_kobo, idempotency_key) values
  ('10160000-0000-4000-a000-000000000004', -10, 'chapter', 'topup', '10160000-0000-4000-a000-000000000001', 1600, 't1016:a1'),
  ('10160000-0000-4000-a000-000000000004', -20, 'chapter', 'topup', '10160000-0000-4000-a000-000000000002', 3200, 't1016:a2'),
  ('10160000-0000-4000-a000-000000000004', -5, 'chapter', 'topup', '10160000-0000-4000-a000-000000000003', 800, 't1016:a3');

-- October is paid: author 1 in full, author 2 for ₦16 of ₦32 (one transfer succeeded, one failed).
insert into public.earning_cycles (id, month, status) values
  ('10160000-0000-4000-c000-000000000001', '2026-10-01', 'paid_with_failures');
insert into public.author_earnings (id, cycle_id, author_id, amount_kobo, payable_kobo, status) values
  ('10160000-0000-4000-c000-000000000011', '10160000-0000-4000-c000-000000000001', '10160000-0000-4000-a000-000000000001',
   1600, 1600, 'paid'),
  ('10160000-0000-4000-c000-000000000012', '10160000-0000-4000-c000-000000000001', '10160000-0000-4000-a000-000000000002',
   3200, 3200, 'partly_failed');
insert into public.payout_runs (id, cycle_id, status) values
  ('10160000-0000-4000-c000-000000000021', '10160000-0000-4000-c000-000000000001', 'done_with_failures');
insert into public.payouts (run_id, author_earning_id, author_id, amount_kobo, attempt, reference, status) values
  ('10160000-0000-4000-c000-000000000021', '10160000-0000-4000-c000-000000000011', '10160000-0000-4000-a000-000000000001',
   1600, 1, 't1016-po-1', 'successful'),
  ('10160000-0000-4000-c000-000000000021', '10160000-0000-4000-c000-000000000012', '10160000-0000-4000-a000-000000000002',
   1600, 1, 't1016-po-2', 'successful'),
  ('10160000-0000-4000-c000-000000000021', '10160000-0000-4000-c000-000000000012', '10160000-0000-4000-a000-000000000002',
   1600, 2, 't1016-po-3', 'failed');
-- Author 3's only earning was returned to the reader (excluded from pay).
insert into public.earning_exclusions (ledger_id, reason, credits, kobo)
select id, 'staff_return', 5, 800 from public.credit_ledger where idempotency_key = 't1016:a3';

-- ─── 10-16: unpaid earnings ─────────────────────────────────────────────────
select is(public._unpaid_earnings_kobo('10160000-0000-4000-a000-000000000001'), 0::bigint,
  'a fully paid author has nothing waiting');
select is(public._unpaid_earnings_kobo('10160000-0000-4000-a000-000000000002'), 1600::bigint,
  'a failed transfer still counts as waiting');
select is(public._unpaid_earnings_kobo('10160000-0000-4000-a000-000000000003'), 0::bigint,
  'excluded earnings are not waiting');
select is(public._unpaid_earnings_kobo('10160000-0000-4000-a000-000000000004'), 0::bigint,
  'a reader has no earnings');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '10160000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- Content for the RLS and anonymisation checks.
insert into public.books (id, author_id, title, status) values
  ('10160000-0000-4000-b000-000000000001', '10160000-0000-4000-a000-000000000001', 'Paid Book', 'live');
insert into public.annotations (client_id, user_id, book_id, kind, color, cfi_range, quote) values
  (gen_random_uuid(), '10160000-0000-4000-a000-000000000004', '10160000-0000-4000-b000-000000000001', 'highlight', 'yellow',
   'epubcfi(/6/2!/4/2)', 'A private highlight');
insert into public.reviews (book_id, user_id, stars, body) values
  ('10160000-0000-4000-b000-000000000001', '10160000-0000-4000-a000-000000000009', 4, 'Kept after I leave');
insert into public.passage_comments (book_id, para_id, user_id, body) values
  ('10160000-0000-4000-b000-000000000001', 'p1', '10160000-0000-4000-a000-000000000009', 'Also kept');
insert into public.staff_notes (user_id, author_id, body) values
  ('10160000-0000-4000-a000-000000000004', '10160000-0000-4000-a000-000000000006', 'Called about a refund');

set local role authenticated;

select pg_temp.as_user('10160000-0000-4000-a000-000000000001');
select is((public.request_account_deletion('DELETE')).status, 'pending'::public.deletion_status,
  'a fully paid author can delete');
select pg_temp.as_user('10160000-0000-4000-a000-000000000002');
select throws_ok($$select public.request_account_deletion('DELETE')$$, '22023', 'earnings_waiting',
  'an author with money still waiting cannot');
select pg_temp.as_user('10160000-0000-4000-a000-000000000003');
select is((public.request_account_deletion('DELETE')).status, 'pending'::public.deletion_status,
  'an author whose earnings were all excluded can delete');

-- ─── 10-19: RLS on annotations ──────────────────────────────────────────────
select pg_temp.as_user('10160000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.annotations where book_id = '10160000-0000-4000-b000-000000000001'), 1,
  'a reader sees their own highlight');
select pg_temp.as_user('10160000-0000-4000-a000-000000000005');
select is((select count(*)::int from public.annotations where book_id = '10160000-0000-4000-b000-000000000001'), 0,
  'another reader cannot see a private highlight');
select throws_ok($$insert into public.annotations (client_id, user_id, book_id, kind, color, cfi_range)
                   values (gen_random_uuid(), auth.uid(), '10160000-0000-4000-b000-000000000001', 'highlight', 'green', 'x')$$,
  '42501', null, 'annotations are not written directly');

-- ─── 10-19: RLS on staff_notes ──────────────────────────────────────────────
select pg_temp.as_user('10160000-0000-4000-a000-000000000006');
select is((select count(*)::int from public.staff_notes where user_id = '10160000-0000-4000-a000-000000000004'), 1,
  'Support reads staff notes');
select pg_temp.as_user('10160000-0000-4000-a000-000000000010');
select is((select count(*)::int from public.staff_notes where user_id = '10160000-0000-4000-a000-000000000004'), 1,
  'Operations admin reads staff notes');
select pg_temp.as_user('10160000-0000-4000-a000-000000000007');
select is((select count(*)::int from public.staff_notes), 0, 'Finance cannot read staff notes');
select pg_temp.as_user('10160000-0000-4000-a000-000000000008');
select is((select count(*)::int from public.staff_notes), 0, 'a Publisher cannot');
select pg_temp.as_user('10160000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.staff_notes), 0, 'the reader cannot read notes about them');
select throws_ok($$insert into public.staff_notes (user_id, body) values (auth.uid(), 'mine')$$, '42501', null,
  'notes are not written directly');

-- ─── 10-19: wrong roles ─────────────────────────────────────────────────────
select pg_temp.as_user('10160000-0000-4000-a000-000000000007');
select throws_ok($$select public.staff_start_deletion('10160000-0000-4000-a000-000000000005', 'now', 'Asked by email', 'DELETE')$$,
  '42501', null, 'Finance cannot start a deletion');
select pg_temp.as_user('10160000-0000-4000-a000-000000000008');
select throws_ok($$select public.staff_start_deletion('10160000-0000-4000-a000-000000000005', 'now', 'Asked by email', 'DELETE')$$,
  '42501', null, 'a Publisher cannot either');
select pg_temp.as_user('10160000-0000-4000-a000-000000000006');
select throws_ok($$select public.staff_set_reader_role('10160000-0000-4000-a000-000000000005', 'author')$$,
  '42501', null, 'Support cannot change a reader''s role');
select pg_temp.as_user('10160000-0000-4000-a000-000000000010');
select throws_ok($$select public.staff_set_reader_role('10160000-0000-4000-a000-000000000005', 'author')$$,
  '42501', null, 'Operations admin cannot either (Super admin only)');
select pg_temp.as_user('10160000-0000-4000-a000-000000000006');
select is((public.staff_start_deletion('10160000-0000-4000-a000-000000000009', 'now', 'Asked by email', 'DELETE')).status,
  'pending'::public.deletion_status, 'Support can start a deletion');

-- ─── 10-19: reviews and passage comments stay, as "Former reader" ───────────
reset role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select ok(public.erase_account((select id from public.account_deletions
  where user_id = '10160000-0000-4000-a000-000000000009' and status = 'pending')), 'erased');
select results_eq($$select r.body, p.full_name, p.username, p.avatar_url from public.reviews r
                    join public.profiles p on p.id = r.user_id
                    where r.book_id = '10160000-0000-4000-b000-000000000001'$$,
  $$values ('Kept after I leave'::text, 'Former reader'::text, null::text, null::text)$$,
  'the review stays, signed Former reader with no username or photo');
select results_eq($$select c.body, p.full_name from public.passage_comments c
                    join public.profiles p on p.id = c.user_id
                    where c.book_id = '10160000-0000-4000-b000-000000000001'$$,
  $$values ('Also kept'::text, 'Former reader'::text)$$, 'the passage comment stays, signed Former reader');

select * from finish();
rollback;
