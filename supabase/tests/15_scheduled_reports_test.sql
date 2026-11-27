-- Flow 15 · 15-20 (rule 29): scheduled reports. The Worker lists enabled schedules, claims a firing
-- once, and reads counts-only headline numbers per kind. Service role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Fixtures in January 2020 so seed data never falls in the window.
insert into auth.users (id, email, created_at) values
  ('15200000-0000-4000-a000-000000000001', 'a@flow1520.test', '2020-01-03 10:00+00'),
  ('15200000-0000-4000-a000-000000000002', 'b@flow1520.test', '2020-01-04 10:00+00'),
  ('15200000-0000-4000-a000-000000000003', 'c@flow1520.test', '2020-02-04 10:00+00');
insert into public.profiles (id, full_name)
select ('15200000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name;
insert into public.user_sanctions (user_id, kind, created_at, starts_at)
values ('15200000-0000-4000-a000-000000000001', 'mute', '2020-01-05 10:00+00', '2020-01-05 10:00+00');
insert into public.account_deletions (user_id, requested_via, requested_at, status, completed_at) values
  ('15200000-0000-4000-a000-000000000001', 'app', '2020-01-06 10:00+00', 'done', '2020-01-07 10:00+00'),
  ('15200000-0000-4000-a000-000000000002', 'app', '2020-01-06 11:00+00', 'blocked', null);

select is((select count(*)::int from public.email_template_versions where template_key = 'scheduled_report'), 1,
  'the scheduled report email has a first version');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"15200000-0000-4000-a000-000000000003"}', true);
set local role authenticated;
select throws_ok($$select public.scheduled_reports_list()$$, '42501', null, 'readers and staff cannot list schedules');
select throws_ok($$select public.scheduled_report_summary('weekly_kpi', now(), now())$$, '42501', null,
  'or read the numbers');
reset role;

update public.export_schedules set recipients = '{}' where report_kind = 'quarterly_data_requests';
update public.export_schedules set enabled = false where report_kind = 'weekly_kpi';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is((select jsonb_agg(x ->> 'report_kind' order by x ->> 'report_kind') from jsonb_array_elements(public.scheduled_reports_list()) x),
  '["monthly_earnings", "weekly_safety"]'::jsonb, 'switched-off schedules and ones with no recipients are left out');

select is(public.claim_scheduled_report((select id from public.export_schedules where report_kind = 'weekly_safety'),
  '2026-11-30 08:00+00'), true, 'a firing is claimed once');
select is(public.claim_scheduled_report((select id from public.export_schedules where report_kind = 'weekly_safety'),
  '2026-11-30 08:00+00'), false, 'a second run cannot claim the same firing');
select is(public.claim_scheduled_report((select id from public.export_schedules where report_kind = 'weekly_safety'),
  '2026-11-23 08:00+00'), false, 'nor an older one');
select is(public.claim_scheduled_report((select id from public.export_schedules where report_kind = 'weekly_kpi'),
  '2026-11-30 07:00+00'), false, 'a switched-off schedule is never claimed');

select is(public.scheduled_report_summary('weekly_kpi', '2020-01-01 00:00+00', '2020-01-08 00:00+00') ->> 'signups', '2',
  'KPI sign-ups count accounts made in the window');
select is(public.scheduled_report_summary('weekly_safety', '2020-01-01 00:00+00', '2020-01-08 00:00+00') ->> 'sanctions', '1',
  'safety counts sanctions in the window');
select is(public.scheduled_report_summary('quarterly_data_requests', '2020-01-01 00:00+00', '2020-04-01 00:00+00')
  - 'reader_exports' - 'staff_personal_exports',
  '{"deletions_requested": 2, "deletions_done": 1, "deletions_blocked": 1}'::jsonb,
  'the data-request log counts deletions asked for, done and on hold');
select is(public.scheduled_report_summary('monthly_earnings', '2019-12-31 23:00+00', '2020-01-31 23:00+00') ->> 'cycle_status',
  'none', 'a month with no closed cycle says so');
reset role;

select * from finish();
rollback;
