-- Flow 04 · unlock_chapter, undo_chapter_unlock, sync_reading_progress, annotations, passage
-- discussion and RLS on the reading tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ─── Fixtures ───────────────────────────────────────────────────────────────
-- 1 reader (plan, 100 credits), 2 reader (3 credits), 3 author, 4 reader (Auto-unlock off, 100),
-- 5 reader (old charge, 100), 6 reader (pays the rest, 100).
insert into auth.users (id, email)
select ('40400000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow04.test' from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author)
select ('40400000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 3 from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
update public.profiles set reader_settings = '{"auto_unlock": false}' where id = '40400000-0000-4000-a000-000000000004';

-- 10,000 words, price 20. Chapter 0 free (price 0); chapter 1 holds the 10% cut (para c1p0);
-- chapters 2 and 3 are locked.
insert into public.books (id, author_id, title, genres, status) values
  ('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-a000-000000000003', 'Reader Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord, preview_cut_para_id, preview_cut_chapter_uid)
values ('40400000-0000-4000-d000-000000000001', '40400000-0000-4000-c000-000000000001', 1, 'live', 10000, 40, 20,
  10, 0, 'c1p0', '40400000-0000-4000-e000-000000000001');
update public.books set current_revision_id = '40400000-0000-4000-d000-000000000001'
where id = '40400000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, words_before, pages, price_credits) values
  ('40400000-0000-4000-d000-000000000001', '40400000-0000-4000-e000-000000000000', 0, 'One',    500,    0,  2, 0),
  ('40400000-0000-4000-d000-000000000001', '40400000-0000-4000-e000-000000000001', 1, 'Two',   3000,  500, 12, 6),
  ('40400000-0000-4000-d000-000000000001', '40400000-0000-4000-e000-000000000002', 2, 'Three', 3000, 3500, 12, 6),
  ('40400000-0000-4000-d000-000000000001', '40400000-0000-4000-e000-000000000003', 3, 'Four',  3500, 6500, 14, 8);
insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint, words, words_before)
select '40400000-0000-4000-d000-000000000001', v.p, ('40400000-0000-4000-e000-00000000000' || v.c)::uuid, v.o,
  v.p, v.w, v.wb
from (values ('c0p0', 0, 0, 250, 0), ('c0p1', 0, 1, 250, 250),
             ('c1p0', 1, 2, 1000, 500), ('c1p1', 1, 3, 1000, 1500), ('c1p2', 1, 4, 1000, 2500),
             ('c2p0', 2, 5, 200, 3500), ('c2p1', 2, 6, 800, 3700), ('c2p2', 2, 7, 2000, 4500),
             ('c3p0', 3, 8, 3500, 6500)) v(p, c, o, w, wb);
insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, generation)
values ('40400000-0000-4000-d000-000000000001', null, '\x00', 1);

insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('40400000-0000-4000-a000-000000000001', 100, 'plan_grant', 'plan', 't4:g1'),
  ('40400000-0000-4000-a000-000000000002', 3, 'top_up', 'topup', 't4:g2'),
  ('40400000-0000-4000-a000-000000000004', 100, 'top_up', 'topup', 't4:g4'),
  ('40400000-0000-4000-a000-000000000005', 100, 'top_up', 'topup', 't4:g5'),
  ('40400000-0000-4000-a000-000000000006', 100, 'top_up', 'topup', 't4:g6');

-- Reader 5 paid for chapter Three 20 minutes ago.
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, idempotency_key, book_id, chapter_uid,
  author_id, author_earning_kobo, created_at)
values ('40400000-0000-4000-a000-000000000005', -6, 'chapter', 'topup', gen_random_uuid(), 'u:old-charge',
  '40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000002',
  '40400000-0000-4000-a000-000000000003', 960, now() - interval '20 minutes');
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source, ledger_id)
select user_id, book_id, 'chapter', chapter_uid, 'chapter', id from public.credit_ledger where idempotency_key = 'u:old-charge';

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
create function pg_temp.ledger_rows(uid text) returns integer
language sql security definer as $$ select count(*)::int from public.credit_ledger where user_id = uid::uuid $$;
grant execute on function pg_temp.ledger_rows(text) to authenticated;

set local role authenticated;

-- ─── Reader state and access map ────────────────────────────────────────────
select pg_temp.as_user('40400000-0000-4000-a000-000000000001');
select results_eq($$select x ->> 'access' from jsonb_array_elements(
                      public.get_reader_state('40400000-0000-4000-c000-000000000001') -> 'chapters') x
                    order by (x ->> 'ord')::int$$,
  $$values ('open'), ('partial'), ('locked'), ('locked')$$, 'access map: open, partial at the cut, locked');
select is((public.get_reader_state('40400000-0000-4000-c000-000000000001') ->> 'balance')::int, 100,
  'reader state carries the balance');

