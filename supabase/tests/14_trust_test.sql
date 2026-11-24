-- Flow 14 · trust, safety and support: RLS on reports, appeals, support_tickets, ticket_messages
-- (notes hidden), DM snapshot access; create_report dedupe and auto-hide; decisions, sanctions and
-- their enforcement; decide_appeal different-decider rule; staff_return_chapter_charge (limits,
-- idempotency, author earning, no double return); claims; help; sanction expiry.
begin;
create extension if not exists pgtap with schema extensions;
select plan(84);

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
-- Staff with a fresh two-step code (AAL2).
create function pg_temp.as_staff(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
-- Staff never read `reports` directly (only through the admin RPCs), so tests look ids up as owner.
create function pg_temp.rid(p_content uuid) returns uuid language sql security definer as $$
  select id from public.reports where content_id = p_content order by created_at limit 1
$$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- Readers r1–r4 (old accounts), rn (new account), sender S, author Au; staff: moderators M and M2,
-- Super admins A1 and A2, Support SU, Finance F, Publisher P.
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('14000000-0000-4000-a000-000000000001', 'r1@t14.local', '{"full_name":"Reader One"}', now() - interval '30 days'),
  ('14000000-0000-4000-a000-000000000002', 'r2@t14.local', '{"full_name":"Reader Two"}', now() - interval '20 days'),
  ('14000000-0000-4000-a000-000000000003', 'r3@t14.local', '{"full_name":"Reader Three"}', now() - interval '10 days'),
  ('14000000-0000-4000-a000-000000000004', 'r4@t14.local', '{"full_name":"Reader Four"}', now() - interval '5 days'),
  ('14000000-0000-4000-a000-000000000005', 'rn@t14.local', '{"full_name":"New Reader"}', now()),
  ('14000000-0000-4000-a000-000000000006', 's@t14.local', '{"full_name":"Sender S"}', now() - interval '60 days'),
  ('14000000-0000-4000-a000-000000000007', 'au@t14.local', '{"full_name":"Author Au"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000001', 'm@t14.local', '{"full_name":"Zainab Mod"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000002', 'm2@t14.local', '{"full_name":"Second Mod"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000003', 'a1@t14.local', '{"full_name":"Super One"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000004', 'a2@t14.local', '{"full_name":"Super Two"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000005', 'su@t14.local', '{"full_name":"Support Su"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000006', 'f@t14.local', '{"full_name":"Finance F"}', now() - interval '90 days'),
  ('14000000-0000-4000-b000-000000000007', 'p@t14.local', '{"full_name":"Publisher P"}', now() - interval '90 days');
insert into public.staff_roles (user_id, role) values
  ('14000000-0000-4000-b000-000000000001', 'moderator'), ('14000000-0000-4000-b000-000000000002', 'moderator'),
  ('14000000-0000-4000-b000-000000000003', 'super_admin'), ('14000000-0000-4000-b000-000000000004', 'super_admin'),
  ('14000000-0000-4000-b000-000000000005', 'support'), ('14000000-0000-4000-b000-000000000006', 'finance'),
  ('14000000-0000-4000-b000-000000000007', 'publisher');

insert into public.groups (id, kind, name, visibility, owner_id) values
  ('14000000-0000-4000-d000-000000000001', 'club', 'Trust Club', 'public', '14000000-0000-4000-a000-000000000001'),
  ('14000000-0000-4000-d000-000000000002', 'dm', 'R1 and S', 'private', null);
insert into public.group_members (group_id, user_id, role)
select '14000000-0000-4000-d000-000000000001', u, case when u = '14000000-0000-4000-a000-000000000001'::uuid then 'owner' else 'member' end::public.group_role
from unnest(array['14000000-0000-4000-a000-000000000001', '14000000-0000-4000-a000-000000000002',
  '14000000-0000-4000-a000-000000000003', '14000000-0000-4000-a000-000000000004', '14000000-0000-4000-a000-000000000005',
  '14000000-0000-4000-a000-000000000006']::uuid[]) u;
insert into public.group_members (group_id, user_id) values
  ('14000000-0000-4000-d000-000000000002', '14000000-0000-4000-a000-000000000001'),
  ('14000000-0000-4000-d000-000000000002', '14000000-0000-4000-a000-000000000006');
insert into public.messages (id, group_id, sender_id, client_id, body, created_at) values
  ('14000000-0000-4000-e000-000000000001', '14000000-0000-4000-d000-000000000001', '14000000-0000-4000-a000-000000000006', gen_random_uuid(), 'Buy cheap followers now', now() - interval '3 minutes'),
  ('14000000-0000-4000-e000-000000000002', '14000000-0000-4000-d000-000000000001', '14000000-0000-4000-a000-000000000006', gen_random_uuid(), 'I will hurt you', now() - interval '2 minutes'),
  ('14000000-0000-4000-e000-000000000003', '14000000-0000-4000-d000-000000000001', '14000000-0000-4000-a000-000000000006', gen_random_uuid(), 'You are all idiots', now() - interval '1 minute'),
  ('14000000-0000-4000-e000-000000000004', '14000000-0000-4000-d000-000000000002', '14000000-0000-4000-a000-000000000006', gen_random_uuid(), 'Send me your password', now());

-- ─── create_report: RLS, dedupe, reasons ────────────────────────────────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select ok(public.create_report('message', '14000000-0000-4000-e000-000000000001', 'spam') like 'RPT-%',
  'a reader reports a message');
select is((select count(*)::int from public.reports), 1, 'the reporter reads their own report');
select throws_ok($$ select status from public.reports $$, '42501', null,
  'the reporter cannot read the outcome columns');
select throws_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000001', 'spam') $$,
  '23505', 'already_reported', 'one report per reader per item');
