-- Spec check 16-26: the access token hook adds `staff_role` for active staff only, read live, and
-- never touches Auth's own claims. Only Supabase Auth may call it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('16260000-0000-4000-a000-000000000001', 'hook-mod@arpedia.africa'),
  ('16260000-0000-4000-a000-000000000002', 'hook-reader@test.local');
insert into public.staff_roles (user_id, role) values ('16260000-0000-4000-a000-000000000001', 'moderator');

create function pg_temp.ev(uid text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('user_id', uid, 'authentication_method', 'password',
    'claims', jsonb_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1') || extra)
$$;

select is(public.custom_access_token_hook(pg_temp.ev('16260000-0000-4000-a000-000000000001')) -> 'claims' ->> 'staff_role',
  'moderator', 'active staff get their role');
select is(public.custom_access_token_hook(pg_temp.ev('16260000-0000-4000-a000-000000000001')) -> 'claims' ->> 'aal',
  'aal1', 'Auth''s own aal is left as it is');
select ok(not (public.custom_access_token_hook(pg_temp.ev('16260000-0000-4000-a000-000000000002')) -> 'claims' ? 'staff_role'),
  'a reader gets no staff_role');
select ok(not (public.custom_access_token_hook(pg_temp.ev('16260000-0000-4000-a000-000000000002', '{"staff_role":"super_admin"}'))
  -> 'claims' ? 'staff_role'), 'a staff_role a reader''s token should not carry is dropped');

update public.staff_roles set active = false where user_id = '16260000-0000-4000-a000-000000000001';
select ok(not (public.custom_access_token_hook(pg_temp.ev('16260000-0000-4000-a000-000000000001', '{"staff_role":"moderator"}'))
  -> 'claims' ? 'staff_role'), 'deactivated staff lose the claim at the next refresh');

select is(public.custom_access_token_hook('{"user_id":"not-a-uuid","claims":{"sub":"x"}}'),
  '{"user_id":"not-a-uuid","claims":{"sub":"x"}}'::jsonb, 'a bad event is returned unchanged, never an error');

select ok(not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute')
          and has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'only Supabase Auth can call it');

select * from finish();
rollback;
