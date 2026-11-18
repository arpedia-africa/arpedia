-- Flow 03 · spend_credits, unlock_book, gift_book, tip_author, reviews (95% rule), RLS on money
-- rows, and admin_set_book_price.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- ─── Fixtures ───────────────────────────────────────────────────────────────
-- 1 reader (plan, 200 credits), 2 reader (no plan, 10), 3 author, 4 finance, 5 reader (paygo),
-- 6 recipient, 7 publisher, 8 multi-bucket reader (plan 50 + top-up 100).
insert into auth.users (id, email)
select ('30300000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow03.test' from generate_series(1, 8) n;
insert into public.profiles (id, full_name, is_author)
select ('30300000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 3 from generate_series(1, 8) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('30300000-0000-4000-a000-000000000004', 'finance'),
  ('30300000-0000-4000-a000-000000000007', 'publisher');

insert into public.books (id, author_id, title, genres, status) values
  ('30300000-0000-4000-c000-000000000001', '30300000-0000-4000-a000-000000000003', 'Test Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord)
values ('30300000-0000-4000-d000-000000000001', '30300000-0000-4000-c000-000000000001', 1, 'live', 50000, 200, 100,
  10, 0);
update public.books set current_revision_id = '30300000-0000-4000-d000-000000000001'
where id = '30300000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, pages, price_credits) values
  ('30300000-0000-4000-d000-000000000001', '30300000-0000-4000-e000-000000000000', 0, 'One', 5000, 20, 0),
  ('30300000-0000-4000-d000-000000000001', '30300000-0000-4000-e000-000000000001', 1, 'Two', 15000, 60, 33),
  ('30300000-0000-4000-d000-000000000001', '30300000-0000-4000-e000-000000000002', 2, 'Three', 15000, 60, 33),
  ('30300000-0000-4000-d000-000000000001', '30300000-0000-4000-e000-000000000003', 3, 'Four', 15000, 60, 34);

insert into public.subscriptions (user_id, plan_code, status, period_end) values
  ('30300000-0000-4000-a000-000000000001', 'quarterly', 'active', now() + interval '30 days'),
  ('30300000-0000-4000-a000-000000000008', 'monthly', 'active', now() + interval '30 days');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('30300000-0000-4000-a000-000000000001', 200, 'plan_grant', 'plan', 't3:g1'),
  ('30300000-0000-4000-a000-000000000002', 10, 'top_up', 'topup', 't3:g2'),
  ('30300000-0000-4000-a000-000000000005', 200, 'plan_grant', 'plan', 't3:g5'),
  ('30300000-0000-4000-a000-000000000008', 100, 'top_up', 'topup', 't3:g8a'),
  ('30300000-0000-4000-a000-000000000008', 50, 'plan_grant', 'plan', 't3:g8b');

-- Reader 5 paid for chapter Two (33) as pay-as-you-read, at a snapshot price of 90.
select public.spend_credits('30300000-0000-4000-a000-000000000005', 33, 'chapter',
  '30300000-0000-4000-c000-000000000001', '30300000-0000-4000-e000-000000000001',
  '30300000-0000-4000-a000-000000000003', 'chapter-two-key');
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source)
values ('30300000-0000-4000-a000-000000000005', '30300000-0000-4000-c000-000000000001', 'chapter',
        '30300000-0000-4000-e000-000000000001', 'chapter');
insert into public.paygo_accounts (user_id, book_id, snapshot_price)
values ('30300000-0000-4000-a000-000000000005', '30300000-0000-4000-c000-000000000001', 90);

-- Reader 1 finished the book (may review); reader 2 is at 50%.
insert into public.reading_progress (user_id, book_id, percent, max_percent) values
  ('30300000-0000-4000-a000-000000000001', '30300000-0000-4000-c000-000000000001', 96, 96),
  ('30300000-0000-4000-a000-000000000002', '30300000-0000-4000-c000-000000000001', 50, 50);
insert into public.follows (follower_id, followee_id) values
  ('30300000-0000-4000-a000-000000000006', '30300000-0000-4000-a000-000000000001');

create function pg_temp.as_user(uid text, age interval default '1 minute') returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - age)::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text, interval) to authenticated;

