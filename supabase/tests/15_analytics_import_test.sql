-- Flow 15 fix 15-21 (rule 26; Server: analytics-import): installs and signups by source imported
-- nightly by the api Worker, saved only by the service role, read by staff with view_analytics.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('15210000-0000-4000-a000-000000000001', 'imp-staff@test.local'),
  ('15210000-0000-4000-a000-000000000002', 'imp-reader@test.local');
insert into public.profiles (id, full_name) values
  ('15210000-0000-4000-a000-000000000001', 'Import Staff'),
  ('15210000-0000-4000-a000-000000000002', 'Import Reader')
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values ('15210000-0000-4000-a000-000000000001', 'super_admin');

delete from public.analytics_imports;

-- ─── Saving (service role only) ──────────────────────────────────────────────
set local role service_role;
select is(public.analytics_import_save('installs', '2026-11-01', '2026-11-03',
  '[{"day": "2026-11-01", "value": 40}, {"day": "2026-11-02", "value": 60}, {"day": "2026-11-03", "value": 2}]'),
  3, 'installs for three days saved');
select is(public.analytics_import_save('installs', '2026-11-03', '2026-11-03', '[{"day": "2026-11-03", "value": 7}]'),
  1, 'a restated day replaces the earlier number');
select is(public.analytics_import_save('installs', '2026-10-01', '2026-10-31',
  '[{"day": "2026-10-20", "value": 30}, {"day": "2026-10-31", "value": 20}]'), 2, 'the month before saved');
select is(public.analytics_import_save('signups_by_source', '2026-11-01', '2026-11-03',
  '[{"day": "2026-11-01", "dim": {"source": "instagram"}, "value": 12},
    {"day": "2026-11-02", "dim": {"source": "instagram"}, "value": 3},
    {"day": "2026-11-02", "dim": {"source": "book_link"}, "value": 6},
    {"day": "2026-11-02", "dim": {"source": "church"}, "value": 2},
    {"day": "2026-11-03", "dim": {"source": "unknown"}, "value": 9}]'), 5, 'signups by source saved');
select throws_ok($$select public.analytics_import_save('signups_by_source', '2026-11-01', '2026-11-03',
  '[{"day": "2026-11-01", "dim": {"source": "tiktok"}, "value": 1}]')$$, '22023', null, 'an unknown source is refused');
select throws_ok($$select public.analytics_import_save('signups_by_source', '2026-11-01', '2026-11-03',
  '[{"day": "2026-11-01", "dim": {}, "value": 1}]')$$, '22023', null, 'a signup row without a source is refused');
select throws_ok($$select public.analytics_import_save('installs', '2026-11-01', '2026-11-03',
  '[{"day": "2026-11-09", "value": 1}]')$$, '22023', null, 'a day outside the range is refused');
select throws_ok($$select public.analytics_import_save('installs', '2026-01-01', '2026-11-03', '[]')$$,
  '22023', null, 'more than 100 days is refused');
reset role;

select is((select value from public.analytics_imports where metric = 'installs' and day = '2026-11-03'), 7::numeric,
  'one row per day: the last import wins');

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '15210000-0000-4000-a000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok($$select public.analytics_import_save('installs', '2026-11-01', '2026-11-01', '[]')$$,
  '42501', null, 'readers cannot save imports');
select throws_ok($$select * from public.analytics_imports$$, '42501', null, 'nor read the table');
select throws_ok($$select public.staff_analytics_imports('2026-11-01', '2026-11-03')$$, '42501', null,
  'nor read the growth numbers');

reset role;

-- ─── Reading (staff with view_analytics) ─────────────────────────────────────
create function pg_temp.as_staff() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', '15210000-0000-4000-a000-000000000001', 'role', 'authenticated',
    'session_id', '15210000-0000-4000-f000-000000000001', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_staff() to authenticated;
create table pg_temp.r (j jsonb);
grant all on pg_temp.r to authenticated;
set local role authenticated;
select pg_temp.as_staff();
insert into pg_temp.r select public.staff_analytics_imports('2026-11-01', '2026-11-03');
reset role;

select is((select j - 'imported_at' - 'sources' from pg_temp.r),
  '{"installs": 107, "installs_previous": 20, "installs_through": "2026-11-03"}'::jsonb,
  'installs in the period, the same length before (30 Oct to 31 Oct), and the last day covered');
select is((select j -> 'sources' from pg_temp.r),
  '[{"source": "instagram", "signups": 15, "share": 46.9}, {"source": "unknown", "signups": 9, "share": 28.1},
    {"source": "book_link", "signups": 6, "share": 18.8}, {"source": "church", "signups": null, "share": null}]'::jsonb,
  'signups by source, largest first; under 5 hidden');

select * from finish();
rollback;
