-- Flow 16 · 16-27 (place half): audit entries keep the city and country the console forwards
-- (x-client-city, x-client-country), list_audit returns the city, and anything odd is dropped
-- without failing the action.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select set_config('request.headers', json_build_object(
  'x-client-ip', '105.112.34.18', 'x-client-city', 'Lagos', 'x-client-country', 'ng')::text, true);
select public.write_audit('settings', 'test.place', 'thing', '1');
select is((select concat_ws(' | ', host(ip), city, country) from public.audit_log where action = 'test.place'),
  '105.112.34.18 | Lagos | NG', 'city and country are kept beside the address');

-- No place forwarded (the app, the desk CLI, older console builds): none kept.
select set_config('request.headers', json_build_object('cf-connecting-ip', '41.58.2.3')::text, true);
select public.write_audit('settings', 'test.noplace', 'thing', '2');
select is((select coalesce(city, 'none') || ' ' || coalesce(country, 'none') from public.audit_log
           where action = 'test.noplace'), 'none none', 'no headers, no place');

-- A country that is not a two-letter code is dropped; a long city is cut; control characters go.
select set_config('request.headers', json_build_object(
  'x-client-city', repeat('a', 100) || E'\n', 'x-client-country', 'Nigeria')::text, true);
select lives_ok($$ select public.write_audit('settings', 'test.badplace', 'thing', '3') $$,
  'a bad place never fails the action');
select is((select char_length(city) from public.audit_log where action = 'test.badplace'), 80, 'the city is capped');
select is((select country from public.audit_log where action = 'test.badplace'), null, 'a bad country is dropped');

-- list_audit (as a staff member who may read the log) returns the city.
insert into auth.users (id, email) values ('16270000-0000-4000-a000-000000000001', 'ops@flow1627.test');
insert into public.staff_roles (user_id, role) values ('16270000-0000-4000-a000-000000000001', 'operations_admin');
-- has_permission needs a two-step in the last 12 hours.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '16270000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
         'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true);
set local role authenticated;
select is((select r ->> 'city' from jsonb_array_elements(public.list_audit(p_q => 'test.place') -> 'rows') r
           where r ->> 'action' = 'test.place'), 'Lagos', 'list_audit returns the city');
select is((public.get_audit_entry((select id from public.audit_log where action = 'test.place')) ->> 'country'), 'NG',
  'the entry returns the country');
reset role;

select * from finish();
rollback;
