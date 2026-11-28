-- Spec check 14-29 (flow 14 Analytics), server events: report_auto_hidden, claim_created,
-- appeal_created, ticket_created, ticket_first_reply and ticket_solved reach the analytics outbox
-- with the spec's names and properties and no personal data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email)
select ('14290000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1429.test' from generate_series(1, 3) n;
insert into public.books (id, author_id, title, status) values
  ('14290000-0000-4000-b000-000000000001', '14290000-0000-4000-a000-000000000003', 'A Claimed Book', 'live');
delete from public.analytics_outbox;

create function pg_temp.ev(p_event text) returns jsonb
language sql as $$ select props - 'source' from public.analytics_outbox where event = p_event order by id desc limit 1 $$;
create function pg_temp.n(p_event text) returns int
language sql as $$ select count(*)::int from public.analytics_outbox where event = p_event $$;

-- Two reports on one comment become auto-hidden in one statement: one event for the item.
insert into public.reports (id, content_type, content_id, reason, severity, due_at) values
  ('14290000-0000-4000-c000-000000000001', 'post_comment', '14290000-0000-4000-d000-000000000001', 'spam', 'low', now() + interval '3 days'),
  ('14290000-0000-4000-c000-000000000002', 'post_comment', '14290000-0000-4000-d000-000000000001', 'harassment', 'medium', now() + interval '1 day'),
  ('14290000-0000-4000-c000-000000000003', 'review', '14290000-0000-4000-d000-000000000002', 'spam', 'low', now() + interval '3 days');
update public.reports set status = 'auto_hidden' where content_id = '14290000-0000-4000-d000-000000000001';
select is(pg_temp.n('report_auto_hidden'), 1, 'report_auto_hidden once per hidden item');
select is(pg_temp.ev('report_auto_hidden'), '{"content_type": "post_comment", "reports": 2}'::jsonb,
  'report_auto_hidden {content_type, reports}');
update public.reports set status = 'auto_hidden' where content_id = '14290000-0000-4000-d000-000000000001';
update public.reports set status = 'resolved' where content_id = '14290000-0000-4000-d000-000000000002';
select is(pg_temp.n('report_auto_hidden'), 1, 'no event again for an item already hidden, or for other changes');

-- A claim and an appeal.
insert into public.copyright_claims (book_id, claimant_id, claimant_name, type, report_id) values
  ('14290000-0000-4000-b000-000000000001', '14290000-0000-4000-a000-000000000001', 'Paramount Books Ltd', 'plagiarism',
   '14290000-0000-4000-c000-000000000003');
select is(pg_temp.ev('claim_created'), '{"type": "plagiarism", "from_report": true}'::jsonb, 'claim_created {type, from_report}');
select is((select distinct_id from public.analytics_outbox where event = 'claim_created'), '14290000-0000-4000-a000-000000000001',
  'from the claimant; the claimant''s name is not sent');

insert into public.appeals (user_id, subject_type, subject_id, text) values
  ('14290000-0000-4000-a000-000000000002', 'content_removal', '14290000-0000-4000-d000-000000000001', 'That was not spam.');
select is(pg_temp.ev('appeal_created'), '{"subject_type": "content_removal"}'::jsonb, 'appeal_created {subject_type}');

-- A ticket from an email: created, first reply after 2 hours, solved.
insert into public.support_tickets (id, email, channel, category, subject, created_at) values
  ('14290000-0000-4000-e000-000000000001', 'someone@example.com', 'email', 'billing', 'Charged twice', now() - interval '5 hours');
select is(pg_temp.ev('ticket_created'), '{"channel": "email", "category": "billing"}'::jsonb, 'ticket_created {channel, category}');
select is((select distinct_id from public.analytics_outbox where event = 'ticket_created'), 'system',
  'an email ticket with no account is system; the email is not sent');
update public.support_tickets set first_replied_at = created_at + interval '2 hours', assignee_id = '14290000-0000-4000-a000-000000000003'
 where id = '14290000-0000-4000-e000-000000000001';
select is(pg_temp.ev('ticket_first_reply'), '{"hours": 2.0, "category": "billing"}'::jsonb, 'ticket_first_reply {hours}');
update public.support_tickets set first_replied_at = now() where id = '14290000-0000-4000-e000-000000000001';
select is(pg_temp.n('ticket_first_reply'), 1, 'only the first reply counts');
update public.support_tickets set status = 'solved' where id = '14290000-0000-4000-e000-000000000001';
select is(pg_temp.ev('ticket_solved'), '{"hours": 5.0, "category": "billing"}'::jsonb, 'ticket_solved {hours, category}');
update public.support_tickets set status = 'solved' where id = '14290000-0000-4000-e000-000000000001';
select is(pg_temp.n('ticket_solved'), 1, 'solving an already solved ticket adds nothing');

select * from finish();
rollback;
