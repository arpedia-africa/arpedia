-- Flow 12 · spec check 12-8 (reject from Quick review), 12-9 (good standing reads upheld reports and
-- claims in the last 90 days), 12-13 (republish clears Remove access).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1 author, 2 publisher, 3 reporter.
insert into auth.users (id, email)
select ('12f00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t12f.local' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('12f00000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 1 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values ('12f00000-0000-4000-a000-000000000002', 'publisher');

insert into public.books (id, author_id, title, genres, status) values
  ('12f00000-0000-4000-c000-000000000001', '12f00000-0000-4000-a000-000000000001', 'Standing Book', '{Fiction}', 'live'),
  ('12f00000-0000-4000-c000-000000000002', '12f00000-0000-4000-a000-000000000001', 'Gone Book', '{Fiction}', 'unpublished'),
  ('12f00000-0000-4000-c000-000000000003', '12f00000-0000-4000-a000-000000000001', 'Rejected Book', '{Fiction}', 'draft');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord) values
  ('12f00000-0000-4000-d000-000000000002', '12f00000-0000-4000-c000-000000000002', 1, 'unpublished', 5000, 20, 10, 10, 0),
  ('12f00000-0000-4000-d000-000000000003', '12f00000-0000-4000-c000-000000000003', 1, 'ready_for_review', 5000, 20, 10, 10, 0);
update public.books set current_revision_id = '12f00000-0000-4000-d000-000000000002',
  unpublished_at = now(), access_removed_at = now()
where id = '12f00000-0000-4000-c000-000000000002';

create function pg_temp.standing() returns boolean language sql as $$
  select public.author_in_good_standing('12f00000-0000-4000-a000-000000000001')
$$;

-- ─── 12-9: good standing ────────────────────────────────────────────────────
select ok(pg_temp.standing(), 'no reports or claims: in good standing');

insert into public.reports (id, reporter_id, content_type, content_id, reported_user_id, reason, severity, status,
  outcome, due_at, resolved_at) values
  ('12f00000-0000-4000-b000-000000000001', '12f00000-0000-4000-a000-000000000003', 'message', gen_random_uuid(),
   '12f00000-0000-4000-a000-000000000001', 'spam', 'low', 'resolved', 'dismissed', now(), now() - interval '5 days');
select ok(pg_temp.standing(), 'a dismissed report does not count');

update public.reports set outcome = 'actioned' where id = '12f00000-0000-4000-b000-000000000001';
select ok(not pg_temp.standing(), 'an upheld report in the last 90 days: not in good standing');

insert into public.moderation_actions (report_id, target_user_id, action, reason, undone_at)
values ('12f00000-0000-4000-b000-000000000001', '12f00000-0000-4000-a000-000000000001', 'warn', 'Spam', now());
select ok(pg_temp.standing(), 'a report whose action was undone on appeal does not count');

insert into public.moderation_actions (report_id, target_user_id, action, reason)
values ('12f00000-0000-4000-b000-000000000001', '12f00000-0000-4000-a000-000000000001', 'remove', 'Spam');
select ok(not pg_temp.standing(), 'one undone action does not clear a report whose other action stands');

delete from public.moderation_actions where report_id = '12f00000-0000-4000-b000-000000000001';
update public.reports set resolved_at = now() - interval '91 days' where id = '12f00000-0000-4000-b000-000000000001';
select ok(pg_temp.standing(), 'an upheld report older than 90 days does not count');

insert into public.copyright_claims (book_id, claimant_name, status, decided_at) values
  ('12f00000-0000-4000-c000-000000000001', 'Rotimi Press', 'rejected', now() - interval '3 days');
select ok(pg_temp.standing(), 'a rejected copyright claim does not count');

update public.copyright_claims set status = 'upheld' where book_id = '12f00000-0000-4000-c000-000000000001';
select ok(not pg_temp.standing(), 'an upheld copyright claim in the last 90 days: not in good standing');

update public.copyright_claims set decided_at = now() - interval '120 days'
where book_id = '12f00000-0000-4000-c000-000000000001';
select ok(pg_temp.standing(), 'an upheld claim older than 90 days does not count');

-- ─── 12-8: Reject from Quick review (the admin calls reject_revision as the publisher) ───
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  json_build_object('sub', '12f00000-0000-4000-a000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.reject_revision('12f00000-0000-4000-d000-000000000003', 'Not theirs to publish') $$,
  'a publisher can reject a book waiting for review');

-- ─── 12-13: republish clears Remove access ──────────────────────────────────
select public.republish_book('12f00000-0000-4000-c000-000000000002');
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select is((select status::text from public.book_revisions where id = '12f00000-0000-4000-d000-000000000003'),
  'rejected', 'the rejected revision is terminal');
select is((select access_removed_at from public.books where id = '12f00000-0000-4000-c000-000000000002'),
  null, 'republish clears access_removed_at');

select * from finish();
rollback;