-- ─── unlock_chapter ─────────────────────────────────────────────────────────
select throws_ok($$select public.unlock_chapter('40400000-0000-4000-c000-000000000001',
  '40400000-0000-4000-e000-000000000000', 'tap', 'k-free-000001')$$, 'P0001', 'not_chargeable',
  'free chapters are never charged');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000002',
  'auto', 'k-chap3-000001') ->> 'spent', '6', 'auto-unlock charges the chapter price');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000002',
  'auto', 'k-chap3-000001') ->> 'replayed', 'true', 'replay by key returns the first result');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000002',
  'tap', 'k-chap3-000002') ->> 'status', 'already_unlocked', 'second key for an unlocked chapter: already_unlocked');
select is(public.credit_balance('40400000-0000-4000-a000-000000000001'), 94, 'charged exactly once');
select is((select count(*)::int from public.credit_ledger where user_id = '40400000-0000-4000-a000-000000000001'
           and reason = 'chapter'), 1, 'one ledger row for three calls');
select is((select author_earning_kobo from public.credit_ledger where user_id = '40400000-0000-4000-a000-000000000001'
           and reason = 'chapter'), 960, 'author earns ₦1.60 a credit');
select is((select snapshot_price from public.paygo_accounts where user_id = '40400000-0000-4000-a000-000000000001'),
  20, 'first chapter charge stores the snapshot price');
select ok(exists (select 1 from public.entitlements where user_id = '40400000-0000-4000-a000-000000000001'
                  and chapter_uid = '40400000-0000-4000-e000-000000000002' and revoked_at is null),
  'chapter entitlement created');
select is((select x ->> 'access' from jsonb_array_elements(
             public.get_reader_state('40400000-0000-4000-c000-000000000001') -> 'chapters') x
           where (x ->> 'ord')::int = 2), 'unlocked', 'access map shows it unlocked');
select results_eq($$select jsonb_array_elements_text(
                      public.entitled_chapters('40400000-0000-4000-c000-000000000001') -> 'chapter_uids')::uuid$$,
  $$values ('40400000-0000-4000-e000-000000000000'::uuid), ('40400000-0000-4000-e000-000000000002'::uuid)$$,
  'entitled_chapters: free and paid chapters only');

-- Price capped: the book is now 15 (override); 6 paid; Two (6) then Four (8 → capped at 3).
reset role;
update public.books set price_override_credits = 15, price_override_reason = 'test'
where id = '40400000-0000-4000-c000-000000000001';
update public.paygo_accounts set snapshot_price = 20 where user_id = '40400000-0000-4000-a000-000000000001';
set local role authenticated;
select pg_temp.as_user('40400000-0000-4000-a000-000000000001');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000001',
  'tap', 'k-chap2-000001') ->> 'spent', '6', 'chapter Two charged in full');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000003',
  'tap', 'k-chap4-000001') ->> 'spent', '3', 'last chapter charged only what is left of the cap');
select ok(exists (select 1 from public.entitlements where user_id = '40400000-0000-4000-a000-000000000001'
                  and scope = 'book' and source = 'chapter_complete' and revoked_at is null),
  'paying the whole cap creates the book entitlement');
select is(public.credit_balance('40400000-0000-4000-a000-000000000001'), 85, 'total paid never exceeds the price');
reset role;
update public.books set price_override_credits = null, price_override_reason = null
where id = '40400000-0000-4000-c000-000000000001';
set local role authenticated;

-- Auto-unlock off; not enough credits; the author.
select pg_temp.as_user('40400000-0000-4000-a000-000000000004');
select throws_ok($$select public.unlock_chapter('40400000-0000-4000-c000-000000000001',
  '40400000-0000-4000-e000-000000000002', 'auto', 'k-auto-off-01')$$, 'P0001', 'auto_off',
  'auto source refused when Auto-unlock is off');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000002',
  'tap', 'k-tap-on-0001') ->> 'status', 'ok', 'a tap still unlocks with Auto-unlock off');
select pg_temp.as_user('40400000-0000-4000-a000-000000000002');
select throws_ok($$select public.unlock_chapter('40400000-0000-4000-c000-000000000001',
  '40400000-0000-4000-e000-000000000002', 'tap', 'k-poor-000001')$$, 'P0001', 'insufficient_credits',
  'not enough credits is refused');
select is(pg_temp.ledger_rows('40400000-0000-4000-a000-000000000002'), 1, 'insufficient credits leaves no rows');
select is((select count(*)::int from public.entitlements where user_id = '40400000-0000-4000-a000-000000000002'), 0,
  'and no entitlement');
