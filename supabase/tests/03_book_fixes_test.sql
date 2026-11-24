-- Flow 03 · spec check 03-9 (discussion counts and club), 03-13 (gift people from groups),
-- 03-14 (comments_count), 03-17 (revision price history), 03-18 (gift_book checks).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- 1 sender, 2 club mate, 3 author, 4 stranger, 5 follower who is also a club mate, 6 blocked club mate.
insert into auth.users (id, email)
select ('03f00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t03f.local' from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author)
select ('03f00000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 3 from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;

insert into public.books (id, author_id, title, genres, status) values
  ('03f00000-0000-4000-c000-000000000001', '03f00000-0000-4000-a000-000000000003', 'Gift Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord) values
  ('03f00000-0000-4000-d000-000000000001', '03f00000-0000-4000-c000-000000000001', 1, 'live', 50000, 200, 100, 10, 0),
  ('03f00000-0000-4000-d000-000000000002', '03f00000-0000-4000-c000-000000000001', 2, 'ready_for_review', 52000, 208, 104, 10, 0);
update public.books set current_revision_id = '03f00000-0000-4000-d000-000000000001'
where id = '03f00000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, pages, price_credits) values
  ('03f00000-0000-4000-d000-000000000001', '03f00000-0000-4000-e000-000000000000', 0, 'One', 25000, 100, 50),
  ('03f00000-0000-4000-d000-000000000001', '03f00000-0000-4000-e000-000000000001', 1, 'Two', 25000, 100, 50);
insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint) values
  ('03f00000-0000-4000-d000-000000000001', 'p1', '03f00000-0000-4000-e000-000000000000', 1, 'f1'),
  ('03f00000-0000-4000-d000-000000000001', 'p2', '03f00000-0000-4000-e000-000000000001', 2, 'f2');

insert into public.subscriptions (user_id, plan_code, status, period_end) values
  ('03f00000-0000-4000-a000-000000000001', 'quarterly', 'active', now() + interval '30 days');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('03f00000-0000-4000-a000-000000000001', 500, 'plan_grant', 'plan', 't3f:g1');

insert into public.groups (id, kind, name, visibility, book_id) values
  ('03f00000-0000-4000-b000-000000000001', 'club', 'Grace Readers', 'public', '03f00000-0000-4000-c000-000000000001'),
  ('03f00000-0000-4000-b000-000000000002', 'dm', 'Direct chat', 'private', null);
insert into public.group_members (group_id, user_id, role) values
  ('03f00000-0000-4000-b000-000000000001', '03f00000-0000-4000-a000-000000000001', 'owner'),
  ('03f00000-0000-4000-b000-000000000001', '03f00000-0000-4000-a000-000000000002', 'member'),
  ('03f00000-0000-4000-b000-000000000001', '03f00000-0000-4000-a000-000000000005', 'member'),
  ('03f00000-0000-4000-b000-000000000001', '03f00000-0000-4000-a000-000000000006', 'member'),
  ('03f00000-0000-4000-b000-000000000002', '03f00000-0000-4000-a000-000000000001', 'member'),
  ('03f00000-0000-4000-b000-000000000002', '03f00000-0000-4000-a000-000000000004', 'member');
insert into public.follows (follower_id, followee_id) values
  ('03f00000-0000-4000-a000-000000000005', '03f00000-0000-4000-a000-000000000001');
insert into public.blocks (blocker_id, blocked_id) values
  ('03f00000-0000-4000-a000-000000000006', '03f00000-0000-4000-a000-000000000001');

-- 03-14: visible passage comments drive books.comments_count (p1 in chapter One, p2 in Two).
insert into public.passage_comments (id, book_id, para_id, user_id, body) values
  ('03f00000-0000-4000-f000-000000000001', '03f00000-0000-4000-c000-000000000001', 'p1',
   '03f00000-0000-4000-a000-000000000002', 'Lovely start'),
  ('03f00000-0000-4000-f000-000000000002', '03f00000-0000-4000-c000-000000000001', 'p1',
   '03f00000-0000-4000-a000-000000000005', 'Agreed'),
  ('03f00000-0000-4000-f000-000000000003', '03f00000-0000-4000-c000-000000000001', 'p2',
   '03f00000-0000-4000-a000-000000000002', 'Later twist');
select is((select comments_count from public.books where id = '03f00000-0000-4000-c000-000000000001'), 3,
  'new passage comments count');
update public.passage_comments set status = 'removed' where id = '03f00000-0000-4000-f000-000000000003';
select is((select comments_count from public.books where id = '03f00000-0000-4000-c000-000000000001'), 2,
  'a removed comment stops counting');
delete from public.passage_comments where id = '03f00000-0000-4000-f000-000000000002';
select is((select comments_count from public.books where id = '03f00000-0000-4000-c000-000000000001'), 1,
  'a deleted comment stops counting');

-- 03-9: reader 1 is in chapter One, 30% in.
insert into public.reading_progress (user_id, book_id, percent, max_percent, chapter_ord) values
  ('03f00000-0000-4000-a000-000000000001', '03f00000-0000-4000-c000-000000000001', 30, 30, 0);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"03f00000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select is((public.get_book_discussion('03f00000-0000-4000-c000-000000000001') ->> 'chapter_comments')::int, 1,
  'passage talk counts visible comments on the current chapter');
