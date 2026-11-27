-- Flow 03 · Done when 7: two spends by one reader at the same time are serialised (per-reader
-- advisory lock), so they can never both read the same balance. A second session (dblink) spends
-- and keeps its transaction open; a spend here by the same reader has to wait for it (lock_timeout
-- turns the wait into an error), a spend by another reader does not. The second session rolls
-- back, so the seed data is left as it was. The login is the local stack's default.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(8);

-- Two seeded readers with credits, and how to reach this database from a second session.
create temp table t_ctx on commit drop as
select
  (select user_id from public.credit_ledger group by user_id having sum(delta) >= 5 order by user_id limit 1) as a,
  (select user_id from public.credit_ledger group by user_id having sum(delta) >= 5 order by user_id
   offset 1 limit 1) as b,
  format('host=%s port=%s dbname=%s user=postgres password=postgres',
         coalesce(host(inet_server_addr()), '127.0.0.1'), coalesce(inet_server_port(), 5432),
         current_database()) as conn;
create temp table t_before on commit drop as
select public.credit_balance(a) as balance from t_ctx;

select is((select extensions.dblink_connect('c2', conn) from t_ctx), 'OK', 'a second session connects');
select extensions.dblink_exec('c2', 'begin');
select is((select (r.res::jsonb ->> 'balance')::int from t_ctx,
             extensions.dblink('c2', format('select public.spend_credits(%L, 2, %L, null, null, null, %L)::text',
                                            a, 'tip', 'concurrency-other')) as r(res text)),
  (select balance - 2 from t_before), 'the other session spends and keeps its transaction open');

set local lock_timeout = '300ms';
select throws_ok(
  format('select public.spend_credits(%L, 2, %L, null, null, null, %L)', (select a from t_ctx), 'tip', 'concurrency-here'),
  '55P03', null, 'a second spend by the same reader waits for the first');
select is((select count(*)::int from public.credit_ledger, t_ctx
           where idempotency_key = 'u:' || a || ':concurrency-here'), 0, 'the waiting spend wrote nothing');
select lives_ok(
  format('select public.spend_credits(%L, 1, %L, null, null, null, %L)', (select b from t_ctx), 'tip', 'concurrency-b'),
  'another reader does not wait');

select extensions.dblink_exec('c2', 'rollback');
select is((public.spend_credits((select a from t_ctx), 2, 'tip', null, null, null, 'concurrency-here') ->> 'balance')::int,
  (select balance - 2 from t_before), 'once the first spend ends, the second goes through on the real balance');
reset lock_timeout;
select is((select count(*)::int from public.credit_ledger, t_ctx
           where idempotency_key = 'u:' || a || ':concurrency-other'), 0, 'the rolled-back spend left no ledger row');
select is(extensions.dblink_disconnect('c2'), 'OK', 'the second session closes');

select * from finish();
rollback;
