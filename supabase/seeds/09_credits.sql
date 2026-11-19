-- Flow 09 · demo money rows for the admin console (local only): store details on the seeded
-- subscriptions, purchases behind the seeded grants, one waiting refund, promo codes and one
-- returnable chapter charge. Fixed ids so parity pages can open them.

-- ─── Subscriptions ──────────────────────────────────────────────────────────
-- Ngozi pays on Google Play; Bola pays on the web (Flutterwave).
-- The period starts a minute before the seeded plan grant (seed files run seconds apart).
update public.subscriptions set id = '00000000-0000-4000-e920-000000000001', store = 'play',
  period_start = period_start - interval '1 minute',
  store_original_txn_id = 'GPA.3391-4820-1177-52046'
where user_id = '00000000-0000-4000-a000-000000000001';
update public.subscriptions set store = 'web', store_original_txn_id = 'fwplan:monthly:00000000-0000-4000-a000-000000000030'
where user_id = '00000000-0000-4000-a000-000000000030';

-- ─── Transactions ───────────────────────────────────────────────────────────
-- Play keeps 15%; Flutterwave 1.4%.
insert into public.transactions (id, user_id, kind, plan_code, topup_code, subscription_id, store, store_txn_id,
  gross_kobo, fee_kobo, status, period_start, credits_granted, created_at)
select v.id::uuid, v.user_id::uuid, v.kind, v.plan_code, v.topup_code, s.id, v.store, v.txn, v.gross, v.fee,
  v.status, case when v.kind = 'plan' then now() - v.age end, v.credits, now() - v.age
from (values
  ('00000000-0000-4000-e900-000000000001', '00000000-0000-4000-a000-000000000001', 'plan',  'quarterly', null,
   'play', 'GPA.3391-4820-1177-52046', 240000, 36000, 'succeeded', 800, interval '15 days'),
  ('00000000-0000-4000-e900-000000000002', '00000000-0000-4000-a000-000000000001', 'topup', null, 'topup_200',
   'play', 'GPA.3391-4820-1177-60311', 60000, 9000, 'succeeded', 200, interval '12 days'),
  ('00000000-0000-4000-e900-000000000003', '00000000-0000-4000-a000-000000000030', 'plan',  'monthly', null,
   'web', 'arp:plan:monthly:00000000-0000-4000-a000-000000000030:1', 80000, 1120, 'succeeded', 300, interval '9 days'),
  ('00000000-0000-4000-e900-000000000004', '00000000-0000-4000-a000-000000000030', 'topup', null, 'topup_500',
   'web', 'arp:topup:topup_500:00000000-0000-4000-a000-000000000030:1', 150000, 2100, 'failed', 0, interval '2 days')
) v(id, user_id, kind, plan_code, topup_code, store, txn, gross, fee, status, credits, age)
left join public.subscriptions s on s.user_id = v.user_id::uuid and v.kind = 'plan';

-- ─── Refunds ────────────────────────────────────────────────────────────────
-- Bola asks for the web monthly plan back after spending 260 of 300 credits: partial is recommended.
insert into public.refund_requests (id, transaction_id, user_id, reason, requested_at, credits_granted,
  credits_used, recommendation)
values
  ('00000000-0000-4000-e910-000000000001', '00000000-0000-4000-e900-000000000003',
   '00000000-0000-4000-a000-000000000030', 'I meant to pick the quarterly plan, not monthly.',
   now() - interval '1 day', 300, 260, 'partial');

-- ─── Promo codes ────────────────────────────────────────────────────────────
insert into public.promo_codes (code, kind, amount, max_uses, new_readers_only, starts_at, ends_at,
  campaign_tag, status, uses, created_by)
values
  ('harmattan', 'bonus_credits', 50, 1000, true, now() - interval '10 days', now() + interval '20 days',
   'harmattan-2026', 'active', 214, '00000000-0000-4000-b000-000000000001'),
  ('read20', 'plan_discount', 20, 500, false, now() - interval '60 days', now() - interval '30 days',
   'back-to-school', 'ended', 500, '00000000-0000-4000-b000-000000000001');

-- ─── A returnable chapter charge ────────────────────────────────────────────
-- Ngozi paid 10 top-up credits for Harmattan Letters, chapter 6, two hours ago (past the undo window).
with c as (
  select b.id as book_id, b.author_id, ch.id as chapter_id, ch.chapter_uid, ch.price_credits
  from public.books b join public.chapters ch on ch.revision_id = b.current_revision_id
  where b.title = 'Harmattan Letters' and ch.ord = 5
), spend as (
  insert into public.credit_ledger (id, user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
    chapter_id, chapter_uid, ref_type, ref_id, idempotency_key, created_at)
  overriding system value
  select 900001, '00000000-0000-4000-a000-000000000001', -c.price_credits, 'chapter', 'topup', c.book_id,
    c.author_id, c.price_credits * 160, c.chapter_id, c.chapter_uid, 'chapter', c.chapter_id::text,
    'seed:chapter:ngozi:harmattan:6', now() - interval '2 hours'
  from c
  returning id, book_id, chapter_uid
)
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source, ledger_id)
select '00000000-0000-4000-a000-000000000001', book_id, 'chapter', chapter_uid, 'chapter', id from spend;
