-- Flow 11 · author applications (RLS, send rules, decisions), author profiles, Studio earnings.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- The local seed (supabase/seeds/11_authors.sql) holds applications and author profiles; start empty.
-- Rolled back with the rest of the test.
truncate public.author_application_events, public.author_applications, public.author_profiles cascade;

-- Applicant, second applicant, publisher, moderator (not a reviewer), a reader.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('31000000-0000-4000-a000-000000000001', 'tola@test.local', now(), '{"full_name":"Tola Writer"}'),
  ('31000000-0000-4000-a000-000000000002', 'kemi@test.local', null, '{"full_name":"Kemi Pen"}'),
  ('31000000-0000-4000-a000-000000000003', 'pub@test.local', now(), '{"full_name":"Pat Publisher"}'),
  ('31000000-0000-4000-a000-000000000004', 'mod@test.local', now(), '{"full_name":"Mo Moderator"}'),
  ('31000000-0000-4000-a000-000000000005', 'reader@test.local', now(), '{"full_name":"Rita Reader"}');
insert into public.staff_roles (user_id, role) values
  ('31000000-0000-4000-a000-000000000003', 'publisher'),
  ('31000000-0000-4000-a000-000000000004', 'moderator');

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('31000000-0000-4000-a000-000000000001');

-- ─── Start and draft ────────────────────────────────────────────────────────
select is((public.start_application()).legal_name, 'Tola Writer', 'application prefilled with the account name');
select is((select email from public.author_applications), 'tola@test.local', 'and the account email');
select is((public.start_application()).id, (select id from public.author_applications),
  'starting again returns the same open application');
select is((public.save_application_draft('{"pen_name":"T. W.","bio":"I write","step":2,"unknown":"x"}')).pen_name,
  'T. W.', 'draft saves allowed fields');
select is((select step_reached from public.author_applications), 2, 'step reached is remembered');
select is((public.save_application_draft('{"step":1}')).step_reached, 2, 'step reached never goes back');
select throws_ok($$select public.save_application_draft('{"categories":["Horror"]}')$$, 'P0001', 'bad_category',
  'unknown category refused');
select throws_ok($$update public.author_applications set status = 'approved'$$, '42501', null,
  'applicant cannot write the table directly');
select throws_ok($$select public.set_application_sample(auth.uid(), 'applications/x/y.pdf', 'y.pdf', 3)$$, '42501', null,
  'only the Worker attaches a sample file');

