-- Flow 15 · notification and email dispatcher (spec check 10-3, 15-x): notification_allowed follows
-- the reader's switches; the dispatcher's queue and lookup RPCs are service-only and read only the
-- notice queues; every push type and email template it uses exists.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('15900000-0000-4000-a000-000000000001', 'n1@t159.local', '{"full_name":"Nkem Obi"}'),
  ('15900000-0000-4000-a000-000000000002', 'n2@t159.local', '{"full_name":"Author Two"}');
insert into public.follows (follower_id, followee_id) values
  ('15900000-0000-4000-a000-000000000001', '15900000-0000-4000-a000-000000000002');

-- ─── 10-3: preferences ──────────────────────────────────────────────────────
select ok(public.notification_allowed('15900000-0000-4000-a000-000000000001', 'club_message'), 'clubs on by default');
select ok(not public.notification_allowed('15900000-0000-4000-a000-000000000001', 'offer'), 'offers off by default');
insert into public.notification_preferences (user_id, clubs, authors, note_replies, reminders, offers)
values ('15900000-0000-4000-a000-000000000001', false, false, false, false, true);
select ok(not public.notification_allowed('15900000-0000-4000-a000-000000000001', 'club_message'), 'clubs off stops club items');
select ok(not public.notification_allowed('15900000-0000-4000-a000-000000000001', 'author_new_book'), 'authors off stops new-book items');
select ok(not public.notification_allowed('15900000-0000-4000-a000-000000000001', 'social_notice'), 'replies off stops likes and comments');
select ok(not public.notification_allowed('15900000-0000-4000-a000-000000000001', 'reading_reminder'), 'reminders off stops reminders');
select ok(public.notification_allowed('15900000-0000-4000-a000-000000000001', 'campaign'), 'offers on lets offers through');
select ok(public.notification_allowed('15900000-0000-4000-a000-000000000001', 'account_notice'), 'account notices always go');

-- ─── Dispatcher RPCs ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15900000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.notify_lookup(array['15900000-0000-4000-a000-000000000002'::uuid]) $$, '42501', null,
  'readers cannot look up other people''s email addresses');
select throws_ok($$ select * from public.notify_queue_read('user_notify') $$, '42501', null, 'readers cannot read notice queues');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ select * from public.notify_queue_read('payments') $$, '22023', 'Unknown queue',
  'only the notice queues can be read');
select is(public.notify_lookup(array['15900000-0000-4000-a000-000000000002'::uuid]) #>> '{users,15900000-0000-4000-a000-000000000002,first_name}',
  'Author', 'the lookup gives a first name');
select is(public.notify_lookup('{}', '{}', '{}', array['15900000-0000-4000-a000-000000000002'::uuid]) #> '{followers,15900000-0000-4000-a000-000000000002}',
  '["15900000-0000-4000-a000-000000000001"]'::jsonb, 'and the followers of an author');

select is((select count(*)::int from public.email_templates t
           where t.key in ('refund_done', 'refund_declined', 'bank_account_changed', 'bank_document_requested',
                           'bank_account_rejected', 'application_rejected', 'book_rejected', 'sanction_notice',
                           'appeal_decided', 'claim_notice', 'claim_decided', 'staff_alert', 'renewal_failed',
                           'renewal_reminder', 'payout_sent', 'payout_failed', 'author_approved', 'book_approved',
                           'changes_requested', 'application_more_info')
             and exists (select 1 from public.email_template_versions v where v.template_key = t.key))
        + (select count(*)::int from public.push_types where key in ('account_notice', 'social_notice')), 22,
  'every email template and push type the dispatcher uses exists');

select * from finish();
rollback;
