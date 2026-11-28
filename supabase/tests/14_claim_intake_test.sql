-- Flow 14 · 14-21 (rules 29 and 30): a copyright claim by email finds its book by id, share link or
-- title; mail that names no book is left for the support inbox; the passage check is stored once
-- and leaves a line on the claim's timeline. Service role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email, raw_user_meta_data) values
  ('14210000-0000-4000-a000-000000000001', 'au@flow1421.test', '{"full_name":"Claimed Author"}');
insert into public.books (id, author_id, title, status) values
  ('c1421001-0000-4000-b000-000000000001', '14210000-0000-4000-a000-000000000001', 'The Lantern Keeper of Ibadan', 'live'),
  ('c1421002-0000-4000-b000-000000000002', '14210000-0000-4000-a000-000000000001', 'Lantern Keeper', 'live'),
  ('c1421003-0000-4000-b000-000000000003', '14210000-0000-4000-a000-000000000001', 'Quiet Draft Nobody Sees', 'draft'),
  ('c1421004-0000-4000-b000-000000000004', '14210000-0000-4000-a000-000000000001', 'Notice', 'live'),
  ('c1421005-0000-4000-b000-000000000005', '14210000-0000-4000-a000-000000000001', 'What Now? (A Novel)', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, work_version,
                                   sealed_work_version) values
  ('c1421001-0000-4000-c000-000000000001', 'c1421001-0000-4000-b000-000000000001', 1, 'live', 25000, 100, 50, 3, 2),
  ('c1421003-0000-4000-c000-000000000003', 'c1421003-0000-4000-b000-000000000003', 1, 'draft', 1000, 4, 2, 1, null);
update public.books set current_revision_id = 'c1421001-0000-4000-c000-000000000001'
where id = 'c1421001-0000-4000-b000-000000000001';

-- Readers and staff cannot call it.
select set_config('request.jwt.claims', '{"sub":"14210000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.ingest_claim_email('x@y.ng', 'X', 'Copyright', 'body', '<m0>')$$, '42501', null,
  'a signed-in user cannot open a claim this way');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1. The book id in the body (any status).
select is((public.ingest_claim_email('Legal@Paramount.ng', 'Barr. Yetunde Coker', 'Copyright notice',
  'Book c1421003-0000-4000-b000-000000000003 copies ours.', '<m1>', 'plagiarism',
  '[{"key":"claims/a/proof.pdf","name":"proof.pdf","kind":"PDF","size":"1 KB"}]') ->> 'book_id'),
  'c1421003-0000-4000-b000-000000000003', 'a book id in the body names the book');
select row_eq($$select claimant_name, claimant_contact, type::text, status::text, jsonb_array_length(evidence),
                     left(details, 4), claim_hold_at is null
              from public.copyright_claims c join public.books b on b.id = c.book_id
              where source_message_id = '<m1>'$$,
  row('Barr. Yetunde Coker', 'legal@paramount.ng', 'plagiarism', 'new', 1, 'Book', true),
  'the claim keeps the sender, type, evidence and text, and does not hold the book');
select ok((select due_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
           from public.copyright_claims where source_message_id = '<m1>'), 'decision due in 7 days');

-- 2. A share link.
select is((public.ingest_claim_email('a2@b.ng', '', 'Hi',
  'See https://arpedia.africa/book/the-lantern-keeper-of-ibadan-c1421001 please', '<m2>') ->> 'book_id'),
  'c1421001-0000-4000-b000-000000000001', 'a share link names the book');
select is((select claimant_name from public.copyright_claims where source_message_id = '<m2>'), 'a2@b.ng',
  'with no display name the claimant is the email address');

-- 3. A title in the subject: the longest matching title wins; drafts are never matched by title.
select is((public.ingest_claim_email('a3@b.ng', 'A', 'Copyright: THE LANTERN KEEPER OF IBADAN', 'x', '<m3>') ->> 'book_id'),
  'c1421001-0000-4000-b000-000000000001', 'the longest title in the subject wins');
select is((public.ingest_claim_email('a@b.ng', 'A', 'About Lantern Keeper', 'x', '<m4>') ->> 'book_id'),
  'c1421002-0000-4000-b000-000000000002', 'a shorter title alone names its book');