select throws_ok($$ select public.create_report('profile', '14000000-0000-4000-a000-000000000006', 'spoilers') $$,
  '22023', 'reason_not_allowed', 'reasons depend on the content type');
select pg_temp.as_user('14000000-0000-4000-a000-000000000006');
select is((select count(*)::int from public.reports), 0, 'the reported person never sees reports about them');
select throws_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000003', 'spam') $$,
  '42501', 'own_content', 'you cannot report your own message');

-- ─── Auto-hide: 3 eligible readers; a new account does not count ───────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000001', 'spam') $$, 'second report');
select pg_temp.as_user('14000000-0000-4000-a000-000000000005');
select lives_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000001', 'spam') $$,
  'a new account can report');
select pg_temp.as_owner();
select is((select state::text from public.messages where id = '14000000-0000-4000-e000-000000000001'), 'visible',
  'two eligible reporters and a new account do not hide it');
select is((select eligible from public.reports where reporter_id = '14000000-0000-4000-a000-000000000005'), false,
  'a report from an account under 24 hours is not eligible');
select pg_temp.as_user('14000000-0000-4000-a000-000000000003');
select lives_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000001', 'spam') $$, 'third report');
select pg_temp.as_owner();
select is((select state::text from public.messages where id = '14000000-0000-4000-e000-000000000001'), 'auto_hidden',
  'three eligible reporters auto-hide the message');
select is((select count(*)::int from public.reports where content_id = '14000000-0000-4000-e000-000000000001'
             and status = 'auto_hidden'), 4, 'every report on it moves to Auto-hidden');

select pg_temp.as_user('14000000-0000-4000-a000-000000000004');
select lives_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000002', 'violence', 'Threat') $$,
  'one report on a threat');
select pg_temp.as_owner();
select is((select state::text from public.messages where id = '14000000-0000-4000-e000-000000000002'), 'auto_hidden',
  'violence hides at one report');
select is((select severity::text from public.reports where content_id = '14000000-0000-4000-e000-000000000002'), 'high',
  'violence is High severity');

update public.automod_settings set value = '1' where key = 'reports_per_day';
select pg_temp.as_user('14000000-0000-4000-a000-000000000002');
select throws_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000003', 'harassment') $$,
  '54000', 'daily_limit', 'the daily report limit applies');
select pg_temp.as_owner();
update public.automod_settings set value = '20' where key = 'reports_per_day';

-- ─── Queue access ───────────────────────────────────────────────────────────
select pg_temp.as_user('14000000-0000-4000-b000-000000000001');
select throws_ok($$ select * from public.admin_list_reports() $$, '42501', null,
  'staff without a fresh two-step code cannot read the queue');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
-- Seeded reports (seeds/14_trust.sql) are on 00000000-… content; count only this test's items.
select is((select count(*)::int from public.admin_list_reports() where content_id::text not like '00000000-0000-4000-%'),
  2, 'the queue shows one row per reported item');
select is((select severity::text from public.admin_list_reports() limit 1), 'high', 'High items float to the top');
select is((select reporters from public.admin_list_reports() where content_id = '14000000-0000-4000-e000-000000000001'), 4,
  'reporters are counted per item');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select throws_ok($$ select public.staff_decide_report(pg_temp.rid('14000000-0000-4000-e000-000000000001'), 'keep') $$,
  '42501', null, 'Support cannot decide reports');
