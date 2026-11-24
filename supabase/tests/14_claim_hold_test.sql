-- Flow 14 · spec check 14-9: a book held for a claim leaves Discover and freezes the author's
-- earnings line; clearing the hold brings both back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('14900000-0000-4000-a000-000000000001', 'au@t149.local', '{"full_name":"Held Author"}');
insert into public.author_profiles (user_id, pen_name, status) values
  ('14900000-0000-4000-a000-000000000001', 'Held Author', 'active');
insert into public.author_bank_accounts (author_id, bank_code, bank_name, account_last4, account_number_enc,
                                         bank_account_name, match_score, status, payouts_resume_at)
values ('14900000-0000-4000-a000-000000000001', '058', 'GTBank', '1234', 'enc', 'Held Author', 100, 'verified', now());
insert into public.books (id, author_id, title, status) values
  ('14900000-0000-4000-b000-000000000001', '14900000-0000-4000-a000-000000000001', 'Disputed Book', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits)
values ('14900000-0000-4000-c000-000000000001', '14900000-0000-4000-b000-000000000001', 1, 'live', 25000, 100, 50);
update public.books set current_revision_id = '14900000-0000-4000-c000-000000000001'
where id = '14900000-0000-4000-b000-000000000001';

select ok(exists (select 1 from public.catalog_books where id = '14900000-0000-4000-b000-000000000001'),
  'a live book is in Discover');
select is((select status::text from public._line_status('14900000-0000-4000-a000-000000000001', 500000, 100000)), 'payable',
  'and its author is payable');

update public.books set claim_hold_at = now() where id = '14900000-0000-4000-b000-000000000001';
select ok(not exists (select 1 from public.catalog_books where id = '14900000-0000-4000-b000-000000000001'),
  'a book held for a claim leaves Discover');
select is((select status::text || ' · ' || held_reason from public._line_status('14900000-0000-4000-a000-000000000001', 500000, 100000)),
  'held_dispute · Claim open on Disputed Book', 'the author''s earnings are held while the claim is open');

update public.books set claim_hold_at = null where id = '14900000-0000-4000-b000-000000000001';
select is((select status::text from public._line_status('14900000-0000-4000-a000-000000000001', 500000, 100000)), 'payable',
  'clearing the hold releases them');

select * from finish();
rollback;
