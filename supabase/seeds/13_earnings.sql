-- Flow 13 earnings seed: two months of author earnings for the Studio and the admin payout screens.
-- Two months ago is paid (one transfer failed, so Payouts has a Retry); last month is closed and on
-- its 30-day hold. Ifeoma and Chioma have verified accounts, Tolu's new account needs review, Musa
-- has none (held). Spends come from two demo readers so the seeded readers' balances don't change.
-- Account numbers are encrypted with the local-only Worker key (PAYOUT_ACCOUNT_KEY unset).

-- Authors without a profile yet (seed.sql makes them authors; flow 11 seeds Ifeoma and Chioma).
insert into public.author_profiles (user_id, pen_name, bio, location, status, approved_at, legal_name)
values
  ('00000000-0000-4000-a000-000000000003', 'Tolu Adebayo', 'Romance from Ibadan.', 'Ibadan', 'active',
   now() - interval '400 days', 'Tolulope Samson Adebayo'),
  ('00000000-0000-4000-a000-000000000006', 'Musa Danladi', 'Thrillers set on the Plateau.', 'Jos', 'active',
   now() - interval '300 days', 'Musa Danladi')
on conflict (user_id) do nothing;

-- Demo readers who did the spending (password arpedia-local, like every seeded login).
create temporary table seed13_readers (id uuid, email text, full_name text, username text);
insert into seed13_readers values
  ('00000000-0000-4000-a000-000000000131', 'reader13a@example.com', 'Bola Ade', 'bola13'),
  ('00000000-0000-4000-a000-000000000132', 'reader13b@example.com', 'Uche Nnamdi', 'uche13');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('arpedia-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(),
  '', '', '', ''
from seed13_readers;
insert into public.profiles (id, username, full_name, is_author)
select id, username, full_name, false from seed13_readers
on conflict (id) do update set username = excluded.username, full_name = excluded.full_name;

do $$
declare
  m1 date := (date_trunc('month', now() at time zone 'Africa/Lagos') - interval '2 months')::date;
  m2 date := (date_trunc('month', now() at time zone 'Africa/Lagos') - interval '1 month')::date;
  s1 timestamptz;
  s2 timestamptz;
  ifeoma uuid := '00000000-0000-4000-a000-000000000002';
  tolu uuid := '00000000-0000-4000-a000-000000000003';
  chioma uuid := '00000000-0000-4000-a000-000000000005';
  musa uuid := '00000000-0000-4000-a000-000000000006';
  ra uuid := '00000000-0000-4000-a000-000000000131';
  rb uuid := '00000000-0000-4000-a000-000000000132';
  chinedu uuid := '00000000-0000-4000-b000-000000000005';
  amaka uuid := '00000000-0000-4000-b000-000000000001';
  v_run uuid;
  v_ch bigint;
  c1 public.earning_cycles;
  e record;
begin
  s1 := public._cycle_start(m1);
  s2 := public._cycle_start(m2);

  -- ─── Bank accounts ─────────────────────────────────────────────────────────
  insert into public.author_bank_accounts (id, author_id, bank_code, bank_name, account_last4, account_number_enc,
    bank_account_name, legal_name, match_score, status, verified_at, payouts_resume_at, created_at)
  values
    ('00000000-0000-4000-e131-000000000001', ifeoma, '058', 'GTBank', '4471',
     '\x0c6f4c617c4b0126a4ef365cd09e99a5222f8f532d07efd3f22711c2e21089f4edfd1b5e5705',
     'NWACHUKWU IFEOMA C.', 'Ifeoma Chinwe Nwachukwu', 97, 'verified', s1 - interval '200 days',
     s1 - interval '198 days', s1 - interval '200 days'),
    ('00000000-0000-4000-e131-000000000002', chioma, '044', 'Access Bank', '2096',
     '\xcba7f457a8688b3eba05a7dcc9e39ff7901f8d82214f99524f5b0ebe946af29bc08c8f67d3ae',
     'OKAFOR CHIOMA GRACE', 'Chioma Grace Okafor', 100, 'verified', s1 - interval '150 days',
     s1 - interval '148 days', s1 - interval '150 days'),
    ('00000000-0000-4000-e131-000000000003', tolu, '058', 'GTBank', '1187',
     '\xa0907f9c39ce14d5be9a37b18b9dbd202dcfbf8b87d1527a125065ba8e23c3b7776357e222ae',
     'ADEBAYO TOYIN MARY', 'Tolulope Samson Adebayo', 61, 'replaced', s1 - interval '90 days',
     s1 - interval '88 days', s1 - interval '90 days'),
    ('00000000-0000-4000-e131-000000000004', tolu, '044', 'Access Bank', '9023',
     '\x560af3bfaaa8f3199863e5d4b392ce00122aad3a7ce0f539ff63fb774862494aa3adb9d57271',
     'ADEBAYO TOLULOPE S.', 'Tolulope Samson Adebayo', 82, 'needs_review', null,
     now() - interval '10 days' + interval '48 hours', now() - interval '10 days');

  -- ─── Spends (credits first: flow 09's bucket guard) ───────────────────────
  insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, ref_type, idempotency_key, created_at)
  values
    (ra, 6000, 'plan_grant', 'plan', now() + interval '60 days', 'subscription', 'seed13:grant:a', s1 - interval '2 days'),
    (rb, 6000, 'plan_grant', 'plan', now() + interval '60 days', 'subscription', 'seed13:grant:b', s1 - interval '2 days');
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                    ref_type, idempotency_key, created_at) values
    -- Two months ago
    (ra, -1600, 'unlock_all', 'plan', '00000000-0000-4000-c000-000000000001', ifeoma, 256000, 'book', 'seed13:m1:1', s1 + interval '3 days'),
    (rb, -580, 'chapter', 'plan', '00000000-0000-4000-c000-000000000001', ifeoma, 92800, 'book', 'seed13:m1:2', s1 + interval '9 days'),
    (ra, -40, 'tip', 'plan', '00000000-0000-4000-c000-000000000001', ifeoma, 6400, 'book', 'seed13:m1:3', s1 + interval '12 days'),
    (rb, -900, 'unlock_all', 'plan', '00000000-0000-4000-c000-000000000004', chioma, 144000, 'book', 'seed13:m1:4', s1 + interval '15 days'),
    (ra, -300, 'chapter', 'plan', '00000000-0000-4000-c000-000000000002', tolu, 48000, 'book', 'seed13:m1:5', s1 + interval '20 days'),
    -- Last month
    (ra, -1900, 'unlock_all', 'plan', '00000000-0000-4000-c000-000000000001', ifeoma, 304000, 'book', 'seed13:m2:1', s2 + interval '2 days'),
    (rb, -420, 'chapter', 'plan', '00000000-0000-4000-c000-000000000001', ifeoma, 67200, 'book', 'seed13:m2:2', s2 + interval '6 days'),
    (rb, -60, 'tip', 'plan', '00000000-0000-4000-c000-000000000001', ifeoma, 9600, 'book', 'seed13:m2:3', s2 + interval '8 days'),
    (ra, -1250, 'unlock_all', 'plan', '00000000-0000-4000-c000-000000000004', chioma, 200000, 'book', 'seed13:m2:4', s2 + interval '10 days'),
    (rb, -1200, 'unlock_all', 'plan', '00000000-0000-4000-c000-000000000002', tolu, 192000, 'book', 'seed13:m2:5', s2 + interval '14 days'),
    (ra, -700, 'unlock_all', 'plan', '00000000-0000-4000-c000-000000000005', musa, 112000, 'book', 'seed13:m2:6', s2 + interval '18 days');
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                    ref_type, idempotency_key, created_at)
  values (rb, -20, 'chapter', 'plan', '00000000-0000-4000-c000-000000000004', chioma, 3200, 'book', 'seed13:m2:7',
          s2 + interval '21 days')
  returning id into v_ch;
  -- The last chapter was undone within 10 minutes (shows under "what was not paid").
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                    ref_ledger_id, idempotency_key, created_at)
  values (rb, 20, 'undo', 'plan', '00000000-0000-4000-c000-000000000004', chioma, -3200, v_ch, 'seed13:m2:undo',
          s2 + interval '21 days 4 minutes');

  -- ─── Two months ago: closed, prepared, released and paid; Chioma's transfer failed ─
  insert into public.earning_cycles (id, month, closed_at)
  values ('00000000-0000-4000-e130-000000000001', m1, public._cycle_end(m1) + interval '5 minutes');
  perform public._close_cycle(m1);
  select * into c1 from public.earning_cycles where month = m1;
  update public.earning_cycles set status = 'prepared', prepared_by = chinedu, prepared_at = c1.payout_date - interval '4 days',
    checks = jsonb_build_object('ledger_match', true, 'diff_kobo', 0, 'hold_ended', true)
  where id = c1.id;
  insert into public.payout_runs (cycle_id, started_by, approved_by, status, created_at)
  values (c1.id, chinedu, amaka, 'sending', c1.payout_date + interval '8 hours') returning id into v_run;
  for e in select ae.*, b.id as account_id from public.author_earnings ae
           join public.author_bank_accounts b on b.author_id = ae.author_id and b.status = 'verified'
           where ae.cycle_id = c1.id and ae.status = 'payable' loop
    insert into public.payouts (id, run_id, author_earning_id, author_id, bank_account_id, amount_kobo, attempt, reference,
      flutterwave_transfer_id, status, failure_reason, queued_at, sent_at, settled_at)
    values (case when e.author_id = chioma then '00000000-0000-4000-e132-000000000001'::uuid else gen_random_uuid() end,
      v_run, e.id, e.author_id, e.account_id, e.payable_kobo, 1, public._payout_reference(m1, e.author_id, 1),
      'seed-' || left(e.author_id::text, 4) || right(e.author_id::text, 4),
      case when e.author_id = chioma then 'failed' else 'successful' end::public.payout_status,
      case when e.author_id = chioma then 'Account name doesn''t match' end,
      c1.payout_date + interval '8 hours', c1.payout_date + interval '8 hours', c1.payout_date + interval '9 hours');
    update public.author_earnings set status = case when e.author_id = chioma then 'partly_failed' else 'paid' end::public.author_earning_status,
      held_reason = case when e.author_id = chioma then 'Account name doesn''t match' end
    where id = e.id;
  end loop;
  update public.payout_runs set status = 'done_with_failures',
    authors = (select count(*) from public.payouts where run_id = v_run),
    total_kobo = (select coalesce(sum(amount_kobo), 0) from public.payouts where run_id = v_run)
  where id = v_run;
  update public.earning_cycles set status = 'paid_with_failures', approved_by = amaka,
    approved_at = c1.payout_date + interval '8 hours'
  where id = c1.id;

  -- ─── Last month: closed on the 1st, on its hold (Tolu's carry comes in) ───
  insert into public.earning_cycles (id, month, closed_at)
  values ('00000000-0000-4000-e130-000000000002', m2, public._cycle_end(m2) + interval '5 minutes');
  perform public._close_cycle(m2);
end $$;