-- ─── spend_credits (run as postgres) ────────────────────────────────────────
select is((public.spend_credits('30300000-0000-4000-a000-000000000008', 100, 'tip',
  '30300000-0000-4000-c000-000000000001', null, '30300000-0000-4000-a000-000000000003', 'multi-bucket') ->> 'balance')::int,
  50, 'spend leaves the right balance');
select results_eq($$select bucket::text, delta from public.credit_ledger
                    where idempotency_key like 'u:30300000-0000-4000-a000-000000000008:multi-bucket%' order by id$$,
  $$values ('plan', -50), ('topup', -50)$$, 'spends plan credits before top-up, one row per bucket');
select is((select count(distinct txn_id)::int from public.credit_ledger
           where idempotency_key like 'u:30300000-0000-4000-a000-000000000008:multi-bucket%'), 1,
  'bucket rows share one txn_id');
select is((public.spend_credits('30300000-0000-4000-a000-000000000008', 100, 'tip',
  '30300000-0000-4000-c000-000000000001', null, '30300000-0000-4000-a000-000000000003', 'multi-bucket') ->> 'replayed')::boolean,
  true, 'replay by key returns the same spend');
select is(public.credit_balance('30300000-0000-4000-a000-000000000008'), 50, 'replay spends nothing');
select throws_ok($$select public.spend_credits('30300000-0000-4000-a000-000000000008', 51, 'tip', null, null, null,
  'too-much-key')$$, 'P0001', 'insufficient_credits', 'no spend below zero');
select is((select min(balance_after) from public.credit_ledger where user_id = '30300000-0000-4000-a000-000000000008'
           and balance_after is not null), 50, 'balance_after never negative');
select ok(exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()
                  and objid = (hashtext('30300000-0000-4000-a000-000000000008')::bigint & 4294967295)::oid),
  'spends serialise on a per-reader advisory lock');
select is((select sum(author_earning_kobo)::int from public.credit_ledger
           where idempotency_key like 'u:30300000-0000-4000-a000-000000000008:multi-bucket%'), 16000,
  'author earns ₦1.60 a credit');

set local role authenticated;

-- ─── Reader 1: unlock ───────────────────────────────────────────────────────
select pg_temp.as_user('30300000-0000-4000-a000-000000000001');
select throws_ok($$select public.spend_credits('30300000-0000-4000-a000-000000000001', 1, 'tip', null, null, null,
  'direct-call-key')$$, '42501', null, 'readers cannot call spend_credits');
select throws_ok($$select public.unlock_book('30300000-0000-4000-c000-000000000001', 99, 'unlock-key-0001')$$,
  'P0001', 'price_changed', 'stale price is refused');
select is(public.credit_balance('30300000-0000-4000-a000-000000000001'), 200, 'price_changed spends nothing');
select is(public.unlock_book('30300000-0000-4000-c000-000000000001', 100, 'unlock-key-0001') ->> 'spent', '100',
  'unlock spends the price');
select is(public.credit_balance('30300000-0000-4000-a000-000000000001'), 100, 'balance drops by the price');
select is((select count(*)::int from public.entitlements where user_id = '30300000-0000-4000-a000-000000000001'
           and scope = 'book' and source = 'unlock_all' and ledger_id is not null), 1,
  'book entitlement written with its ledger row');
select is(public.unlock_book('30300000-0000-4000-c000-000000000001', 100, 'unlock-key-0001') ->> 'spent', '100',
  'retry with the same key returns the original result');
select is(public.credit_balance('30300000-0000-4000-a000-000000000001'), 100, 'retry charges nothing');
select is(public.unlock_book('30300000-0000-4000-c000-000000000001', 100, 'unlock-key-0002') ->> 'status',
  'already_unlocked', 'a second unlock returns already_unlocked');
select is(public.credit_balance('30300000-0000-4000-a000-000000000001'), 100, 'already_unlocked spends 0');

-- ─── RLS: money rows ────────────────────────────────────────────────────────
select throws_ok($$insert into public.credit_ledger (user_id, delta, reason, bucket)
  values ('30300000-0000-4000-a000-000000000001', 1000, 'promo', 'promo')$$, '42501', null,
  'readers cannot insert ledger rows');
