-- Flow 02 · spec check 02-17: the Coming soon entry (s-curation-coming) warns when a copyright
-- claim is open on the book. The console reads open claims as the signed-in staff member, so every
-- role that can open Discover curation must be able to read them (and only open ones count).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email)
select ('02170000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t0217.local' from generate_series(1, 4) n;
insert into public.profiles (id, full_name, is_author) values
  ('02170000-0000-4000-a000-000000000001', 'Coming Author', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
-- 2 super admin, 3 operations admin, 4 publisher: every role with curate_discover.
insert into public.staff_roles (user_id, role) values
  ('02170000-0000-4000-a000-000000000002', 'super_admin'),
  ('02170000-0000-4000-a000-000000000003', 'operations_admin'),
  ('02170000-0000-4000-a000-000000000004', 'publisher');
insert into public.books (id, author_id, title, status) values
  ('02170000-0000-4000-b000-000000000001', '02170000-0000-4000-a000-000000000001', 'Scheduled Book', 'scheduled'),
  ('02170000-0000-4000-b000-000000000002', '02170000-0000-4000-a000-000000000001', 'Cleared Book', 'scheduled');
insert into public.copyright_claims (book_id, claimant_name, status) values
  ('02170000-0000-4000-b000-000000000001', 'Paramount Books Ltd', 'new'),
  ('02170000-0000-4000-b000-000000000002', 'Old Claimant', 'rejected');

select is((select array_agg(role::text order by role::text) from public.role_permissions
           where permission = 'curate_discover'),
  array['operations_admin', 'publisher', 'super_admin'], 'curation is open to super admin, operations admin and publisher');

create function pg_temp.as_staff(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
grant execute on function pg_temp.as_staff(uuid) to authenticated;

-- The drawer's query: open claims on the scheduled books.
create function pg_temp.open_claims() returns text language sql as $$
  select string_agg(c.claimant_name, ', ' order by c.claimant_name) from public.copyright_claims c
  where c.book_id in ('02170000-0000-4000-b000-000000000001', '02170000-0000-4000-b000-000000000002')
    and c.status in ('new', 'waiting_on_author')
$$;
grant execute on function pg_temp.open_claims() to authenticated;

select pg_temp.as_staff('02170000-0000-4000-a000-000000000002');
select is(pg_temp.open_claims(), 'Paramount Books Ltd', 'a super admin sees the open claim');
select pg_temp.as_staff('02170000-0000-4000-a000-000000000003');
select is(pg_temp.open_claims(), 'Paramount Books Ltd', 'an operations admin sees the open claim');
select pg_temp.as_staff('02170000-0000-4000-a000-000000000004');
select is(pg_temp.open_claims(), 'Paramount Books Ltd', 'a publisher sees the open claim');
select is((select count(*)::int from public.copyright_claims
           where book_id = '02170000-0000-4000-b000-000000000002'), 1,
  'a closed claim is readable but not open, so it does not warn');
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', '02170000-0000-4000-a000-000000000004',
  'role', 'authenticated')::text, true);
set local role authenticated;
select is(pg_temp.open_claims(), null, 'without two-step, staff read no claims');
reset role;

select * from finish();
rollback;
