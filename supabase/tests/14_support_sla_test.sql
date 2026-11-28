-- Flow 14 · 14-25 (rules 35 and 37): late tickets are marked once and Support is alerted once per
-- run; a reader reply after the 7-day reopen window opens a linked ticket.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('14250000-0000-4000-a000-000000000001', 'r1@flow1425.test'),
  ('14250000-0000-4000-a000-000000000002', 'r2@flow1425.test');
insert into public.profiles (id, full_name) values
  ('14250000-0000-4000-a000-000000000001', 'Ngozi Reader'),
  ('14250000-0000-4000-a000-000000000002', 'Other Reader')
on conflict (id) do update set full_name = excluded.full_name;
insert into public.support_tickets (id, user_id, email, channel, category, subject, status, first_reply_due_at,
                                    first_replied_at, reopen_until) values
  ('14250000-0000-4000-b000-000000000001', '14250000-0000-4000-a000-000000000001', 'r1@flow1425.test', 'app',
   'billing', 'Late one', 'open', now() - interval '2 hours', null, null),
  ('14250000-0000-4000-b000-000000000002', '14250000-0000-4000-a000-000000000001', 'r1@flow1425.test', 'app',
   'billing', 'Answered', 'open', now() - interval '2 hours', now() - interval '3 hours', null),
  ('14250000-0000-4000-b000-000000000003', '14250000-0000-4000-a000-000000000001', 'r1@flow1425.test', 'app',
   'bug', 'Solved recently', 'solved', now() - interval '5 days', now() - interval '5 days', now() + interval '2 days'),
  ('14250000-0000-4000-b000-000000000004', '14250000-0000-4000-a000-000000000001', 'r1@flow1425.test', 'app',
   'account', 'Solved long ago', 'solved', now() - interval '30 days', now() - interval '30 days',
   now() - interval '20 days'),
  ('14250000-0000-4000-b000-000000000005', '14250000-0000-4000-a000-000000000002', 'r2@flow1425.test', 'app',
   'other', 'Not yours', 'open', now() + interval '1 day', null, null);

create function pg_temp.late_alerts() returns int language sql as $$
  select count(*)::int from pgmq.q_trust_notify where message ->> 'kind' = 'ticket_late'
$$;

select public.sla_watch();
select isnt((select late_alerted_at from public.support_tickets where id = '14250000-0000-4000-b000-000000000001'), null,
  'a ticket past its first-reply time is marked late');
select is((select count(*)::int from public.support_tickets where late_alerted_at is not null
           and id in ('14250000-0000-4000-b000-000000000002', '14250000-0000-4000-b000-000000000003',
                      '14250000-0000-4000-b000-000000000005')), 0,
  'answered, solved and not-yet-due tickets are not');
select ok(pg_temp.late_alerts() >= 1, 'Support is alerted');
select is((select (message ->> 'count')::int >= 1 from pgmq.q_trust_notify where message ->> 'kind' = 'ticket_late'
           order by msg_id desc limit 1), true, 'the alert carries how many went late');
create temp table before as select pg_temp.late_alerts() as n;
select public.sla_watch();
select is(pg_temp.late_alerts(), (select n from before), 'a second run alerts nothing new');

select set_config('request.jwt.claims',
  '{"sub":"14250000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.reader_reply_ticket('14250000-0000-4000-b000-000000000003', 'Still broken') ->> 'status', 'reopened',
  'a reply within 7 days of solving reopens the ticket');
select is((select status::text from public.support_tickets where id = '14250000-0000-4000-b000-000000000003'), 'open',
  'and it is open again');
select is(public.reader_reply_ticket('14250000-0000-4000-b000-000000000004', 'It happened again') ->> 'status', 'linked',
  'a reply after 7 days opens a new ticket');
select results_eq($$select subject, category::text, status::text, channel::text from public.support_tickets
                    where linked_ticket_id = '14250000-0000-4000-b000-000000000004'$$,
  $$values ('Re: Solved long ago', 'account', 'open', 'app')$$, 'linked to the old one, same category');
select is((select status::text from public.support_tickets where id = '14250000-0000-4000-b000-000000000004'), 'solved',
  'the old ticket stays solved');
select throws_ok($$select public.reader_reply_ticket('14250000-0000-4000-b000-000000000005', 'Hi')$$,
  'P0002', 'not_found', 'a reader cannot reply on someone else''s ticket');
select throws_ok($$select public.reader_reply_ticket('14250000-0000-4000-b000-000000000001', '   ')$$,
  '22023', 'empty_message', 'an empty reply is refused');
reset role;

select * from finish();
rollback;
