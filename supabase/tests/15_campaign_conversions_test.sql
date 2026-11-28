-- Flow 15 · 15-17: campaign conversions (rule 20): an unlock, join, return to reading or follow
-- within 24 hours of the push counts; two pushes inside 24 hours count for the later one only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Readers 1, 2, 3, 4, 6; author 5.
insert into auth.users (id, email)
select ('15170000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1517.test' from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author)
select ('15170000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 5 from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, status) values
  ('15170000-0000-4000-b000-000000000001', '15170000-0000-4000-a000-000000000005', 'Push Book', 'live');
insert into public.groups (id, kind, name) values
  ('15170000-0000-4000-c000-000000000001', 'club', 'Push Club');

-- Campaign A went out 40 hours ago, B 10 hours ago.
insert into public.campaigns (id, title, body, status, sent_at) values
  ('15170000-0000-4000-d000-00000000000a', 'A', 'a', 'sent', now() - interval '40 hours'),
  ('15170000-0000-4000-d000-00000000000b', 'B', 'b', 'sent', now() - interval '10 hours'),
  ('15170000-0000-4000-d000-00000000000c', 'Old', 'c', 'sent', now() - interval '5 days');
insert into public.push_log (user_id, type, category, campaign_id, status, sent_at, delivered_at) values
  -- 1: A, follows an hour later (converts).
  ('15170000-0000-4000-a000-000000000001', 'campaign', 'marketing', '15170000-0000-4000-d000-00000000000a',
   'delivered', now() - interval '40 hours', now() - interval '40 hours'),
  -- 3: A, follows 30 hours later (too late).
  ('15170000-0000-4000-a000-000000000003', 'campaign', 'marketing', '15170000-0000-4000-d000-00000000000a',
   'delivered', now() - interval '40 hours', now() - interval '40 hours'),
  -- 4: A (no receipt, sent time), joins the club an hour later (converts).
  ('15170000-0000-4000-a000-000000000004', 'campaign', 'marketing', '15170000-0000-4000-d000-00000000000a',
   'sent', now() - interval '20 hours', null),
  -- 2: A 20 hours ago, then B 10 hours ago; reads 8 hours ago (counts for B only).
  ('15170000-0000-4000-a000-000000000002', 'campaign', 'marketing', '15170000-0000-4000-d000-00000000000a',
   'opened', now() - interval '20 hours', now() - interval '20 hours'),
  ('15170000-0000-4000-a000-000000000002', 'campaign', 'marketing', '15170000-0000-4000-d000-00000000000b',
   'delivered', now() - interval '10 hours', now() - interval '10 hours'),
  -- 6: B, unlocks a chapter 2 hours later (converts).
  ('15170000-0000-4000-a000-000000000006', 'campaign', 'marketing', '15170000-0000-4000-d000-00000000000b',
   'delivered', now() - interval '10 hours', now() - interval '10 hours');

insert into public.follows (follower_id, followee_id, created_at) values
  ('15170000-0000-4000-a000-000000000001', '15170000-0000-4000-a000-000000000005', now() - interval '39 hours'),
  ('15170000-0000-4000-a000-000000000003', '15170000-0000-4000-a000-000000000005', now() - interval '10 hours');
insert into public.group_members (group_id, user_id, joined_at) values
  ('15170000-0000-4000-c000-000000000001', '15170000-0000-4000-a000-000000000004', now() - interval '19 hours');
insert into public.reading_sessions (client_id, user_id, book_id, started_at, ended_at, active_seconds) values
  (gen_random_uuid(), '15170000-0000-4000-a000-000000000002', '15170000-0000-4000-b000-000000000001',
   now() - interval '8 hours', now() - interval '7 hours', 600);
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('15170000-0000-4000-a000-000000000006', 100, 'top_up', 'topup', 't1517:g', now() - interval '12 hours');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at) values
  ('15170000-0000-4000-a000-000000000006', -6, 'chapter', 'topup', '15170000-0000-4000-b000-000000000001',
   '15170000-0000-4000-a000-000000000005', 960, 't1517:c', now() - interval '8 hours');

select is(public._campaign_conversions('15170000-0000-4000-d000-00000000000a'), 2,
  'A: the follow and the join inside 24 hours; not the late follow, not the reader B took over');
select is(public._campaign_conversions('15170000-0000-4000-d000-00000000000b'), 2,
  'B: the return to reading and the unlock');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.refresh_campaign_conversions() >= 2, 'campaigns of the last 2 days are refreshed');
reset role;
select is((select (counts ->> 'conversions')::int from public.campaigns
           where id = '15170000-0000-4000-d000-00000000000a'), 2, 'A''s Conversions column has 2');
select is((select (counts ->> 'conversions')::int from public.campaigns
           where id = '15170000-0000-4000-d000-00000000000c'), 0, 'older campaigns are left as they were');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"15170000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.refresh_campaign_conversions()$$, '42501', null, 'readers cannot run it');
reset role;

select * from finish();
rollback;
