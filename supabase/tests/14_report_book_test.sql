-- Flow 14 · 14-15 (rule 33): the old book report RPC goes through create_report: copyright opens a
-- claim, a repeat and the daily limit are refused, an author can't report their own book.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- 1 author, 2 and 3 readers.
insert into auth.users (id, email)
select ('14150000-0000-4000-b000-00000000000' || n)::uuid, 'u' || n || '@flow1415.test'
from generate_series(1, 3) n;
insert into public.profiles (id, full_name)
select ('14150000-0000-4000-b000-00000000000' || n)::uuid, 'User ' || n
from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name;
insert into public.books (id, author_id, title, status) values
  ('14150000-0000-4000-c000-000000000001', '14150000-0000-4000-b000-000000000001', 'Report Book', 'live'),
  ('14150000-0000-4000-c000-000000000002', '14150000-0000-4000-b000-000000000001', 'Second Book', 'live');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set local role authenticated;
select pg_temp.as_user('14150000-0000-4000-b000-000000000002');
select isnt(public.report_book('14150000-0000-4000-c000-000000000001', 'copyright', 'This is my novel'), null,
  'a reader reports a book for copyright');
select throws_ok($$select public.report_book('14150000-0000-4000-c000-000000000001', 'abuse')$$,
  '23505', 'already_reported', 'the same book twice is refused');
select pg_temp.as_user('14150000-0000-4000-b000-000000000001');
select throws_ok($$select public.report_book('14150000-0000-4000-c000-000000000001', 'abuse')$$,
  '42501', 'own_content', 'an author cannot report their own book');
reset role;

select results_eq($$select reason::text, severity::text, snapshot ->> 'reason', snapshot ->> 'title', details
                    from public.reports where content_type = 'book'
                      and reporter_id = '14150000-0000-4000-b000-000000000002'$$,
  $$values ('copyright', 'medium', 'copyright', 'Report Book', 'This is my novel')$$,
  'the report has create_report severity and snapshot, and keeps the old reason');
select is((select count(*)::int from public.copyright_claims c join public.reports r on r.id = c.report_id
           where r.reporter_id = '14150000-0000-4000-b000-000000000002'
             and c.book_id = '14150000-0000-4000-c000-000000000001'), 1, 'copyright opens a claim');
select is((select eligible from public.reports where reporter_id = '14150000-0000-4000-b000-000000000002'), false,
  'a brand-new account''s report does not count toward auto-hide');

update public.automod_settings set value = '1' where key = 'reports_per_day';
set local role authenticated;
select pg_temp.as_user('14150000-0000-4000-b000-000000000002');
select throws_ok($$select public.report_book('14150000-0000-4000-c000-000000000002', 'wrong_content')$$,
  '54000', 'daily_limit', 'the daily report limit applies');
select pg_temp.as_user('14150000-0000-4000-b000-000000000003');
select isnt(public.report_book('14150000-0000-4000-c000-000000000002', 'wrong_content'), null,
  'another reader reports for wrong content');
reset role;
select results_eq($$select reason::text, details, snapshot ->> 'reason' from public.reports
                    where reporter_id = '14150000-0000-4000-b000-000000000003'$$,
  $$values ('other', 'Wrong content', 'wrong_content')$$, 'wrong content is an "other" report with its note');

select * from finish();
rollback;
