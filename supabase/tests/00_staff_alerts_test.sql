-- Flow 00 · spec check 00-8: Staff alerts (s-staff-alerts). Each kind shows only for roles that can
-- open its page and only when switched on in My account (high-severity reports always); "new" is
-- since the last sign-in and the last Mark all read; non-staff and staff without two-step get nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- 1 reader, 2 moderator, 3 finance, 4 publisher, 5 super admin, 6 author.
insert into auth.users (id, email, last_sign_in_at)
select ('00800000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t0008.local', now() - interval '2 days'
from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author) values
  ('00800000-0000-4000-a000-000000000006', 'Alert Author', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('00800000-0000-4000-a000-000000000002', 'moderator'),
  ('00800000-0000-4000-a000-000000000003', 'finance'),
  ('00800000-0000-4000-a000-000000000004', 'publisher'),
  ('00800000-0000-4000-a000-000000000005', 'super_admin');
insert into public.books (id, author_id, title, status) values
  ('00800000-0000-4000-b000-000000000001', '00800000-0000-4000-a000-000000000006', 'Kano Nights', 'live');
insert into public.groups (id, kind, name, visibility) values
  ('00800000-0000-4000-d000-000000000001', 'room', 'Ruth of Ibadan, chapter 9', 'private');
insert into public.reports (id, content_type, content_id, group_id, reason, severity, due_at, created_at) values
  ('00800000-0000-4000-e000-000000000001', 'message', gen_random_uuid(), '00800000-0000-4000-d000-000000000001',
   'violence', 'high', now() + interval '1 hour', now() - interval '6 minutes'),
  ('00800000-0000-4000-e000-000000000002', 'message', gen_random_uuid(), '00800000-0000-4000-d000-000000000001',
   'spam', 'low', now() + interval '1 day', now() - interval '6 minutes');
insert into public.copyright_claims (id, book_id, claimant_name, status, created_at) values
  ('00800000-0000-4000-f000-000000000001', '00800000-0000-4000-b000-000000000001', 'Paramount Books Ltd', 'new',
   now() - interval '3 days');

create function pg_temp.as_staff(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
grant execute on function pg_temp.as_staff(uuid) to authenticated;
-- The alert lines a caller gets, as "kind href".
create function pg_temp.lines() returns text[] language sql as $$
  select coalesce(array_agg((e ->> 'kind') || ' ' || (e ->> 'href') order by e ->> 'kind', e ->> 'href'), '{}')
  from jsonb_array_elements(public.get_staff_alerts() -> 'items') e
$$;
grant execute on function pg_temp.lines() to authenticated;
create function pg_temp.mine() returns jsonb language sql as $$
  select e from jsonb_array_elements(public.get_staff_alerts() -> 'items') e
  where e ->> 'href' = '/reports/00800000-0000-4000-e000-000000000001'
$$;
grant execute on function pg_temp.mine() to authenticated;

-- Moderator: reports and claims, never payouts, applications or system health.
select pg_temp.as_staff('00800000-0000-4000-a000-000000000002');
select ok('high_severity_reports /reports/00800000-0000-4000-e000-000000000001' = any (pg_temp.lines()),
  'a moderator sees the open high-severity report');
select ok(not ('high_severity_reports /reports/00800000-0000-4000-e000-000000000002' = any (pg_temp.lines())),
  'but not a low-severity one');
select is(pg_temp.mine() ->> 'title', 'High-severity report: threat or violence in a reading room', 'report title');
select is(pg_temp.mine() ->> 'detail', 'Reading room "Ruth of Ibadan, chapter 9"', 'report detail names the room');
select ok('copyright_claims /claims/00800000-0000-4000-f000-000000000001' = any (pg_temp.lines()),
  'a moderator sees the new claim');
select ok(not exists (select 1 from unnest(pg_temp.lines()) l
                      where l like 'failed_payouts%' or l like 'applications_waiting%' or l like 'system_health%'),
  'and nothing from payouts, applications or system health');
select is((pg_temp.mine() ->> 'new')::boolean, true, 'it is new since sign-in');

-- Switching claims off hides them; high-severity reports can't be switched off.
reset role;
insert into public.staff_alert_prefs (user_id, kind, enabled) values
  ('00800000-0000-4000-a000-000000000002', 'copyright_claims', false),
  ('00800000-0000-4000-a000-000000000002', 'high_severity_reports', false);
select pg_temp.as_staff('00800000-0000-4000-a000-000000000002');
select ok(not exists (select 1 from unnest(pg_temp.lines()) l where l like 'copyright_claims%'),
  'claims switched off are hidden');
select ok('high_severity_reports /reports/00800000-0000-4000-e000-000000000001' = any (pg_temp.lines()),
  'high-severity reports always show');

-- Mark all read: nothing is new any more; the alert itself stays.
select lives_ok($$select public.mark_staff_alerts_read()$$, 'mark all read');
select is((public.get_staff_alerts() ->> 'new_count')::int, 0, 'nothing is new after Mark all read');
select is((pg_temp.mine() ->> 'new')::boolean, false, 'the alert stays, not new');
create temp table t_undo on commit drop as select public.mark_staff_alerts_read() as prev;
select is((select prev from t_undo), (select read_at from public.staff_alert_reads
                                       where user_id = '00800000-0000-4000-a000-000000000002'),
  'marking again returns the mark it replaced');
select public.mark_staff_alerts_read('-infinity');
select is((pg_temp.mine() ->> 'new')::boolean, true, 'Undo back to before: new again since sign-in');

-- Publisher: applications, no reports or claims.
select pg_temp.as_staff('00800000-0000-4000-a000-000000000004');
select ok(not exists (select 1 from unnest(pg_temp.lines()) l
                      where l like 'high_severity_reports%' or l like 'copyright_claims%' or l like 'failed_payouts%'),
  'a publisher sees no reports, claims or payouts');

-- Super admin: everything their switches allow.
select pg_temp.as_staff('00800000-0000-4000-a000-000000000005');
select ok('high_severity_reports /reports/00800000-0000-4000-e000-000000000001' = any (pg_temp.lines())
          and 'copyright_claims /claims/00800000-0000-4000-f000-000000000001' = any (pg_temp.lines()),
  'a super admin sees reports and claims');

-- A reader, and staff without two-step, are refused.
select set_config('request.jwt.claims', jsonb_build_object('sub', '00800000-0000-4000-a000-000000000001',
  'role', 'authenticated', 'aal', 'aal2')::text, true);
select throws_ok($$select public.get_staff_alerts()$$, '42501', null, 'a reader gets no staff alerts');
select set_config('request.jwt.claims', jsonb_build_object('sub', '00800000-0000-4000-a000-000000000002',
  'role', 'authenticated')::text, true);
select throws_ok($$select public.get_staff_alerts()$$, '42501', null, 'staff without two-step get none');
reset role;

select * from finish();
rollback;
