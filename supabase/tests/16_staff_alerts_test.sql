-- Flow 16 · spec check 16-14: the dispatcher sees who switched which alert off; system health and
-- copyright claims raise staff alerts (once per change / per claim deadline).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create function pg_temp.queued(p_kind text) returns int language sql security definer as $$
  select count(*)::int from pgmq.q_trust_notify where message ->> 'kind' = p_kind
    and (message ->> 'service' = 'fcm' or message ->> 'ref' like 'CLM-%')
$$;

insert into auth.users (id, email) values
  ('16a00000-0000-4000-a000-000000000001', 'p1@t16a.local'), ('16a00000-0000-4000-a000-000000000002', 'p2@t16a.local'),
  ('16a00000-0000-4000-a000-000000000003', 'au@t16a.local');
insert into public.profiles (id, full_name, is_author) values
  ('16a00000-0000-4000-a000-000000000001', 'Pub One', false), ('16a00000-0000-4000-a000-000000000002', 'Pub Two', false),
  ('16a00000-0000-4000-a000-000000000003', 'Author', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('16a00000-0000-4000-a000-000000000001', 'publisher'), ('16a00000-0000-4000-a000-000000000002', 'publisher');
insert into public.staff_alert_prefs (user_id, kind, enabled) values
  ('16a00000-0000-4000-a000-000000000002', 'copyright_claims', false),
  ('16a00000-0000-4000-a000-000000000002', 'system_health', true);
insert into public.books (id, author_id, title, status) values
  ('16a00000-0000-4000-c000-000000000001', '16a00000-0000-4000-a000-000000000003', 'Claimed', 'live');
delete from pgmq.q_trust_notify;

-- ─── Lookup ─────────────────────────────────────────────────────────────────
select pg_temp.as_service();
select is(public.notify_lookup('{}', '{}', array['publisher'], '{}') -> 'staff_off' -> '16a00000-0000-4000-a000-000000000002',
  '["copyright_claims"]'::jsonb, 'the lookup lists the alerts a staff member switched off');
select is(public.notify_lookup('{}', '{}', array['publisher'], '{}') -> 'staff_off' -> '16a00000-0000-4000-a000-000000000001',
  null, 'and nothing for someone who switched none off');

-- ─── System health ──────────────────────────────────────────────────────────
update public.integration_health set status = 'working' where service = 'fcm';
select public.worker_set_integration_health('fcm', 'working');
select is(pg_temp.queued('system_alert'), 0, 'working → working raises nothing');
select public.worker_set_integration_health('fcm', 'degraded', null, null, 3, '3 of 100 failed in 24 hours');
select is(pg_temp.queued('system_alert'), 1, 'working → degraded (orange) raises one alert');
select public.worker_set_integration_health('fcm', 'degraded');
select public.worker_set_integration_health('fcm', 'failing');
select is(pg_temp.queued('system_alert'), 2, 'staying orange raises nothing more; orange → red raises again');

-- ─── Copyright claims ───────────────────────────────────────────────────────
select pg_temp.as_owner();
insert into public.copyright_claims (book_id, claimant_name, due_at)
values ('16a00000-0000-4000-c000-000000000001', 'Rotimi Press', now() + interval '1 day');
select is(pg_temp.queued('claim_new'), 1, 'a new claim raises a staff alert');
select pg_temp.as_service();
select is(public.claim_deadline_watch(), 1, 'a claim due within 2 days raises a deadline alert');
select is(public.claim_deadline_watch(), 0, 'only once');

select * from finish();
rollback;