select lives_ok($$ select public.escalate_report(pg_temp.rid('14000000-0000-4000-e000-000000000002')) $$,
  'Support can escalate');

-- ─── Keep restores; a second decider is refused ─────────────────────────────
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select lives_ok($$ select public.staff_decide_report(pg_temp.rid('14000000-0000-4000-e000-000000000001'), 'keep') $$,
  'a moderator keeps the message');
select pg_temp.as_owner();
select is((select state::text from public.messages where id = '14000000-0000-4000-e000-000000000001'), 'visible',
  'Keep restores the auto-hidden message');
select is((select count(*)::int from public.reports where content_id = '14000000-0000-4000-e000-000000000001'
             and status = 'resolved' and outcome = 'dismissed'), 4, 'Keep closes every report as dismissed');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000002');
select throws_ok($$ select public.staff_decide_report(pg_temp.rid('14000000-0000-4000-e000-000000000001'), 'remove', null, null, 'Spam') $$,
  '40001', 'already_decided:Zainab Mod', 'a second moderator sees who already decided');

-- ─── Remove and mute 7 days ─────────────────────────────────────────────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select lives_ok($$ select public.create_report('message', '14000000-0000-4000-e000-000000000003', 'harassment') $$, 'report an insult');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select is((public.staff_decide_report(pg_temp.rid('14000000-0000-4000-e000-000000000003'),
  'action', 'mute', 7, 'Harassment', 'Second time', 'We removed your message for harassment.') ->> 'outcome'), 'actioned',
  'Remove and mute 7 days');
select pg_temp.as_owner();
select is((select state::text from public.messages where id = '14000000-0000-4000-e000-000000000003'), 'removed',
  'the message is removed');
select ok((select ends_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
           from public.user_sanctions where user_id = '14000000-0000-4000-a000-000000000006' and kind = 'mute'),
  'a 7-day mute is active');
select is((select reason from public.post_block_for('14000000-0000-4000-d000-000000000001', '14000000-0000-4000-a000-000000000006')),
  'sanction_muted', 'the muted user cannot post in the group');
select is((select reason from public.post_block_for('14000000-0000-4000-d000-000000000002', '14000000-0000-4000-a000-000000000006')),
  'sanction_muted', 'nor in DMs');
select ok(exists (select 1 from public.audit_log where action = 'report.decide' and actor_id = '14000000-0000-4000-b000-000000000001'
                  and after ->> 'action' = 'mute'), 'the decision is in the audit log');
select pg_temp.as_service();
select is((public.persist_messages(jsonb_build_array(jsonb_build_object('group_id', '14000000-0000-4000-d000-000000000001',
  'sender_id', '14000000-0000-4000-a000-000000000006', 'client_id', gen_random_uuid(), 'body', 'still here?'))) -> 0 ->> 'status'),
  'rejected', 'the chat Durable Object''s write is refused while muted');

-- ─── DM report: only that thread; opening it is audited; suspension ─────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select lives_ok($$ select public.create_report('dm', '14000000-0000-4000-e000-000000000004', 'spam') $$, 'report a DM');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select is(jsonb_array_length(public.admin_get_report(pg_temp.rid('14000000-0000-4000-e000-000000000004'))
  -> 'snapshot' -> 'context'), 1, 'staff see the reported DM thread from the snapshot');
select pg_temp.as_owner();
select ok(exists (select 1 from public.audit_log where action = 'report.view_dm'), 'opening a reported DM is audited');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select lives_ok($$ select public.staff_decide_report(pg_temp.rid('14000000-0000-4000-e000-000000000004'),
  'action', 'suspend', 30, 'Scam') $$, 'suspend 30 days');
select pg_temp.as_owner();
select ok((select banned_until > now() + interval '29 days' from auth.users where id = '14000000-0000-4000-a000-000000000006'),
  'a suspended user cannot sign in');

-- ─── Ban needs a second Super admin ─────────────────────────────────────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.create_report('profile', '14000000-0000-4000-a000-000000000004', 'impersonation') $$, 'report a profile');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select is((public.staff_decide_report(pg_temp.rid('14000000-0000-4000-a000-000000000004'), 'action', 'ban', null, 'Impersonation')
  ->> 'ban_pending'), 'true', 'a ban waits for a Super admin');
