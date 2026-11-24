-- Flow 16 fix: plan price changes are two-person (rule 17). Finance proposes, a different Super admin
-- confirms with a fresh code; name-only edits save directly; one open change per plan.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('16100000-0000-4000-a000-000000000001', 'sa1-pp@arpedia.africa'),
  ('16100000-0000-4000-a000-000000000002', 'sa2-pp@arpedia.africa'),
  ('16100000-0000-4000-a000-000000000004', 'fin-pp@arpedia.africa');
insert into public.profiles (id, full_name) values
  ('16100000-0000-4000-a000-000000000001', 'Sa One'),
  ('16100000-0000-4000-a000-000000000002', 'Sa Two'),
  ('16100000-0000-4000-a000-000000000004', 'Fin')
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('16100000-0000-4000-a000-000000000001', 'super_admin'),
  ('16100000-0000-4000-a000-000000000002', 'super_admin'),
  ('16100000-0000-4000-a000-000000000004', 'finance');

create function pg_temp.as_user(uid text, age interval default '1 minute') returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '16100000-0000-4000-f000-' || right(uid, 12),
    'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
      'timestamp', extract(epoch from now() - age)::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text, interval) to authenticated;
create table pg_temp.ids (k text primary key, id uuid);
grant all on pg_temp.ids to authenticated;
create table pg_temp.was (price bigint, credits int, name text);
insert into pg_temp.was select (public._plan('monthly') ->> 'price_web_kobo')::bigint,
  (public._plan('monthly') ->> 'credits')::int, public._plan('monthly') ->> 'name';
grant all on pg_temp.was to authenticated;
-- The web price in force now (staff read the version table, as the console does).
create function pg_temp.cur() returns bigint language sql as $$
  select price_web_kobo from public.plan_price_versions where plan_code = 'monthly' and effective_from <= now()
  order by effective_from desc, id desc limit 1
$$;
grant execute on function pg_temp.cur() to authenticated;

set local role authenticated;

-- Finance: a name-only edit saves straight away.
select pg_temp.as_user('16100000-0000-4000-a000-000000000004');
select is(public.save_plan('monthly', 'Monthly plus', null, (select price from pg_temp.was),
  (select credits from pg_temp.was), 0, null) ->> 'name', 'Monthly plus', 'a name-only edit saves directly');

-- Finance proposes a higher web price: nothing changes yet.
insert into pg_temp.ids select 'r', (public.save_plan('monthly', 'Monthly plus', null,
  (select price from pg_temp.was) + 10000, (select credits from pg_temp.was), 0, null) ->> 'pending_request')::uuid;
select isnt((select id from pg_temp.ids where k = 'r'), null, 'a price change becomes an approval request');
select is(pg_temp.cur(), (select price from pg_temp.was),
  'the price is unchanged until a Super admin confirms');
select throws_ok($$select public.save_plan('monthly', 'Monthly plus', null, 120000, 300, 0, null)$$,
  'P0001', 'change_pending', 'one open change per plan');
select throws_ok(format($$select public.decide_approval(%L, true)$$, (select id from pg_temp.ids where k = 'r')),
  '42501', null, 'Finance cannot confirm');

-- A Super admin without a fresh code cannot confirm; with one, the price version is written.
select pg_temp.as_user('16100000-0000-4000-a000-000000000001', '30 minutes');
select throws_ok(format($$select public.decide_approval(%L, true)$$, (select id from pg_temp.ids where k = 'r')),
  '42501', null, 'confirming needs a fresh 2-step code');
select pg_temp.as_user('16100000-0000-4000-a000-000000000001');
select is((public.decide_approval((select id from pg_temp.ids where k = 'r'), true)).status, 'approved',
  'a Super admin confirms');
select is(pg_temp.cur(), (select price from pg_temp.was) + 10000,
  'the new price applies');
select is((select changed_by from public.plan_price_versions where plan_code = 'monthly'
           order by id desc limit 1), '16100000-0000-4000-a000-000000000004'::uuid,
  'written as the person who proposed it');

-- A Super admin's own price change waits for a second Super admin.
insert into pg_temp.ids select 's', (public.save_plan('monthly', 'Monthly plus', null,
  (select price from pg_temp.was) + 20000, (select credits from pg_temp.was), 0, null) ->> 'pending_request')::uuid;
select throws_ok(format($$select public.decide_approval(%L, true)$$, (select id from pg_temp.ids where k = 's')),
  'P0001', 'own_request', 'nobody confirms their own change');
select pg_temp.as_user('16100000-0000-4000-a000-000000000002');
select is((public.decide_approval((select id from pg_temp.ids where k = 's'), false, 'Too soon')).status,
  'rejected', 'a second Super admin can reject it');
select is(pg_temp.cur(), (select price from pg_temp.was) + 10000,
  'a rejected change writes nothing');

-- A change that fails the plan check is refused at once.
select pg_temp.as_user('16100000-0000-4000-a000-000000000004');
select throws_ok($$select public.save_plan('monthly', 'Monthly plus', null, 100, 300, 0, null)$$,
  'P0001', null, 'a price under the author rate is refused when proposed');
reset role;
select is((select count(*)::int from public.audit_log where action = 'approval.request'
           and object_label = 'price_change'), 2, 'both requests are in the audit log');

select * from finish();
rollback;