-- ─── Send ───────────────────────────────────────────────────────────────────
select throws_like($$select public.submit_application(true)$$, 'incomplete', 'send blocked while fields are missing');
select lives_ok($$select public.save_application_draft('{"categories":["Poetry","Poetry","African stories"],
  "date_of_birth":"1995-01-01","state":"Lagos","sample_text":"Once upon a time"}')$$, 'complete the draft');
select is((select cardinality(categories) from public.author_applications), 2, 'categories de-duplicated');
select throws_like($$select public.submit_application(false)$$, 'incomplete', 'send blocked without the terms box');
select is((public.submit_application(true)).status, 'new'::public.application_status, 'application sent');
select is((select agreement_version from public.author_applications), 1, 'agreement version stored');
select throws_ok($$select checks from public.author_applications$$, '42501', null,
  'applicant cannot read the automatic checks');
select is((public.start_application()).checks, '{}'::jsonb, 'nor through the RPCs');
select throws_ok($$select public.admin_application_checks((select id from public.author_applications))$$,
  '42501', null, 'admin_application_checks is staff only');
select throws_ok($$select public.save_application_draft('{"bio":"changed"}')$$, 'P0001', 'application_sent',
  'cannot edit after sending');

-- ─── Other users ────────────────────────────────────────────────────────────
select pg_temp.as_user('31000000-0000-4000-a000-000000000005');
select is((select count(*)::int from public.author_applications), 0, 'a reader cannot see someone else''s application');
select pg_temp.as_user('31000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.author_applications), 0, 'a moderator cannot see applications');
select throws_ok($$select public.decide_application((select id from public.author_applications limit 1), 'approve')$$,
  '42501', null, 'a moderator cannot decide');

-- ─── Staff decisions ────────────────────────────────────────────────────────
select pg_temp.as_user('31000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.author_applications), 1, 'publisher sees the queue');
select ok((select (c ->> 'email_verified')::boolean and (c ->> 'age_ok')::boolean
           from public.admin_application_checks((select id from public.author_applications)) c),
  'automatic checks written on send, read by staff');
select is((public.assign_application((select id from public.author_applications))).assigned_to,
  '31000000-0000-4000-a000-000000000003'::uuid, 'assign to me');
select is((public.decide_application((select id from public.author_applications), 'ask_info',
  p_info_request => 'Please share a longer sample', p_info_step => 3)).status,
  'needs_info'::public.application_status, 'ask for info');

select pg_temp.as_user('31000000-0000-4000-a000-000000000001');
select is((public.save_application_draft('{"sample_text":"A much longer sample"}')).sample_text, 'A much longer sample',
  'applicant can edit while info is asked');
select is((public.submit_application(true)).status, 'new'::public.application_status, 'resent after info');
select is((select count(*)::int from public.author_application_events where kind = 'info_given'), 1,
  'resend logged as info given');

select pg_temp.as_user('31000000-0000-4000-a000-000000000003');
select is((public.decide_application((select id from public.author_applications), 'approve')).status,
  'approved'::public.application_status, 'approve');
select ok((select is_author from public.profiles where id = '31000000-0000-4000-a000-000000000001'),
  'approval sets is_author');
select is((select pen_name from public.author_profiles where user_id = '31000000-0000-4000-a000-000000000001'), 'T. W.',
  'approval creates the author profile with the pen name');
select throws_ok($$select public.decide_application((select id from public.author_applications), 'approve')$$,
  'P0001', 'not_open', 'cannot approve twice');
reset role;
select is((select count(*)::int from public.audit_log where action like 'application.%'), 3,
  'every decision is audited');
set local role authenticated;

-- ─── Author profile columns ─────────────────────────────────────────────────
select pg_temp.as_user('31000000-0000-4000-a000-000000000001');
select lives_ok($$update public.author_profiles set bio = 'New bio', location = 'Enugu'
  where user_id = auth.uid()$$, 'author edits own profile fields');
select throws_ok($$update public.author_profiles set status = 'active', payouts_paused = false
  where user_id = auth.uid()$$, '42501', null, 'author cannot write status or payout fields');

-- ─── Earnings ───────────────────────────────────────────────────────────────
reset role;
insert into public.books (id, author_id, title, status) values
  ('31000000-0000-4000-b000-000000000001', '31000000-0000-4000-a000-000000000001', 'Rain Songs', 'live');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo) values
  ('31000000-0000-4000-a000-000000000005', -125, 'unlock_all', 'plan', '31000000-0000-4000-b000-000000000001',
   '31000000-0000-4000-a000-000000000001', 20000),
  ('31000000-0000-4000-a000-000000000005', -5, 'chapter', 'topup', '31000000-0000-4000-b000-000000000001',
   '31000000-0000-4000-a000-000000000001', 800),
  -- The author reading their own book never earns.
  ('31000000-0000-4000-a000-000000000001', -5, 'chapter', 'topup', '31000000-0000-4000-b000-000000000001',
   '31000000-0000-4000-a000-000000000001', 800);
set local role authenticated;
select pg_temp.as_user('31000000-0000-4000-a000-000000000001');
select is((public.studio_home() -> 'month' ->> 'earned_kobo')::int, 20800,
  'studio home earnings exclude own reading');
select is(public.studio_home() -> 'month', public.studio_earnings() -> 'month',
  'studio home equals the earnings screen for the month');

select * from finish();
rollback;