select throws_ok($$ select public.confirm_ban((select id from public.moderation_actions where action = 'ban')) $$,
  '42501', null, 'a moderator cannot confirm a ban');
select is((select count(*)::int from public.admin_pending_bans()), 0, 'a moderator is not shown bans to confirm');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000003');
select is((select report_id from public.admin_pending_bans()), pg_temp.rid('14000000-0000-4000-a000-000000000004'),
  'a Super admin sees the pending ban with its report (Home tasks, report page)');
select lives_ok($$ select public.confirm_ban((select id from public.moderation_actions where action = 'ban')) $$,
  'a Super admin confirms the ban');
select pg_temp.as_owner();
select is((select kind::text from public.active_sanction('14000000-0000-4000-a000-000000000004')), 'ban', 'the ban is active');

-- ─── Appeals ────────────────────────────────────────────────────────────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000006');
select set_config('t.appeal', public.create_appeal('sanction',
  (select id from public.user_sanctions where kind = 'mute' and user_id = '14000000-0000-4000-a000-000000000006'),
  'I was quoting someone else.')::text, true) is not null as appealed;
select throws_ok($$ select public.create_appeal('sanction',
  (select id from public.user_sanctions where kind = 'mute' and user_id = '14000000-0000-4000-a000-000000000006'), 'Again') $$,
  '23505', 'already_appealed', 'one open appeal per decision');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select throws_ok($$ select public.decide_appeal(current_setting('t.appeal')::uuid, 'overturned') $$,
  '42501', 'original_decider', 'the original decider cannot decide the appeal');
select pg_temp.as_owner();
update public.user_sanctions set starts_at = now() - interval '3 days', ends_at = now() + interval '4 days'
where kind = 'mute' and user_id = '14000000-0000-4000-a000-000000000006';
select pg_temp.as_staff('14000000-0000-4000-b000-000000000002');
select lives_ok($$ select public.decide_appeal(current_setting('t.appeal')::uuid, 'reduced', 1, 'Reduced to one day.') $$,
  'another moderator reduces it to 1 day');
select pg_temp.as_owner();
select is((select state::text from public.user_sanctions where kind = 'mute' and user_id = '14000000-0000-4000-a000-000000000006'),
  'ended', 'Reduce ends a mute whose new length has passed');

-- ─── Support tickets: inbound email, notes hidden, reopen ───────────────────
select pg_temp.as_service();
select is((public.ingest_support_email('R1@t14.local', 'Cannot open my book', 'Chapter 3 is blank', '<m1@mail>') ->> 'status'),
  'created', 'an inbound email creates a ticket for the matching reader');
select is((public.ingest_support_email('R1@t14.local', 'Cannot open my book', 'Chapter 3 is blank', '<m1@mail>') ->> 'status'),
  'duplicate', 'a redelivered email is ignored');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select lives_ok($$ select public.add_ticket_note((select id from public.support_tickets where email = 'r1@t14.local'), 'Checked R2, file is fine') $$,
  'Support adds an internal note');
