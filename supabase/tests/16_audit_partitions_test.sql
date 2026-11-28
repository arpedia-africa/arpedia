-- Flow 16 data model (spec check 16-27): audit_log is partitioned by month and still append-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select is((select relkind::text from pg_class where oid = 'public.audit_log'::regclass), 'p',
  'audit_log is partitioned');
select is((select count(*)::int from generate_series(0, 3) i
           where to_regclass('audit_parts.audit_log_'
                             || to_char(now() at time zone 'utc' + make_interval(months => i), 'YYYY_MM')) is not null),
  4, 'this month and the next 3 have partitions');
select is(public.audit_log_partitions(3), 0, 'running the job again makes nothing new');
select ok(exists (select 1 from cron.job where jobname = 'audit_log_partitions'), 'the job runs daily');

select set_config('t.before', coalesce((select max(id) from public.audit_log), 0)::text, true);
insert into public.audit_log (area, action, summary) values ('trust', 't16-part-now', 'now');
insert into public.audit_log (at, area, action, summary) values ('2001-01-15', 'trust', 't16-part-old', 'old');

select is((select tableoid::regclass::text from public.audit_log where action = 't16-part-now'),
  'audit_parts.audit_log_' || to_char(now() at time zone 'utc', 'YYYY_MM'), 'a new entry lands in this month');
select is((select tableoid::regclass::text from public.audit_log where action = 't16-part-old'),
  'audit_parts.audit_log_default', 'an entry outside every month lands in the default');
select ok((select id from public.audit_log where action = 't16-part-now') > current_setting('t.before')::bigint,
  'ids carry on from the old table');
select is(public._audit_log_partition('2001-01-01'), false,
  'a month whose rows sit in the default is left alone');

select throws_ok($$update public.audit_log set summary = 'x' where action = 't16-part-now'$$, '42501', null,
  'entries cannot be changed');
select throws_ok($$delete from public.audit_log where action = 't16-part-now'$$, '42501', null,
  'entries cannot be deleted');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'the log cannot be truncated');

select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'RLS is on');
select ok(not has_schema_privilege('authenticated', 'audit_parts', 'usage')
          and not has_schema_privilege('anon', 'audit_parts', 'usage'),
  'partitions are reachable only through audit_log');

-- A reader sees nothing through the table.
insert into auth.users (id, email) values ('16270000-0000-4000-a000-000000000001', 'reader@flow16parts.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16270000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.audit_log), 0, 'a reader reads no entries');
reset role;

select * from finish();
rollback;