select is((public.ingest_claim_email('a@b.ng', 'A', 'Quiet Draft Nobody Sees', 'x', '<m5>') ->> 'routed'), 'ticket',
  'a draft is not found by its title');

select is((public.ingest_claim_email('a@b.ng', 'A', 'Copyright notice', 'x', '<m8>') ->> 'routed'), 'ticket',
  'a one-word title is never matched in the subject');
select is((public.ingest_claim_email('a@b.ng', 'A', 'Lantern Keepers of Lagos', 'x', '<m9>') ->> 'routed'), 'ticket',
  'titles match whole words only');
select is((public.ingest_claim_email('a4@b.ng', 'A', 'Claim: what now? (a novel)', 'x', '<m10>') ->> 'book_id'),
  'c1421005-0000-4000-b000-000000000005', 'a title with punctuation still matches');

-- 4. No book: left for the support inbox, nothing stored.
select is((public.ingest_claim_email('a@b.ng', 'A', 'Hello', 'Someone copied my poem', '<m6>')), '{"routed": "ticket"}'::jsonb,
  'mail that names no book goes to the support inbox');
select is((select count(*)::int from public.copyright_claims where source_message_id in ('<m5>', '<m6>')), 0,
  'and opens no claim');

-- 5. The same email twice opens one claim.
select is((public.ingest_claim_email('a@b.ng', 'A', 'About Lantern Keeper', 'x', '<m4>') ->> 'duplicate'), 'true',
  'a repeated delivery returns the first claim');
select is((select count(*)::int from public.copyright_claims where source_message_id = '<m4>'), 1, 'only one claim');

-- 6. A follow-up from the same address on the same open claim goes to the inbox.
select is((public.ingest_claim_email('A@B.ng', 'A', 'Re: About Lantern Keeper', 'more proof', '<m7>') ->> 'routed'),
  'ticket', 'a follow-up about an open claim goes to the support inbox');
select is((select count(*)::int from public.copyright_claims where book_id = 'c1421002-0000-4000-b000-000000000002'), 1,
  'and opens no second claim');

-- 7. The passage check: the live revision's sealed copy; once per claim; a timeline line.
select is((select work_version from public.claims_needing_similarity(20)
           where id = (select id from public.copyright_claims where source_message_id = '<m3>')), 2,
  'the check reads the live revision''s sealed working copy');
select is(public.set_claim_similarity((select id from public.copyright_claims where source_message_id = '<m3>'),
  '{"score": 74, "flagged": 6, "checked": 9, "passages": []}'), true, 'the result is stored');
select is(public.set_claim_similarity((select id from public.copyright_claims where source_message_id = '<m3>'),
  '{"score": 1, "flagged": 1, "checked": 1, "passages": []}'), false, 'and never overwritten');
select throws_ok($$select public.set_claim_similarity(gen_random_uuid(), null)$$, '22023', null, 'a missing result is refused');
-- A failed check is tried again later, and the timeline shows it once.
select is(public.set_claim_similarity((select id from public.copyright_claims where source_message_id = '<m2>'),
  '{"failed": true, "reason": "no_text"}'), true, 'a failed check is stored');
select is(public.set_claim_similarity((select id from public.copyright_claims where source_message_id = '<m2>'),
  '{"failed": true, "reason": "no_text"}') and (select (similarity ->> 'attempts')::int = 2 and similarity ? 'retry_at'
  from public.copyright_claims where source_message_id = '<m2>'), true, 'and retried, counting the attempts');
reset role;
select is((select count(*)::int from public.audit_log where object_type = 'claim' and action = 'claim.similarity'
           and object_id = (select id::text from public.copyright_claims where source_message_id = '<m2>')), 1,
  'the timeline shows a failure once');
select is((select summary from public.audit_log where object_type = 'claim' and action = 'claim.similarity'
           and object_id = (select id::text from public.copyright_claims where source_message_id = '<m3>')),
  'Similarity check run: 74% over 6 passages', 'the claim''s timeline shows the check');

select * from finish();
rollback;
