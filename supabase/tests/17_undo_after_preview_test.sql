-- Flow 17 · Undo in the chapter that holds the free preview cut (found by the pay-as-you-read journey):
-- the words read for free before the cut don't count toward the 20% "already read" limit.
-- Uses the seeded A House Called Grace (cut at c1p5 in chapter 1, 4,063 words).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('17100000-0000-4000-a000-000000000001', 'payg17@test.local');

create temp table g as
select b.id as book_id, r.id as rev, c.chapter_uid as ch, c.words as words
from public.books b
join public.book_revisions r on r.id = b.current_revision_id
join public.chapters c on c.revision_id = r.id and c.chapter_uid = r.preview_cut_chapter_uid
where b.id = '00000000-0000-4000-c000-000000000003';
select is((select count(*)::int from g), 1, 'Grace has its preview cut inside a chapter');

-- A charge for that chapter, as unlock_chapter writes it.
insert into public.credit_ledger (user_id, delta, reason, bucket) values
  ('17100000-0000-4000-a000-000000000001', 50, 'top_up', 'topup');
create temp table charge as
with ins as (
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, chapter_uid)
  select '17100000-0000-4000-a000-000000000001', -9, 'chapter', 'topup', book_id, ch from g
  returning id)
select id from ins;

-- Reader is 873 words into the chapter, 145 of them past the free cut (under 20% of 4,063).
insert into public.reading_progress (user_id, book_id, revision_id, chapter_uid, para_id, percent, max_percent,
                                     chapter_ord, max_chapter_ord, last_opened_at, updated_at)
select '17100000-0000-4000-a000-000000000001', book_id, rev, ch, 'c1p6', 10.3, 10.3, 1, 1, now(), now() from g;
select is(
  (public._undo_chapter('17100000-0000-4000-a000-000000000001', (select id from charge), 'undo-key-17-a', false)
     ->> 'status'),
  'undone', 'undo works when only the free part and a little more was read');

-- Charged again, then read 870 words past the cut (over 20%): refused.
create temp table charge2 as
with ins as (
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, chapter_uid)
  select '17100000-0000-4000-a000-000000000001', -9, 'chapter', 'topup', book_id, ch from g
  returning id)
select id from ins;
update public.reading_progress set para_id = 'c1p11'
where user_id = '17100000-0000-4000-a000-000000000001';
select throws_ok(
  $$ select public._undo_chapter('17100000-0000-4000-a000-000000000001', (select id from charge2),
                                 'undo-key-17-b', false) $$,
  null, 'already_read', 'undo is refused after reading over 20% past the free part');

select is((select sum(delta)::int from public.credit_ledger where user_id = '17100000-0000-4000-a000-000000000001'),
  50 - 9, 'the first charge came back, the second stands');

select * from finish();
rollback;
