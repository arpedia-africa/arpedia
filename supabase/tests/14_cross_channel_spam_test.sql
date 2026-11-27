-- Flow 14 · 14-14 (rule 23): same text in 5 channels in 1 hour. The 5th channel is refused; the
-- settings move or switch off the rule; only the service role can ask.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('14150000-0000-4000-a000-000000000001', 'spam@flow1414.test');
insert into public.groups (id, kind, name, owner_id, visibility)
select ('14150000-0000-4000-c000-00000000000' || g)::uuid, 'club', 'Spam club ' || g,
       '14150000-0000-4000-a000-000000000001', 'private'
from generate_series(1, 6) g;

-- The same text (any case and spacing) in clubs 1–3 now and in club 4 two hours ago.
insert into public.messages (group_id, sender_id, client_id, body, created_at)
select ('14150000-0000-4000-c000-00000000000' || g)::uuid, '14150000-0000-4000-a000-000000000001', gen_random_uuid(),
       case g when 2 then '  BUY CHEAP CREDITS ' else 'buy cheap credits' end,
       case g when 4 then now() - interval '2 hours' else now() - interval '5 minutes' end
from generate_series(1, 4) g;

set local role service_role;
select is(public.cross_channel_spam('14150000-0000-4000-a000-000000000001', '14150000-0000-4000-c000-000000000005',
  'Buy cheap credits'), false, '3 other channels in the hour: the 4th is fine');
select is(public.cross_channel_spam('14150000-0000-4000-a000-000000000001', '14150000-0000-4000-c000-000000000001',
  'Buy cheap credits'), false, 'the channel it is sent to does not count');
select is(public.cross_channel_spam('14150000-0000-4000-a000-000000000001', '14150000-0000-4000-c000-000000000005',
  'something else'), false, 'different text is fine');
reset role;

insert into public.messages (group_id, sender_id, client_id, body)
values ('14150000-0000-4000-c000-000000000005', '14150000-0000-4000-a000-000000000001', gen_random_uuid(),
        'buy cheap credits');
set local role service_role;
select is(public.cross_channel_spam('14150000-0000-4000-a000-000000000001', '14150000-0000-4000-c000-000000000006',
  'Buy cheap credits'), true, 'a 5th channel within the hour is spam');
reset role;

update public.automod_settings set value = value || '{"cross_channel_window_minutes": 180}' where key = 'spam';
set local role service_role;
select is(public.cross_channel_spam('14150000-0000-4000-a000-000000000001', '14150000-0000-4000-c000-000000000005',
  'Buy cheap credits'), true, 'a longer window counts the older message too');
reset role;

update public.automod_settings set value = value || '{"cross_channel": 0}' where key = 'spam';
set local role service_role;
select is(public.cross_channel_spam('14150000-0000-4000-a000-000000000001', '14150000-0000-4000-c000-000000000006',
  'Buy cheap credits'), false, '0 switches the rule off');
reset role;

set local role authenticated;
select throws_ok($$select public.cross_channel_spam('14150000-0000-4000-a000-000000000001', null, 'x')$$, '42501', null,
  'a reader cannot ask about anyone''s messages');
reset role;
set local role anon;
select throws_ok($$select public.cross_channel_spam('14150000-0000-4000-a000-000000000001', null, 'x')$$, '42501', null,
  'nor can anyone signed out');
reset role;

select * from finish();
rollback;
