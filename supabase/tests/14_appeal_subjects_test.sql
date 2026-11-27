-- Flow 14 · spec check 14-22 (rules 26, 28): a rejected applicant can appeal; overturning an
-- application or book rejection puts it back in review; the publisher who rejected a book cannot
-- decide its appeal.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_staff(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- 1 applicant, 2 author, 3 reviewer (support), 4 publisher, 5 moderator, 6 old applicant.
insert into auth.users (id, email)
select ('14a00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t14a.local' from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author)
select ('14a00000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 2 from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('14a00000-0000-4000-a000-000000000003', 'support'),
  ('14a00000-0000-4000-a000-000000000004', 'publisher'),
  ('14a00000-0000-4000-a000-000000000005', 'moderator');

insert into public.author_applications (id, user_id, status, legal_name, decided_by, decided_at, decision_reason,
  reapply_after) values
  ('14a00000-0000-4000-b000-000000000001', '14a00000-0000-4000-a000-000000000001', 'rejected', 'Ada Applicant',
   '14a00000-0000-4000-a000-000000000003', now() - interval '2 days', 'Sample too short', current_date + 28),
  ('14a00000-0000-4000-b000-000000000006', '14a00000-0000-4000-a000-000000000006', 'rejected', 'Old Applicant',
   '14a00000-0000-4000-a000-000000000003', now() - interval '20 days', 'Sample too short', current_date + 10);

insert into public.books (id, author_id, title, genres, status) values
  ('14a00000-0000-4000-c000-000000000001', '14a00000-0000-4000-a000-000000000002', 'Rejected Book', '{Fiction}', 'rejected'),
  ('14a00000-0000-4000-c000-000000000002', '14a00000-0000-4000-a000-000000000002', 'Busy Book', '{Fiction}', 'rejected');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord) values
  ('14a00000-0000-4000-d000-000000000001', '14a00000-0000-4000-c000-000000000001', 1, 'rejected', 5000, 20, 10, 10, 0),
  ('14a00000-0000-4000-d000-000000000002', '14a00000-0000-4000-c000-000000000002', 1, 'rejected', 5000, 20, 10, 10, 0),
  ('14a00000-0000-4000-d000-000000000003', '14a00000-0000-4000-c000-000000000002', 2, 'needs_fixes', 5000, 20, 10, 10, 0);
insert into public.audit_log (actor_id, area, action, object_type, object_id) values
  ('14a00000-0000-4000-a000-000000000004', 'books', 'book.reject', 'book_revision', '14a00000-0000-4000-d000-000000000001'),
  ('14a00000-0000-4000-a000-000000000004', 'books', 'book.reject', 'book_revision', '14a00000-0000-4000-d000-000000000002');

-- ─── Rejected applicant appeals ─────────────────────────────────────────────
select pg_temp.as_user('14a00000-0000-4000-a000-000000000001');
select set_config('t.app', public.create_appeal('application', '14a00000-0000-4000-b000-000000000001',
  'My sample was the first chapter only.')::text, true);
select isnt(current_setting('t.app'), '', 'a rejected applicant can appeal');
select throws_ok($$ select public.create_appeal('application', '14a00000-0000-4000-b000-000000000001', 'Again') $$,
  '23505', 'already_appealed', 'one open appeal per application');
select throws_ok($$ select public.create_appeal('application', '14a00000-0000-4000-b000-000000000006', 'Not mine') $$,
  'P0002', 'not_found', 'nobody appeals someone else''s application');
select pg_temp.as_user('14a00000-0000-4000-a000-000000000006');
select throws_ok($$ select public.create_appeal('application', '14a00000-0000-4000-b000-000000000006', 'Late') $$,
  '22023', 'appeal_window_closed', 'an application rejected over 14 days ago cannot be appealed');

select pg_temp.as_owner();
select is((select original_decider from public.appeals where id = current_setting('t.app')::uuid),
  '14a00000-0000-4000-a000-000000000003'::uuid, 'the application reviewer is the original decider');

select pg_temp.as_staff('14a00000-0000-4000-a000-000000000005');
select is((select original_decision from public.admin_list_appeals('open') where id = current_setting('t.app')::uuid),
  'application rejected', 'the queue names the original decision');
select lives_ok($$ select public.decide_appeal(current_setting('t.app')::uuid, 'overturned', null, 'We will look again.') $$,
  'a moderator overturns the application rejection');

select pg_temp.as_owner();
select is((select status::text || '/' || coalesce(reapply_after::text, '-') from public.author_applications
           where id = '14a00000-0000-4000-b000-000000000001'),
  'new/-', 'overturn reopens the application for review');
select is((select note from public.author_application_events
           where application_id = '14a00000-0000-4000-b000-000000000001' order by id desc limit 1),
  'Reopened on appeal', 'the application history says why it reopened');

-- ─── Book rejection ─────────────────────────────────────────────────────────
select pg_temp.as_user('14a00000-0000-4000-a000-000000000002');
select set_config('t.book', public.create_appeal('book_rejection', '14a00000-0000-4000-d000-000000000001',
  'This is my own work.')::text, true);
select set_config('t.busy', public.create_appeal('book_rejection', '14a00000-0000-4000-d000-000000000002',
  'Please look again.')::text, true);

select pg_temp.as_staff('14a00000-0000-4000-a000-000000000004');
select throws_ok($$ select public.decide_appeal(current_setting('t.book')::uuid, 'overturned') $$,
  '42501', 'original_decider', 'the publisher who rejected the book cannot decide its appeal');

select pg_temp.as_staff('14a00000-0000-4000-a000-000000000005');
select lives_ok($$ select public.decide_appeal(current_setting('t.book')::uuid, 'overturned', null, 'Back in review.') $$,
  'another staff member overturns the book rejection');
select throws_ok($$ select public.decide_appeal(current_setting('t.busy')::uuid, 'overturned') $$,
  '23505', 'book_has_open_revision', 'overturn refuses when the author already has a newer revision open');

select pg_temp.as_owner();
select is((select status::text from public.book_revisions where id = '14a00000-0000-4000-d000-000000000001'),
  'ready_for_review', 'overturn puts the revision back in the review queue');
select is((select status::text from public.books where id = '14a00000-0000-4000-c000-000000000001'),
  'draft', 'the book is no longer rejected, so the author can upload again');

select * from finish();
rollback;