select pg_temp.as_user('40400000-0000-4000-a000-000000000003');
select throws_ok($$select public.unlock_chapter('40400000-0000-4000-c000-000000000001',
  '40400000-0000-4000-e000-000000000002', 'tap', 'k-author-0001')$$, 'P0001', 'own_book',
  'authors never pay for their own book');

-- ─── undo_chapter_unlock ────────────────────────────────────────────────────
select pg_temp.as_user('40400000-0000-4000-a000-000000000004');
select is(public.undo_chapter_unlock((select id from public.credit_ledger
    where user_id = '40400000-0000-4000-a000-000000000004' and reason = 'chapter'), 'k-undo-00001') ->> 'refunded',
  '6', 'undo inside 10 minutes refunds the charge');
select is(public.credit_balance('40400000-0000-4000-a000-000000000004'), 100, 'balance restored');
select is((select sum(author_earning_kobo)::int from public.credit_ledger
           where user_id = '40400000-0000-4000-a000-000000000004' and reason in ('chapter', 'undo')), 0,
  'author earning reversed');
select ok(not exists (select 1 from public.entitlements where user_id = '40400000-0000-4000-a000-000000000004'
                      and scope = 'chapter' and revoked_at is null), 'chapter entitlement revoked');
select is(public.undo_chapter_unlock((select id from public.credit_ledger
    where user_id = '40400000-0000-4000-a000-000000000004' and reason = 'chapter'), 'k-undo-00001') ->> 'replayed',
  'true', 'undo replay by key returns the first result');
select throws_ok($$select public.undo_chapter_unlock((select id from public.credit_ledger
    where user_id = '40400000-0000-4000-a000-000000000004' and reason = 'chapter'), 'k-undo-00002')$$,
  'P0001', 'already_undone', 'a charge is undone once only');
select is((select count(*)::int from public.credit_ledger where user_id = '40400000-0000-4000-a000-000000000004'
           and reason = 'undo'), 1, 'one undo row');

select pg_temp.as_user('40400000-0000-4000-a000-000000000005');
select throws_ok($$select public.undo_chapter_unlock((select id from public.credit_ledger
    where idempotency_key = 'u:old-charge'), 'k-undo-old-01')$$, 'P0001', 'undo_expired',
  'undo refused after 10 minutes');

-- 20% rule: reader 4 unlocks again and reads 1,000 words into the 3,000-word chapter.
select pg_temp.as_user('40400000-0000-4000-a000-000000000004');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000002',
  'tap', 'k-tap-again-01') ->> 'status', 'ok', 'unlocks again after an undo');
select is(public.sync_reading_progress('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-d000-000000000001',
  'epubcfi(/6/8!/4/6)', '40400000-0000-4000-e000-000000000002', 'c2p2', 0, 45, null, 'Phone', now()) ->> 'applied',
  'true', 'position inside an unlocked chapter is saved');
select throws_ok($$select public.undo_chapter_unlock((select max(id) from public.credit_ledger
    where user_id = '40400000-0000-4000-a000-000000000004' and reason = 'chapter'), 'k-undo-read-01')$$,
  'P0001', 'already_read', 'undo refused after reading over 20% of the chapter');

-- Blocked after the book is unlocked (Pay the rest).
select pg_temp.as_user('40400000-0000-4000-a000-000000000006');
select is(public.unlock_chapter('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-e000-000000000001',
  'tap', 'k-six-chap-01') ->> 'spent', '6', 'reader 6 pays one chapter');
select is(public.unlock_book('40400000-0000-4000-c000-000000000001', 20, 'k-six-rest-01') ->> 'spent', '14',
  'Pay the rest charges what is left');
select throws_ok($$select public.undo_chapter_unlock((select id from public.credit_ledger
    where user_id = '40400000-0000-4000-a000-000000000006' and reason = 'chapter'), 'k-six-undo-01')$$,
  'P0001', 'book_unlocked', 'undo refused once the whole book is unlocked');

-- ─── sync_reading_progress ──────────────────────────────────────────────────
select pg_temp.as_user('40400000-0000-4000-a000-000000000002');
select throws_ok($$select public.sync_reading_progress('40400000-0000-4000-c000-000000000001',
  '40400000-0000-4000-d000-000000000001', 'x', '40400000-0000-4000-e000-000000000001', 'c1p1', 0, 15, null, null, now())$$,
  'P0001', 'beyond_gate', 'position past the preview cut is refused');
select throws_ok($$select public.sync_reading_progress('40400000-0000-4000-c000-000000000001',
  '40400000-0000-4000-d000-000000000001', 'x', '40400000-0000-4000-e000-000000000002', 'c2p2', 0, 45, null, null, now())$$,
  'P0001', 'beyond_gate', 'position past a locked chapter''s peek is refused');
