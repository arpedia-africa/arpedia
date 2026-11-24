-- Flow 14 · spec check fixes. 14-6: a live mute, suspension or ban stops comments on author posts,
-- messages to authors, reviews and new reading rooms; the wrapped originals are not callable by
-- clients. 14-8: flow 09's staff_return_chapter goes through flow 14's gated return (one
-- credit_returns row; Finance over 50 credits; a charge is returned once across both RPCs).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('14600000-0000-4000-a000-000000000001', 'muted@t146.local', '{"full_name":"Muted Reader"}', now() - interval '30 days'),
  ('14600000-0000-4000-a000-000000000002', 'au@t146.local', '{"full_name":"Author"}', now() - interval '90 days'),
  ('14600000-0000-4000-a000-000000000003', 'r@t146.local', '{"full_name":"Reader"}', now() - interval '30 days'),
  ('14600000-0000-4000-b000-000000000001', 'su@t146.local', '{"full_name":"Support"}', now() - interval '90 days');
insert into public.staff_roles (user_id, role) values ('14600000-0000-4000-b000-000000000001', 'support');
insert into public.user_sanctions (user_id, kind, starts_at, ends_at) values
  ('14600000-0000-4000-a000-000000000001', 'mute', now() - interval '1 hour', now() + interval '1 day');

-- ─── 14-6: sanctions ────────────────────────────────────────────────────────
select pg_temp.as_user('14600000-0000-4000-a000-000000000001');
select throws_ok($$ select public.add_comment(gen_random_uuid(), null, 'Hello', gen_random_uuid()) $$,
  'P0001', 'sanction_muted', 'a muted reader cannot comment on an author post');
select throws_ok($$ select public.send_author_message('14600000-0000-4000-a000-000000000002', gen_random_uuid(), 'Hi') $$,
  'P0001', 'sanction_muted', 'a muted reader cannot message an author');
select throws_ok($$ select public.post_review(gen_random_uuid(), 5, 'Great', false) $$,
  'P0001', 'sanction_muted', 'a muted reader cannot post a review');
select throws_ok($$ select public.create_reading_room('Our room', gen_random_uuid()) $$,
  'P0001', 'sanction_muted', 'a muted reader cannot create a reading room');
select throws_ok($$ select public._post_review_base(gen_random_uuid(), 5, 'Great', false) $$,
  '42501', null, 'the unwrapped review RPC is not callable by readers');
select throws_ok($$ select public._add_comment_base(gen_random_uuid(), null, 'x', gen_random_uuid()) $$,
  '42501', null, 'the unwrapped comment RPC is not callable by readers');
select throws_ok($$ select public._send_author_message_base(gen_random_uuid(), gen_random_uuid(), 'x') $$,
  '42501', null, 'the unwrapped author-message RPC is not callable by readers');
select throws_ok($$ select public._create_reading_room_base('x', gen_random_uuid(), 'free', 'code', null) $$,
  '42501', null, 'the unwrapped room RPC is not callable by readers');

select pg_temp.as_owner();
update public.user_sanctions set kind = 'suspend' where user_id = '14600000-0000-4000-a000-000000000001';
select pg_temp.as_user('14600000-0000-4000-a000-000000000001');
select throws_ok($$ select public.post_review(gen_random_uuid(), 5, 'Great', false) $$,
  'P0001', 'suspended', 'a suspension blocks too, with its own reason');

select pg_temp.as_owner();
update public.user_sanctions set ends_at = now() - interval '1 minute', starts_at = now() - interval '2 days'
where user_id = '14600000-0000-4000-a000-000000000001';
select pg_temp.as_user('14600000-0000-4000-a000-000000000001');
select throws_like($$ select public.post_review(gen_random_uuid(), 5, 'Great', false) $$,
  '%', 'an ended sanction no longer blocks (the review RPC runs its own checks)');
select pg_temp.as_owner();
select ok(not exists (select 1 from public.active_sanction('14600000-0000-4000-a000-000000000001')),
  'no live sanction after it ends');
select pg_temp.as_user('14600000-0000-4000-a000-000000000003');
select throws_ok($$ select public.create_reading_room('ab', gen_random_uuid()) $$,
  '22023', 'room_name', 'an unsanctioned reader reaches the room RPC''s own checks');

-- ─── 14-8: one return path ──────────────────────────────────────────────────
select pg_temp.as_owner();
insert into public.books (id, author_id, title, status) values
  ('14600000-0000-4000-c000-000000000001', '14600000-0000-4000-a000-000000000002', 'Return Book', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits)
