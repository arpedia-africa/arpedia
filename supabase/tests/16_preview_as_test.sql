-- Flow 16 · spec check 16-25: Preview as. Only a Super admin may preview another role; the answer is
-- that role's permissions (its sidebar) and every preview is audited.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('16250000-0000-4000-a000-000000000001', 'sa@flow1625.test'),
  ('16250000-0000-4000-a000-000000000002', 'fin@flow1625.test');
insert into public.profiles (id, full_name) values
  ('16250000-0000-4000-a000-000000000001', 'Preview Super'),
  ('16250000-0000-4000-a000-000000000002', 'Preview Finance')
on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('16250000-0000-4000-a000-000000000001', 'super_admin'),
  ('16250000-0000-4000-a000-000000000002', 'finance');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"16250000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select is(public.staff_preview_as('publisher') -> 'permissions',
  (select coalesce(jsonb_agg(permission order by permission), '[]') from public.role_permissions where role = 'publisher'),
  'a Super admin gets the Publisher sidebar permissions');
select is((select concat_ws(' | ', actor_name, actor_role, area, action, object_id) from public.audit_log
           where action = 'staff.preview_as' and actor_id = '16250000-0000-4000-a000-000000000001'),
  'Preview Super | super_admin | team | staff.preview_as | publisher', 'the preview is audited');
select is(public.staff_preview_as('finance') ->> 'role', 'finance', 'any other role can be previewed');
select throws_ok($$select public.staff_preview_as('super_admin')$$, '22023', 'bad_role',
  'previewing Super admin itself is refused');

select set_config('request.jwt.claims', '{"sub":"16250000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.staff_preview_as('publisher')$$, '42501', null, 'Finance cannot preview');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
reset role;
set local role anon;
select throws_ok($$select public.staff_preview_as('publisher')$$, '42501', null, 'signed-out callers cannot');
reset role;

select * from finish();
rollback;