select is(public.sync_reading_progress('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-d000-000000000001',
  'x', '40400000-0000-4000-e000-000000000002', 'c2p1', 0, 37, null, null, now()) ->> 'percent', '37.00',
  'the peek of a locked chapter is a valid position');
select is(public.sync_reading_progress('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-d000-000000000001',
  'x', '40400000-0000-4000-e000-000000000000', 'c0p1', 0, 3, null, null, now()) ->> 'max_percent', '37.00',
  'max_percent never decreases');
select is(public.sync_reading_progress('40400000-0000-4000-c000-000000000001', '40400000-0000-4000-d000-000000000001',
  'x', '40400000-0000-4000-e000-000000000000', 'c0p0', 0, 0, null, null, now() - interval '1 hour') ->> 'applied',
  'false', 'an older write is ignored');
select is((select percent from public.reading_progress where user_id = '40400000-0000-4000-a000-000000000002'),
  3.00::numeric, 'the newer position stays');

-- ─── annotations ────────────────────────────────────────────────────────────
select pg_temp.as_user('40400000-0000-4000-a000-000000000002');
select is(jsonb_array_length(public.upsert_annotations(jsonb_build_array(jsonb_build_object(
  'client_id', '40400000-0000-4000-f000-000000000001', 'book_id', '40400000-0000-4000-c000-000000000001',
  'revision_id', '40400000-0000-4000-d000-000000000001', 'kind', 'highlight', 'color', 'green',
  'cfi_range', 'epubcfi(/6/4!/4/2,/1:0,/1:20)', 'chapter_uid', '40400000-0000-4000-e000-000000000000',
  'start_para_id', 'c0p0', 'end_para_id', 'c0p0', 'quote', 'A widow in Enugu', 'updated_at', now())))), 1,
  'highlight saved');
select throws_ok($$select public.upsert_annotations(jsonb_build_array(jsonb_build_object(
  'client_id', '40400000-0000-4000-f000-000000000002', 'book_id', '40400000-0000-4000-c000-000000000001',
  'revision_id', '40400000-0000-4000-d000-000000000001', 'kind', 'highlight', 'color', 'green',
  'cfi_range', 'x', 'chapter_uid', '40400000-0000-4000-e000-000000000002', 'start_para_id', 'c2p2',
  'end_para_id', 'c2p2', 'updated_at', now())))$$, 'P0001', 'beyond_gate', 'no highlights in locked text');
select is(public.upsert_annotations(jsonb_build_array(jsonb_build_object(
  'client_id', '40400000-0000-4000-f000-000000000001', 'book_id', '40400000-0000-4000-c000-000000000001',
  'revision_id', '40400000-0000-4000-d000-000000000001', 'kind', 'highlight', 'color', 'pink',
  'cfi_range', 'epubcfi(/6/4!/4/2,/1:0,/1:20)', 'chapter_uid', '40400000-0000-4000-e000-000000000000',
  'end_para_id', 'c0p0', 'updated_at', now() - interval '1 day'))) -> 0 ->> 'color', 'green',
  'an older edit loses (last write wins)');
select is(jsonb_array_length(public.pull_annotations('40400000-0000-4000-c000-000000000001') -> 'items'), 1,
  'pull returns own annotations');
select pg_temp.as_user('40400000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.annotations), 0, 'RLS: annotations are private');
select is((select count(*)::int from public.reading_progress where user_id <> '40400000-0000-4000-a000-000000000001'),
  0, 'RLS: reading_progress is private');

-- ─── passage discussion (position rule) ─────────────────────────────────────
select pg_temp.as_user('40400000-0000-4000-a000-000000000004');
select is(public.post_passage_comment('40400000-0000-4000-c000-000000000001', 'c2p0', 'Big moment here') ->> 'body',
  'Big moment here', 'a reader who reached the passage can post');
select pg_temp.as_user('40400000-0000-4000-a000-000000000002');
select is((public.get_passage_thread('40400000-0000-4000-c000-000000000001', 'c2p0') ->> 'count')::int, 1,
  'a reader at the passage sees the thread');
select pg_temp.as_user('40400000-0000-4000-a000-000000000006');
select throws_ok($$select public.get_passage_thread('40400000-0000-4000-c000-000000000001', 'c2p0')$$,
  'P0001', 'not_reached', 'a reader who has not reached it cannot open the thread');
select is((select count(*)::int from public.passage_comments), 0, 'RLS: comments beyond your position are hidden');
select throws_ok($$select public.post_passage_comment('40400000-0000-4000-c000-000000000001', 'c2p0', 'Spoiler!')$$,
  'P0001', 'not_reached', 'and cannot post there');

-- ─── chapter_keys: no client access ─────────────────────────────────────────
select throws_ok($$select count(*) from public.chapter_keys$$, '42501', null, 'readers cannot read chapter_keys');

select * from finish();
rollback;