values ('14600000-0000-4000-c100-000000000001', '14600000-0000-4000-c000-000000000001', 1, 'live', 60000, 240, 120);
update public.books set current_revision_id = '14600000-0000-4000-c100-000000000001'
where id = '14600000-0000-4000-c000-000000000001';
insert into public.chapters (id, revision_id, chapter_uid, ord, title, words, pages, price_credits) values
  ('14600000-0000-4000-c200-000000000001', '14600000-0000-4000-c100-000000000001', '14600000-0000-4000-c300-000000000001', 1, 'One', 1500, 6, 3),
  ('14600000-0000-4000-c200-000000000002', '14600000-0000-4000-c100-000000000001', '14600000-0000-4000-c300-000000000002', 2, 'Two', 30000, 120, 60);
insert into public.credit_ledger (user_id, delta, reason, bucket, created_at) values
  ('14600000-0000-4000-a000-000000000003', 100, 'top_up', 'topup', now() - interval '1 day');
-- Charges as spend_credits writes them: chapter_uid only, no chapter_id.
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, book_id, chapter_uid, author_id, author_earning_kobo, created_at) values
  ('14600000-0000-4000-a000-000000000003', -3, 'chapter', 'topup', '14600000-0000-4000-f000-000000000001', '14600000-0000-4000-c000-000000000001', '14600000-0000-4000-c300-000000000001', '14600000-0000-4000-a000-000000000002', 480, now() - interval '20 minutes'),
  ('14600000-0000-4000-a000-000000000003', -60, 'chapter', 'topup', '14600000-0000-4000-f000-000000000002', '14600000-0000-4000-c000-000000000001', '14600000-0000-4000-c300-000000000002', '14600000-0000-4000-a000-000000000002', 9600, now() - interval '20 minutes'),
  ('14600000-0000-4000-a000-000000000003', -3, 'chapter', 'topup', '14600000-0000-4000-f000-000000000003', '14600000-0000-4000-c000-000000000001', '14600000-0000-4000-c300-000000000001', '14600000-0000-4000-a000-000000000002', 480, now() - interval '30 minutes');
-- The reader undid the third charge themselves (flow 04 writes chapter_uid only too).
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, book_id, chapter_uid, author_id, author_earning_kobo, created_at) values
  ('14600000-0000-4000-a000-000000000003', 3, 'undo', 'topup', gen_random_uuid(), '14600000-0000-4000-c000-000000000001', '14600000-0000-4000-c300-000000000001', '14600000-0000-4000-a000-000000000002', -480, now() - interval '28 minutes');
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source) values
  ('14600000-0000-4000-a000-000000000003', '14600000-0000-4000-c000-000000000001', 'chapter', '14600000-0000-4000-c300-000000000001', 'chapter');
select set_config('t.c1', (select id::text from public.credit_ledger where txn_id = '14600000-0000-4000-f000-000000000001'), true) is not null as c1;
select set_config('t.c2', (select id::text from public.credit_ledger where txn_id = '14600000-0000-4000-f000-000000000002'), true) is not null as c2;
select set_config('t.c3', (select id::text from public.credit_ledger where txn_id = '14600000-0000-4000-f000-000000000003'), true) is not null as c3;

select pg_temp.as_staff('14600000-0000-4000-b000-000000000001');
select is((public.staff_return_chapter(current_setting('t.c1')::bigint, 'skipped_by_mistake') ->> 'returned'), '3',
  'flow 09''s return still returns a small charge at once');
select pg_temp.as_owner();
select is((select count(*)::int from public.credit_returns where ledger_id = current_setting('t.c1')::bigint and state = 'done'), 1,
  'and records it in credit_returns');
select ok((select revoked_at is not null from public.entitlements
           where user_id = '14600000-0000-4000-a000-000000000003' and chapter_uid = '14600000-0000-4000-c300-000000000001'),
  'a charge recorded by chapter_uid only locks the chapter again');
select pg_temp.as_staff('14600000-0000-4000-b000-000000000001');
select is((public.staff_return_chapter_charge(current_setting('t.c1')::bigint, 'skipped_ahead') ->> 'duplicate'), 'true',
  'the flow 14 path sees it as already returned');
select throws_ok($$ select public.staff_return_chapter(current_setting('t.c1')::bigint, 'did_not_open') $$,
  'P0001', 'already_returned', 'flow 09''s path refuses a second return');
select is((public.staff_return_chapter(current_setting('t.c2')::bigint, 'wrong_book') ->> 'state'), 'pending_approval',
  'over 50 credits waits for Finance through flow 09''s path too');
select throws_ok($$ select public.staff_return_chapter_charge(current_setting('t.c3')::bigint, 'wrong_book') $$,
  '23505', 'already_undone', 'a charge the reader already undid (by chapter_uid) is never paid back twice');
select pg_temp.as_owner();
select is(public.credit_balance('14600000-0000-4000-a000-000000000003'), 100 - 3 - 60 - 3 + 3 + 3,
  'only the small charge came back; the big one waits');

select * from finish();
rollback;
