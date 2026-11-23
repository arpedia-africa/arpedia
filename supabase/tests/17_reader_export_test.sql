-- Flow 17 · reader self-export (found by the account journey): only the service role runs it, it holds
-- the reader's own rows and nobody else's, and device keys are left out. The export email has a link.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('17000000-0000-4000-a000-000000000001', 'reader17@test.local'),
  ('17000000-0000-4000-a000-000000000002', 'other17@test.local');
update public.profiles set full_name = 'Reader Seventeen' where id = '17000000-0000-4000-a000-000000000001';
insert into public.credit_ledger (user_id, delta, reason, bucket) values
  ('17000000-0000-4000-a000-000000000001', 50, 'top_up', 'topup'),
  ('17000000-0000-4000-a000-000000000002', 70, 'top_up', 'topup');
insert into public.user_devices (user_id, device_key, model) values
  ('17000000-0000-4000-a000-000000000001', 'secret-device-key-17', 'Tecno Spark');

-- Who may call it
set local role authenticated;
set local request.jwt.claims = '{"sub": "17000000-0000-4000-a000-000000000001", "role": "authenticated"}';
select throws_ok($$ select public.export_reader_data('17000000-0000-4000-a000-000000000001') $$, '42501',
  null, 'a signed-in reader cannot call it directly');
reset role;
set local role anon;
select throws_ok($$ select public.export_reader_data('17000000-0000-4000-a000-000000000001') $$, '42501',
  null, 'anon cannot call it');
reset role;

-- What it holds
create temp table x as select public.export_reader_data('17000000-0000-4000-a000-000000000001') as d;
select is((select d #>> '{account,email}' from x), 'reader17@test.local', 'account email');
select is((select d #>> '{profile,full_name}' from x), 'Reader Seventeen', 'profile');
select is((select jsonb_array_length(d -> 'credit_ledger') from x), 1, 'only the reader''s own ledger rows');
select is((select (d -> 'credit_ledger' -> 0 ->> 'delta')::int from x), 50, 'the reader''s top-up');
select ok((select not (d -> 'user_devices' -> 0 ? 'device_key') from x), 'device keys are left out');

select matches(
  (select body from public.email_template_versions where template_key = 'data_export_ready'
   order by number desc limit 1), '\{\{link\}\}', 'the export email carries the link');

select * from finish();
rollback;