select throws_ok($$update public.credit_ledger set delta = 1 where user_id = '30300000-0000-4000-a000-000000000001'$$,
  '42501', null, 'readers cannot update ledger rows');
select throws_ok($$delete from public.credit_ledger where user_id = '30300000-0000-4000-a000-000000000001'$$,
  '42501', null, 'readers cannot delete ledger rows');
select throws_ok($$insert into public.entitlements (user_id, book_id, scope, source)
  values ('30300000-0000-4000-a000-000000000002', '30300000-0000-4000-c000-000000000001', 'book', 'staff')$$,
  '42501', null, 'readers cannot insert entitlements');
select throws_ok($$update public.entitlements set revoked_at = now()$$, '42501', null,
  'readers cannot update entitlements');
select is((select count(distinct user_id)::int from public.credit_ledger), 1, 'readers see only their own ledger');

-- ─── Reader 2: not enough credits, no plan ──────────────────────────────────
select pg_temp.as_user('30300000-0000-4000-a000-000000000002');
select throws_ok($$select public.unlock_book('30300000-0000-4000-c000-000000000001', 100, 'unlock-key-poor1')$$,
  'P0001', 'insufficient_credits', 'not enough credits is refused');
select is(public.credit_balance('30300000-0000-4000-a000-000000000002'), 10, 'nothing spent');
select is(public.get_book_page('30300000-0000-4000-c000-000000000001') -> 'plan' ->> 'state', 'none',
  'book page says no plan');

-- ─── Reader 5: pay the rest after a chapter, capped at the snapshot price ───
select pg_temp.as_user('30300000-0000-4000-a000-000000000005');
select is((public.get_book_page('30300000-0000-4000-c000-000000000001') ->> 'remaining')::int, 57,
  'remaining = least(snapshot 90, price 100) − paid 33');
select is(public.unlock_book('30300000-0000-4000-c000-000000000001', 100, 'unlock-key-rest1') ->> 'spent', '57',
  'pay the rest spends only what is left');
select is(public.credit_balance('30300000-0000-4000-a000-000000000005'), 110, 'total paid never exceeds the cap');

-- ─── Gift (reader 1 → reader 6) ─────────────────────────────────────────────
select pg_temp.as_user('30300000-0000-4000-a000-000000000001');
select throws_ok($$select public.gift_book('30300000-0000-4000-c000-000000000001', '30300000-0000-4000-a000-000000000001',
  null, 100, 'gift-key-self')$$, 'P0001', 'bad_recipient', 'cannot gift yourself');
select throws_ok($$select public.gift_book('30300000-0000-4000-c000-000000000001', '30300000-0000-4000-a000-000000000005',
  null, 100, 'gift-key-owner')$$, 'P0001', 'already_has_it', 'cannot gift someone who has it');
select is((public.get_gift_people('30300000-0000-4000-c000-000000000001') -> 0 ->> 'id'),
  '30300000-0000-4000-a000-000000000006', 'followers are gift people');
select is(public.gift_book('30300000-0000-4000-c000-000000000001', '30300000-0000-4000-a000-000000000006',
  'Read the third letter', 100, 'gift-key-0001') ->> 'spent', '100', 'gift spends the full price');
select is(public.credit_balance('30300000-0000-4000-a000-000000000001'), 0, 'sender pays');
select pg_temp.as_user('30300000-0000-4000-a000-000000000006');
select is((select source::text from public.entitlements where user_id = '30300000-0000-4000-a000-000000000006'), 'gift',
  'recipient owns the book');
select is((select message from public.gifts where recipient_id = '30300000-0000-4000-a000-000000000006'),
  'Read the third letter', 'recipient reads the gift row');

-- ─── Tip (reader 5) ─────────────────────────────────────────────────────────
select pg_temp.as_user('30300000-0000-4000-a000-000000000005');
select throws_ok($$select public.tip_author('30300000-0000-4000-c000-000000000001', 30, null, 'tip-key-0030')$$,
  'P0001', 'bad_amount', 'tips are presets only');
select is(public.tip_author('30300000-0000-4000-c000-000000000001', 50, 'Thank you', 'tip-key-0050') ->> 'spent', '50',
  'tip of 50 credits');
