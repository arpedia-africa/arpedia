-- Flow 00 · audit log, staff helpers, and RLS on profiles, books and entitlements.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('20000000-0000-4000-a000-000000000001', 'reader@test.local'),
  ('20000000-0000-4000-a000-000000000002', 'author@test.local'),
  ('20000000-0000-4000-a000-000000000003', 'pub@test.local'),
  ('20000000-0000-4000-a000-000000000004', 'analyst@test.local');
insert into public.profiles (id, full_name, is_author) values
  ('20000000-0000-4000-a000-000000000001', 'Reader', false),
  ('20000000-0000-4000-a000-000000000002', 'Author', true),
  ('20000000-0000-4000-a000-000000000003', 'Pub', false),
  ('20000000-0000-4000-a000-000000000004', 'Ana', false);
insert into public.staff_roles (user_id, role) values
  ('20000000-0000-4000-a000-000000000003', 'publisher'),
  ('20000000-0000-4000-a000-000000000004', 'analyst');
insert into public.books (id, author_id, title, status) values
  ('20000000-0000-4000-c000-000000000001', '20000000-0000-4000-a000-000000000002', 'Live book', 'live'),
  ('20000000-0000-4000-c000-000000000002', '20000000-0000-4000-a000-000000000002', 'Draft book', 'draft');

set local role authenticated;

-- ─── Reader ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select ok(not public.is_staff(), 'reader is not staff');
select is((select count(*)::int from public.profiles), 1, 'reader sees only own profile');
select is((select count(*)::int from public.books where id in
  ('20000000-0000-4000-c000-000000000001', '20000000-0000-4000-c000-000000000002')), 1, 'reader sees live books only');
select throws_ok($$update public.profiles set is_author = true where id = '20000000-0000-4000-a000-000000000001'$$,
  '42501', null, 'reader cannot set role flags');
select lives_ok($$update public.profiles set full_name = 'Reader R' where id = '20000000-0000-4000-a000-000000000001'$$,
  'reader edits own name');
select throws_ok($$select public.write_audit('books', 'test')$$, '42501', null, 'non-staff cannot write audit');
select throws_ok($$insert into public.entitlements (user_id, book_id, scope, source)
  values ('20000000-0000-4000-a000-000000000001', '20000000-0000-4000-c000-000000000001', 'book', 'staff')$$,
  '42501', null, 'reader cannot grant themselves a book');

-- ─── Author sees own draft ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.books where author_id = '20000000-0000-4000-a000-000000000002'), 2,
  'author sees own drafts');

-- ─── Publisher ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select ok(public.is_staff('publisher') and not public.is_staff('finance'), 'publisher role check');
select ok(public.write_audit('books', 'book.test', 'book', '20000000-0000-4000-c000-000000000001') > 0,
  'staff writes audit');
select is((select count(*)::int from public.audit_log), 0, 'publisher cannot read the audit log');

-- ─── Analyst reads the log; nobody edits it ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select is((select actor_name from public.audit_log where action = 'book.test'), 'Pub', 'audit records the actor');
reset role;
select throws_ok($$update public.audit_log set summary = 'x'$$, '42501', null, 'audit rejects UPDATE (owner)');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'audit rejects DELETE (owner)');

select * from finish();
rollback;
