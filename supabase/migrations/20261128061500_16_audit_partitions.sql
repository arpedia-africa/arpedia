-- Flow 16 data model (spec check 16-27, the rest): audit_log is partitioned by month on `at`.
-- The table is rebuilt once: the old one is renamed, a partitioned copy takes its name with the
-- same columns, defaults, checks, identity, indexes, triggers, policy and grants, every row moves
-- across with its id, and the old table is dropped. Callers keep using public.audit_log.
--   * Partitions live in the private schema `audit_parts` (no usage for anon, authenticated or
--     service_role), so they can only be read through public.audit_log and its RLS policy.
--   * The primary key becomes (id, at), as Postgres needs the partition key in it; ids still come
--     from one identity, so they stay unique.
--   * `audit_log_partitions` runs daily and keeps this month and the next 3 ready. A default
--     partition catches any row outside them (a back-dated or far-future `at`), so a write never
--     fails; a month whose rows already sit there is left to it (with a warning) rather than block.
--   * Still append-only: update and delete are refused on every partition (the row trigger is
--     cloned to each), truncate on the table; nobody but the database owner can reach a partition.

create schema if not exists audit_parts;
revoke all on schema audit_parts from public, anon, authenticated, service_role;

-- The rename takes an access exclusive lock that holds until the migration commits.
alter table public.audit_log rename to audit_log_old;
alter index public.audit_log_pkey rename to audit_log_old_pkey;
alter sequence public.audit_log_id_seq rename to audit_log_old_id_seq;

create table public.audit_log (
  like public.audit_log_old including defaults including constraints including identity,
  primary key (id, at)
) partition by range (at);

create table audit_parts.audit_log_default partition of public.audit_log default;

-- One month's partition (UTC months). False when it exists or its rows wait in the default.
create function public._audit_log_partition(p_month timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_from timestamptz := date_trunc('month', p_month at time zone 'utc') at time zone 'utc';
  v_to timestamptz := (date_trunc('month', p_month at time zone 'utc') + interval '1 month') at time zone 'utc';
  v_name text := 'audit_log_' || to_char(v_from at time zone 'utc', 'YYYY_MM');
begin
  if to_regclass('audit_parts.' || v_name) is not null then
    return false;
  end if;
  if exists (select 1 from audit_parts.audit_log_default where at >= v_from and at < v_to) then
    raise warning 'audit_log: rows for % stay in the default partition', v_name;
    return false;
  end if;
  execute format('create table audit_parts.%I partition of public.audit_log for values from (%L) to (%L)',
                 v_name, v_from, v_to);
  return true;
end $$;

-- This month and the next p_ahead. Returns how many partitions it made.
create function public.audit_log_partitions(p_ahead integer default 3) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int := 0;
begin
  for i in 0..greatest(p_ahead, 0) loop
    if public._audit_log_partition(now() + make_interval(months => i)) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Months the existing rows need, then this month and the next 3.
do $$
declare
  v_first timestamptz := (select min(at) from public.audit_log_old);
  m timestamptz;
begin
  m := date_trunc('month', coalesce(v_first, now()) at time zone 'utc') at time zone 'utc';
  while m < now() loop
    perform public._audit_log_partition(m);
    m := (m at time zone 'utc' + interval '1 month') at time zone 'utc';
  end loop;
  perform public.audit_log_partitions(3);
end $$;

-- Every row, with its id. Triggers are added after, so nothing is re-sent to analytics.
insert into public.audit_log overriding system value select * from public.audit_log_old;
select setval(pg_get_serial_sequence('public.audit_log', 'id'),
  greatest(coalesce((select max(id) from public.audit_log_old), 0),
           (select last_value from public.audit_log_old_id_seq)) + 1, false);

drop table public.audit_log_old;

create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_id_idx on public.audit_log (id);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index audit_log_object_idx on public.audit_log (object_type, object_id);
create index audit_log_area_idx on public.audit_log (area, at desc);

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.reject_change();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.reject_change();
create trigger audit_log_analytics after insert on public.audit_log
  for each row execute function public._audit_event();

alter table public.audit_log enable row level security;
-- Analyst and Operations admin see all, Finance only money (flow 16 rule 23).
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    (select public.is_staff_any(array['analyst', 'operations_admin']::public.staff_role[]))
    or (area = 'money' and (select public.is_staff('finance')))
  );

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
revoke insert, update, delete, truncate on public.audit_log from service_role;

revoke all on function public._audit_log_partition(timestamptz), public.audit_log_partitions(integer)
  from public, anon, authenticated, service_role;

select cron.schedule('audit_log_partitions', '20 1 * * *', 'select public.audit_log_partitions(3)');
