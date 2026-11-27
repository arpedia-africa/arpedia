-- Flow 12 · spec check 12-3: the verify Worker records how the plagiarism and content-policy checks
-- went. A check that timed out or failed alerts Operations admin; one with no provider does not.
-- Results for an old generation, or once the revision left processing, are ignored.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('12d00000-0000-4000-a000-000000000001', 'a@t12d.local');
insert into public.profiles (id, full_name, is_author) values ('12d00000-0000-4000-a000-000000000001', 'Author', true)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, genres, status) values
  ('12d00000-0000-4000-c000-000000000001', '12d00000-0000-4000-a000-000000000001', 'Checked Book', '{Fiction}', 'draft');
insert into public.book_revisions (id, book_id, revision_no, status, draft_step, generation) values
  ('12d00000-0000-4000-d000-000000000001', '12d00000-0000-4000-c000-000000000001', 1, 'processing', 'checking', 2);

create function pg_temp.alerts() returns int language sql as $$
  select count(*)::int from pgmq.q_book_notify
  where message ->> 'kind' = 'screening_skipped' and message ->> 'revision_id' = '12d00000-0000-4000-d000-000000000001'
$$;

select throws_ok($$select public.record_screening('12d00000-0000-4000-d000-000000000001', 2, '{}')$$,
  '42501', null, 'only the Worker (service role) records checks');

select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.record_screening('12d00000-0000-4000-d000-000000000001', 2,
  '{"plagiarism": {"status": "skipped", "reason": "not_configured"}, "policy": {"status": "ok"}}'),
  'the Worker records the checks');
select ok(not public.record_screening('12d00000-0000-4000-d000-000000000001', 1,
  '{"plagiarism": {"status": "ok"}, "policy": {"status": "ok"}}'), 'an old generation is ignored');
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select results_eq($$select screening -> 'plagiarism', screening -> 'policy', (screening ->> 'generation')::int
                    from public.book_revisions where id = '12d00000-0000-4000-d000-000000000001'$$,
  $$values ('{"status": "skipped", "reason": "not_configured"}'::jsonb, '{"status": "ok"}'::jsonb, 2)$$,
  'the revision keeps how each check went');
select is(pg_temp.alerts(), 0, 'no alert when a check simply has no provider');

select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(public.record_screening('12d00000-0000-4000-d000-000000000001', 2,
  '{"plagiarism": {"status": "skipped", "reason": "not_configured"}, "policy": {"status": "skipped", "reason": "timeout"}}'),
  'a timed-out check is recorded');
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);
select results_eq($$select message -> 'checks', message ->> 'role', message ->> 'book_id' from pgmq.q_book_notify
                    where message ->> 'kind' = 'screening_skipped'
                      and message ->> 'revision_id' = '12d00000-0000-4000-d000-000000000001'$$,
  $$values ('["policy"]'::jsonb, 'operations_admin', '12d00000-0000-4000-c000-000000000001')$$,
  'a timed-out check alerts Operations admin, naming the check');

update public.book_revisions set status = 'draft', draft_step = 'chapters'
where id = '12d00000-0000-4000-d000-000000000001';
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(not public.record_screening('12d00000-0000-4000-d000-000000000001', 2, '{}'),
  'nothing is recorded once the revision left processing');
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select * from finish();
rollback;