select pg_temp.as_user('30300000-0000-4000-a000-000000000003');
select is((select credits from public.tips where author_id = '30300000-0000-4000-a000-000000000003'), 50,
  'author sees the tip');
select throws_ok($$select public.tip_author('30300000-0000-4000-c000-000000000001', 20, null, 'tip-key-own1')$$,
  'P0001', 'own_book', 'authors cannot tip themselves');

-- ─── Reviews: 95% rule ──────────────────────────────────────────────────────
select pg_temp.as_user('30300000-0000-4000-a000-000000000002');
select throws_ok($$select public.post_review('30300000-0000-4000-c000-000000000001', 5, 'Great', false)$$,
  'P0001', 'not_finished', 'non-finishers cannot post');
select throws_ok($$insert into public.reviews (book_id, user_id, stars)
  values ('30300000-0000-4000-c000-000000000001', '30300000-0000-4000-a000-000000000002', 5)$$,
  '42501', null, 'RLS blocks direct reviews from non-finishers');
select pg_temp.as_user('30300000-0000-4000-a000-000000000001');
select is(public.post_review('30300000-0000-4000-c000-000000000001', 5, 'Loved it', false) ->> 'stars', '5',
  'finishers post a review');
select is((select count from public.book_rating_stats where book_id = '30300000-0000-4000-c000-000000000001'), 1,
  'stats count the review');
select lives_ok($$select public.post_review('30300000-0000-4000-c000-000000000001', 3, 'Second thoughts', true)$$,
  'reposting edits the review');
select is((select avg from public.book_rating_stats where book_id = '30300000-0000-4000-c000-000000000001'), 3.00::numeric,
  'stats follow the edit in the same transaction');
select is((public.get_book_page('30300000-0000-4000-c000-000000000001') -> 'rating' ->> 'avg')::numeric,
  (public.get_reviews('30300000-0000-4000-c000-000000000001') -> 'rating' ->> 'avg')::numeric,
  'one rating on the book page and reviews');
select throws_ok($$update public.reviews set status = 'visible'$$, '42501', null,
  'readers cannot set moderation status');

-- ─── Admin price override ───────────────────────────────────────────────────
select throws_ok($$select public.admin_set_book_price('30300000-0000-4000-c000-000000000001', 120, 'x', '[]')$$,
  '42501', null, 'readers cannot override prices');
select pg_temp.as_user('30300000-0000-4000-a000-000000000007');
select throws_ok($$select public.admin_set_book_price('30300000-0000-4000-c000-000000000001', 120, 'x', '[]')$$,
  '42501', null, 'publishers cannot override prices');
select pg_temp.as_user('30300000-0000-4000-a000-000000000004', '30 minutes');
select throws_ok($$select public.admin_set_book_price('30300000-0000-4000-c000-000000000001', 120, 'x', '[]')$$,
  '42501', null, 'price changes need a fresh two-step code');
select pg_temp.as_user('30300000-0000-4000-a000-000000000004');
select throws_ok($$select public.admin_set_book_price('30300000-0000-4000-c000-000000000001', 120, 'Launch offer',
  '[{"chapter_uid":"30300000-0000-4000-e000-000000000000","price_credits":0},
    {"chapter_uid":"30300000-0000-4000-e000-000000000001","price_credits":40},
    {"chapter_uid":"30300000-0000-4000-e000-000000000002","price_credits":40},
    {"chapter_uid":"30300000-0000-4000-e000-000000000003","price_credits":39}]')$$,
  'P0001', 'bad_chapter_prices', 'chapter prices must sum to the new price');
select is(public.admin_set_book_price('30300000-0000-4000-c000-000000000001', 120, 'Launch offer',
  '[{"chapter_uid":"30300000-0000-4000-e000-000000000000","price_credits":0},
    {"chapter_uid":"30300000-0000-4000-e000-000000000001","price_credits":40},
    {"chapter_uid":"30300000-0000-4000-e000-000000000002","price_credits":40},
    {"chapter_uid":"30300000-0000-4000-e000-000000000003","price_credits":40}]') ->> 'new', '120',
  'finance overrides the price');
select is((select new_credits from public.book_price_history where book_id = '30300000-0000-4000-c000-000000000001'
           and kind = 'override'), 120, 'price history row written');

select * from finish();
rollback;