select lives_ok($$ select public.reply_ticket((select id from public.support_tickets where email = 'r1@t14.local'), 'Fixed, please try again.', true) $$,
  'Send and solve');
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.ticket_messages), 2, 'the reader sees the thread without the note');
select pg_temp.as_user('14000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.support_tickets), 0, 'readers never see other readers'' tickets');
select pg_temp.as_service();
select is((public.ingest_support_email('r1@t14.local', 'Re: [' || (select ref from public.support_tickets where email = 'r1@t14.local') || '] Cannot open my book',
  'Still blank', '<m2@mail>') ->> 'status'), 'reopened', 'a reply within 7 days reopens the solved ticket');

-- ─── Return a chapter charge ────────────────────────────────────────────────
select pg_temp.as_owner();
insert into public.books (id, author_id, title, status) values
  ('14000000-0000-4000-c000-000000000001', '14000000-0000-4000-a000-000000000007', 'Trust Book', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits)
values ('14000000-0000-4000-c100-000000000001', '14000000-0000-4000-c000-000000000001', 1, 'live', 60000, 240, 120);
update public.books set current_revision_id = '14000000-0000-4000-c100-000000000001' where id = '14000000-0000-4000-c000-000000000001';
insert into public.chapters (id, revision_id, chapter_uid, ord, title, words, pages, price_credits) values
  ('14000000-0000-4000-c200-000000000001', '14000000-0000-4000-c100-000000000001', '14000000-0000-4000-c300-000000000001', 1, 'One', 1500, 6, 3),
  ('14000000-0000-4000-c200-000000000002', '14000000-0000-4000-c100-000000000001', '14000000-0000-4000-c300-000000000002', 2, 'Two', 30000, 120, 60),
  ('14000000-0000-4000-c200-000000000003', '14000000-0000-4000-c100-000000000001', '14000000-0000-4000-c300-000000000003', 3, 'Three', 1000, 4, 2);
insert into public.credit_ledger (user_id, delta, reason, bucket, created_at) values
  ('14000000-0000-4000-a000-000000000001', 99, 'top_up', 'topup', now() - interval '1 day'),
  ('14000000-0000-4000-a000-000000000001', 1, 'plan_grant', 'plan', now() - interval '1 day');
-- Chapter One: 3 credits split over two buckets in one charge, 20 minutes ago.
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, book_id, chapter_id, author_id, author_earning_kobo, created_at) values
  ('14000000-0000-4000-a000-000000000001', -1, 'chapter', 'plan', '14000000-0000-4000-f000-000000000001', '14000000-0000-4000-c000-000000000001', '14000000-0000-4000-c200-000000000001', '14000000-0000-4000-a000-000000000007', 160, now() - interval '20 minutes'),
  ('14000000-0000-4000-a000-000000000001', -2, 'chapter', 'topup', '14000000-0000-4000-f000-000000000001', '14000000-0000-4000-c000-000000000001', '14000000-0000-4000-c200-000000000001', '14000000-0000-4000-a000-000000000007', 320, now() - interval '20 minutes'),
  ('14000000-0000-4000-a000-000000000001', -60, 'chapter', 'topup', '14000000-0000-4000-f000-000000000002', '14000000-0000-4000-c000-000000000001', '14000000-0000-4000-c200-000000000002', '14000000-0000-4000-a000-000000000007', 9600, now() - interval '20 minutes'),
  ('14000000-0000-4000-a000-000000000001', -2, 'chapter', 'topup', '14000000-0000-4000-f000-000000000003', '14000000-0000-4000-c000-000000000001', '14000000-0000-4000-c200-000000000003', '14000000-0000-4000-a000-000000000007', 320, now() - interval '2 minutes');
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source) values
  ('14000000-0000-4000-a000-000000000001', '14000000-0000-4000-c000-000000000001', 'chapter', '14000000-0000-4000-c300-000000000001', 'chapter');
select set_config('t.c1', (select min(id)::text from public.credit_ledger where txn_id = '14000000-0000-4000-f000-000000000001'), true) is not null as c1;
select set_config('t.c2', (select min(id)::text from public.credit_ledger where txn_id = '14000000-0000-4000-f000-000000000002'), true) is not null as c2;
select set_config('t.c3', (select min(id)::text from public.credit_ledger where txn_id = '14000000-0000-4000-f000-000000000003'), true) is not null as c3;

select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select is((public.staff_return_chapter_charge(current_setting('t.c1')::bigint, 'skipped_ahead') ->> 'state'), 'done',
  'Support returns a 3-credit chapter charge');
select pg_temp.as_owner();
select is(public.credit_balance('14000000-0000-4000-a000-000000000001'), 100 - 60 - 2, 'the credits come back at once');
select is((select sum(author_earning_kobo)::int from public.credit_ledger where chapter_id = '14000000-0000-4000-c200-000000000001'), 0,
  'the author is not paid for the returned chapter');
select ok((select revoked_at is not null from public.entitlements where chapter_uid = '14000000-0000-4000-c300-000000000001'),
  'the chapter locks again');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select is((public.staff_return_chapter_charge(current_setting('t.c1')::bigint, 'skipped_ahead') ->> 'duplicate'), 'true',
  'returning the same charge twice is a no-op');
select throws_ok($$ select public.staff_return_chapter_charge(current_setting('t.c3')::bigint, 'wrong_book') $$,
  '22023', 'undo_window_open', 'not while the reader''s own 10-minute undo is open');
select is((public.staff_return_chapter_charge(current_setting('t.c2')::bigint, 'did_not_open') ->> 'state'), 'pending_approval',
  'over 50 credits waits for Finance');
select pg_temp.as_owner();
select is(public.credit_balance('14000000-0000-4000-a000-000000000001'), 38, 'nothing moves until Finance approves');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select throws_ok($$ select public.approve_credit_return((select id from public.credit_returns where state = 'pending_approval'), true) $$,
  '42501', null, 'Support cannot approve');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000006');