select is(public.get_book_discussion('03f00000-0000-4000-c000-000000000001') #>> '{club,name}', 'Grace Readers',
  'the club reading the book');

-- 03-13: followers and group mates, one row each, blocked and DM-only people left out.
select is(jsonb_array_length(public.get_gift_people('03f00000-0000-4000-c000-000000000001')), 2,
  'club mate and follower; blocked and DM-only people never appear');
select ok(public.get_gift_people('03f00000-0000-4000-c000-000000000001')
  @> '[{"id": "03f00000-0000-4000-a000-000000000002", "why": "In Grace Readers"}]', 'a club mate says which group');
select ok(public.get_gift_people('03f00000-0000-4000-c000-000000000001')
  @> '[{"id": "03f00000-0000-4000-a000-000000000005", "why": "Follows you"}]', 'Follows you wins over a group');

-- 03-18: the server enforces the list and the Gifts switch.
select throws_ok($$select public.gift_book('03f00000-0000-4000-c000-000000000001', '03f00000-0000-4000-a000-000000000004',
  null, 100, 'g-stranger')$$, 'P0001', 'bad_recipient', 'cannot gift someone off the list');
select throws_ok($$select public.gift_book('03f00000-0000-4000-c000-000000000001', '03f00000-0000-4000-a000-000000000006',
  null, 100, 'g-blocked')$$, 'P0001', 'bad_recipient', 'cannot gift someone who blocked you');
reset role;
update public.feature_flags set enabled = false where key = 'gifts';
set local role authenticated;
select throws_ok($$select public.gift_book('03f00000-0000-4000-c000-000000000001', '03f00000-0000-4000-a000-000000000002',
  null, 100, 'gift-switched-off')$$, 'P0001', 'gifts_off', 'Gifts switched off stops gifting');
select is(public.credit_balance('03f00000-0000-4000-a000-000000000001'), 500, 'nothing was charged');
reset role;
update public.feature_flags set enabled = true where key = 'gifts';
set local role authenticated;
select is(public.gift_book('03f00000-0000-4000-c000-000000000001', '03f00000-0000-4000-a000-000000000002',
  null, 100, 'gift-club-mate') ->> 'status', 'sent', 'a club mate can be gifted');

-- 03-17: publishing a revision with a new price writes a revision row; same price writes none.
reset role;
update public.books set current_revision_id = '03f00000-0000-4000-d000-000000000002'
where id = '03f00000-0000-4000-c000-000000000001';
select is((select count(*)::int from public.book_price_history
           where book_id = '03f00000-0000-4000-c000-000000000001' and kind = 'revision'), 1, 'revision price change logged');
select is((select array[old_credits, new_credits] from public.book_price_history
           where book_id = '03f00000-0000-4000-c000-000000000001' and kind = 'revision'), array[100, 104],
  'with the old and new price');
select is((select revision_id from public.book_price_history
           where book_id = '03f00000-0000-4000-c000-000000000001' and kind = 'revision'),
  '03f00000-0000-4000-d000-000000000002'::uuid, 'and the new revision');
update public.book_revisions set price_credits = 104 where id = '03f00000-0000-4000-d000-000000000001';
update public.books set current_revision_id = '03f00000-0000-4000-d000-000000000001'
where id = '03f00000-0000-4000-c000-000000000001';
select is((select count(*)::int from public.book_price_history
           where book_id = '03f00000-0000-4000-c000-000000000001' and kind = 'revision'), 1,
  'same price writes no row');

select * from finish();
rollback;
