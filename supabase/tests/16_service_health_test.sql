-- Flow 16 · spec check 16-6: worker_service_health measures Play / App Store webhooks, push and
-- email from Arpedia's own records; a stale device token is not a push failure. Service role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('16500000-0000-4000-a000-000000000001', 'u1@t16s.local');
insert into public.profiles (id, full_name) values ('16500000-0000-4000-a000-000000000001', 'Health')
on conflict (id) do nothing;

-- Start from no records so the counts are this test's own.
delete from public.payment_events;
delete from public.push_log;
delete from public.email_sends;

insert into public.payment_events (provider, event_id, event_type, occurred_at, payload, normalized, error) values
  ('revenuecat', 't16s-1', 'RENEWAL', now(), '{}', '{"store": "play"}', null),
  ('revenuecat', 't16s-2', 'INITIAL_PURCHASE', now(), '{}', '{"store": "play"}', 'boom'),
  ('revenuecat', 't16s-3', 'RENEWAL', now(), '{}', '{"store": "app_store"}', null),
  ('flutterwave', 't16s-4', 'charge.completed', now(), '{}', '{"store": "web"}', null);
insert into public.push_log (user_id, type, category, status, skip_reason, sent_at)
select '16500000-0000-4000-a000-000000000001', (select key from public.push_types limit 1),
       (select category from public.push_types limit 1), s::public.push_status, r, now()
from (values ('delivered', null), ('failed', 'DeviceNotRegistered'), ('failed', 'MessageRateExceeded')) v (s, r);
insert into public.email_sends (template_key, user_id, bounced_at) values
  ('welcome', '16500000-0000-4000-a000-000000000001', null),
  ('welcome', '16500000-0000-4000-a000-000000000001', now());

select is(public.worker_service_health() -> 'google_play' ->> 'total', '2', 'Play counts only Play webhooks');
select is(public.worker_service_health() -> 'google_play' ->> 'failed', '1', 'and its failed ones');
select is(public.worker_service_health() -> 'app_store' ->> 'total', '1', 'App Store counts only App Store webhooks');
select is(public.worker_service_health() -> 'fcm' ->> 'failed', '1', 'a stale device token is not a push failure');
select is(public.worker_service_health() -> 'resend' ->> 'failed', '1', 'a bounce counts as an email failure');

set local role authenticated;
select throws_ok($$ select public.worker_service_health() $$, '42501', null, 'signed-in users cannot call it');
reset role;
set local role service_role;
select lives_ok($$ select public.worker_service_health() $$, 'the Worker (service role) can');
reset role;

select * from finish();
rollback;