select lives_ok($$ select public.approve_credit_return((select id from public.credit_returns where state = 'pending_approval'), true) $$,
  'Finance approves');
select pg_temp.as_owner();
select is(public.credit_balance('14000000-0000-4000-a000-000000000001'), 98, 'the approved return lands');

-- A return waiting for Finance is refused if the reader's own undo already gave the charge back.
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, book_id, chapter_id, author_id, author_earning_kobo, created_at) values
  ('14000000-0000-4000-a000-000000000001', -55, 'chapter', 'topup', '14000000-0000-4000-f000-000000000004', '14000000-0000-4000-c000-000000000001', '14000000-0000-4000-c200-000000000003', '14000000-0000-4000-a000-000000000007', 8800, now() - interval '30 minutes');
select set_config('t.c4', (select min(id)::text from public.credit_ledger where txn_id = '14000000-0000-4000-f000-000000000004'), true) is not null as c4;
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select is((public.staff_return_chapter_charge(current_setting('t.c4')::bigint, 'wrong_book') ->> 'state'), 'pending_approval',
  'a second big return waits for Finance');
select pg_temp.as_owner();
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, chapter_id, created_at) values
  ('14000000-0000-4000-a000-000000000001', 55, 'undo', 'topup', '14000000-0000-4000-c000-000000000001', '14000000-0000-4000-c200-000000000003', now());
select pg_temp.as_staff('14000000-0000-4000-b000-000000000006');
select throws_ok($$ select public.approve_credit_return((select id from public.credit_returns where state = 'pending_approval'), true) $$,
  '23505', 'already_undone', 'Finance cannot approve a return the reader already undid (no double refund)');

-- ─── Copyright claim from a book report ─────────────────────────────────────
select pg_temp.as_user('14000000-0000-4000-a000-000000000002');
select lives_ok($$ select public.create_report('book', '14000000-0000-4000-c000-000000000001', 'copyright', 'This is my novel') $$,
  'a reader reports a book for copyright');
select pg_temp.as_owner();
select is((select claimant_name from public.copyright_claims where book_id = '14000000-0000-4000-c000-000000000001'), 'Reader Two',
  'a copyright report opens a claim with the reporter as claimant');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000001');
select throws_ok($$ select public.decide_claim((select id from public.copyright_claims where book_id = '14000000-0000-4000-c000-000000000001'), 'uphold', 'Full copy') $$,
  '42501', null, 'a moderator cannot uphold a claim');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000007');
select lives_ok($$ select public.decide_claim((select id from public.copyright_claims where book_id = '14000000-0000-4000-c000-000000000001'), 'uphold', 'Full copy') $$,
  'a Publisher upholds the claim');
select pg_temp.as_owner();
select is((select status::text from public.books where id = '14000000-0000-4000-c000-000000000001'), 'taken_down',
  'the book is taken down');

-- ─── Help articles ──────────────────────────────────────────────────────────
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select set_config('t.help', (public.save_help_draft(null, 'test-zebra-credits', 'credits_plans', '{app,web}',
  'Zebra credits test', 'One zebra credit is ₦3.') ->> 'article_id'), true) is not null as drafted;
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.get_help_articles() where id = current_setting('t.help')::uuid), 0,
  'drafts are not shown in the app');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select lives_ok($$ select public.publish_help_article(current_setting('t.help')::uuid) $$, 'Support publishes');
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select is((select title from public.get_help_articles('credits_plans') where id = current_setting('t.help')::uuid),
  'Zebra credits test', 'published articles show in the app');
select pg_temp.as_staff('14000000-0000-4000-b000-000000000005');
select lives_ok($$ select public.set_help_extras(current_setting('t.help')::uuid, null, false) $$,
  'Support turns search suggestions off');
select pg_temp.as_user('14000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.get_help_articles(null, 'zebra')), 0,
  'an article with search suggestions off is not offered in search');
select is((select count(*)::int from public.get_help_articles('credits_plans') where id = current_setting('t.help')::uuid), 1,
  'it still shows when browsing its section');

-- ─── Sanction expiry ────────────────────────────────────────────────────────
select pg_temp.as_owner();
update public.user_sanctions set starts_at = now() - interval '31 days', ends_at = now() - interval '1 hour'
where kind = 'suspend' and user_id = '14000000-0000-4000-a000-000000000006';
select public.sanction_expiry();
select ok((select banned_until is null from auth.users where id = '14000000-0000-4000-a000-000000000006'),
  'sanction_expiry gives sign-in back when a suspension ends');

select * from finish();
rollback;
