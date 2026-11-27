-- Flow 08 · Done when 9: two paid messages sent at the same time by one reader are serialised
-- (per-reader advisory lock), so both can never be charged against the same balance. A second
-- session (dblink) sends and keeps its transaction open; a send here by the same reader has to wait
-- for it (lock_timeout turns the wait into an error). Once the other session rolls back, the send
-- goes through and is charged once. Seed data only, left as it was. The login is the local
-- stack's default.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(9);

-- A seeded reader with an acknowledged paid thread with an author, and how to reach this database.
create temp table t_ctx on commit drop as
select m.user_id as reader, o.user_id as author, public._balance(m.user_id) as balance,
       (public._config('author_message_cost_credits'))::int as cost,
       '80800000-0000-4000-f000-000000000001'::uuid as other_id, '80800000-0000-4000-f000-000000000002'::uuid as here_id,
       format('host=%s port=%s dbname=%s user=postgres password=postgres',
              coalesce(host(inet_server_addr()), '127.0.0.1'), coalesce(inet_server_port(), 5432),
              current_database()) as conn
from public.group_members m
join public.groups g on g.id = m.group_id and g.kind = 'dm'
join public.group_members o on o.group_id = m.group_id and o.user_id <> m.user_id
join public.profiles p on p.id = o.user_id and p.is_author
where m.cost_ack_at is not null and m.banned_at is null
  and public._dm_block(m.user_id, o.user_id) is null and not public._is_new_account(m.user_id)
  and public._balance(m.user_id) >= 2 * (public._config('author_message_cost_credits'))::int
order by m.user_id, o.user_id
limit 1;

select is((select count(*)::int from t_ctx), 1, 'the seed has a reader with a paid thread and credits');
select is((select extensions.dblink_connect('c2', conn) from t_ctx), 'OK', 'a second session connects');
select extensions.dblink_exec('c2', 'begin');
select r.x from t_ctx, extensions.dblink('c2', format('select set_config(%L, %L, true)', 'request.jwt.claims',
  jsonb_build_object('sub', reader, 'role', 'authenticated')::text)) as r(x text);
select is((select (r.res::jsonb ->> 'balance')::int from t_ctx,
             extensions.dblink('c2', format('select public.send_author_message(%L, %L, %L)::text',
                                            author, other_id, 'Hello from the other session')) as r(res text)),
  (select balance - cost from t_ctx), 'the other session sends and keeps its transaction open');

select set_config('request.jwt.claims', jsonb_build_object('sub', reader, 'role', 'authenticated')::text, true)
from t_ctx;
set local lock_timeout = '300ms';
select throws_ok(
  (select format('select public.send_author_message(%L, %L, %L)', author, here_id, 'Hello') from t_ctx),
  '55P03', null, 'a second send by the same reader waits for the first');
select is((select count(*)::int from public.messages m, t_ctx where m.client_id = here_id), 0,
  'the waiting send wrote no message');

select extensions.dblink_exec('c2', 'rollback');
select is((select (public.send_author_message(author, here_id, 'Hello') ->> 'balance')::int from t_ctx),
  (select balance - cost from t_ctx), 'once the first send ends, the second is charged once on the real balance');
reset lock_timeout;
select is((select count(*)::int from public.credit_ledger, t_ctx
           where idempotency_key = 'u:' || reader || ':dm:' || here_id), 1, 'one ledger row for the send');
select is((select count(*)::int from public.messages m, t_ctx where m.client_id = other_id)
          + (select count(*)::int from public.credit_ledger, t_ctx
             where idempotency_key = 'u:' || reader || ':dm:' || other_id), 0,
  'the rolled-back send left no message and no charge');
select is(extensions.dblink_disconnect('c2'), 'OK', 'the second session closes');

select * from finish();
rollback;
