-- Flow 12 · spec check 12-14: an Operations admin retries a stuck processing job from Books ·
-- Processing. Only after 10 minutes with no new step; the current stage is sent again for the
-- same generation, and the retry is audited.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- 1 author, 2 operations admin, 3 moderator.
insert into auth.users (id, email)
select ('12e00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t12e.local' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('12e00000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 1 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('12e00000-0000-4000-a000-000000000002', 'operations_admin'),
  ('12e00000-0000-4000-a000-000000000003', 'moderator');

insert into public.books (id, author_id, title, genres, status) values
  ('12e00000-0000-4000-c000-000000000001', '12e00000-0000-4000-a000-000000000001', 'Stuck Book', '{Fiction}', 'draft'),
  ('12e00000-0000-4000-c000-000000000002', '12e00000-0000-4000-a000-000000000001', 'Busy Book', '{Fiction}', 'draft'),
  ('12e00000-0000-4000-c000-000000000003', '12e00000-0000-4000-a000-000000000001', 'Sealing Book', '{Fiction}', 'draft');
insert into public.book_revisions (id, book_id, revision_no, status, draft_step, generation, steps) values
  ('12e00000-0000-4000-d000-000000000001', '12e00000-0000-4000-c000-000000000001', 1, 'processing', 'checking', 3,
   jsonb_build_object('received', now() - interval '40 minutes', 'converted', now() - interval '25 minutes')),
  ('12e00000-0000-4000-d000-000000000002', '12e00000-0000-4000-c000-000000000002', 1, 'processing', 'checking', 1,
   jsonb_build_object('received', now() - interval '2 minutes')),
  ('12e00000-0000-4000-d000-000000000003', '12e00000-0000-4000-c000-000000000003', 1, 'processing', null, 5,
   jsonb_build_object('received', now() - interval '3 hours', 'author_confirms', now() - interval '20 minutes'));

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.as_owner() to authenticated;
create function pg_temp.msgs(rev text) returns setof jsonb language sql as $$
  select message - 'revision_id' from pgmq.q_book_verify where message ->> 'revision_id' = rev order by msg_id
$$;

select pg_temp.as_user('12e00000-0000-4000-a000-000000000003');
select throws_ok($$select public.staff_retry_revision('12e00000-0000-4000-d000-000000000001')$$,
  '42501', null, 'a moderator cannot retry a job');

select pg_temp.as_user('12e00000-0000-4000-a000-000000000002');
select throws_ok($$select public.staff_retry_revision('12e00000-0000-4000-d000-000000000002')$$,
  'P0001', 'not_stuck', 'a job that moved in the last 10 minutes is not retried');
select is(public.staff_retry_revision('12e00000-0000-4000-d000-000000000001'),
  '{"stage": "verify", "generation": 3}'::jsonb, 'a stuck check is retried at the verify stage');
select is(public.staff_retry_revision('12e00000-0000-4000-d000-000000000003'),
  '{"stage": "seal", "generation": 5}'::jsonb, 'a stuck seal is retried at the seal stage');

select pg_temp.as_owner();
select results_eq($$select * from pg_temp.msgs('12e00000-0000-4000-d000-000000000001')$$,
  $$values ('{"stage": "verify", "generation": 3}'::jsonb)$$, 'the verify message is sent again, same generation');
select results_eq($$select * from pg_temp.msgs('12e00000-0000-4000-d000-000000000003')$$,
  $$values ('{"stage": "seal", "generation": 5}'::jsonb)$$, 'the seal message is sent again, same generation');
select is((select generation from public.book_revisions where id = '12e00000-0000-4000-d000-000000000001'), 3,
  'the generation is unchanged, so a run still going is harmless');
select is((select count(*)::int from public.audit_log where action = 'book.retry_job'
           and actor_id = '12e00000-0000-4000-a000-000000000002'), 2, 'each retry is audited');
select is((select count(*)::int from pgmq.q_book_verify
           where message ->> 'revision_id' = '12e00000-0000-4000-d000-000000000002'), 0, 'nothing sent for the busy job');

-- Not processing any more: nothing to retry.
update public.book_revisions set status = 'needs_fixes' where id = '12e00000-0000-4000-d000-000000000001';
update public.book_revisions set sealed_generation = 5 where id = '12e00000-0000-4000-d000-000000000003';
select pg_temp.as_user('12e00000-0000-4000-a000-000000000002');
select throws_ok($$select public.staff_retry_revision('12e00000-0000-4000-d000-000000000001')$$,
  'P0001', 'not_processing', 'a job that left processing is not retried');
select throws_ok($$select public.staff_retry_revision('12e00000-0000-4000-d000-000000000003')$$,
  'P0001', 'nothing_to_retry', 'a revision already sealed for this generation has nothing to retry');

select * from finish();
rollback;
