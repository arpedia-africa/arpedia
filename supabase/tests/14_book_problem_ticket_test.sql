-- Flow 14 · 14-17: "Report a problem with this book" opens a Book access support ticket with the
-- book and place attached (rule 2), not a conduct report; create_support_ticket's daily limit applies.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- 1 reader, 2 author.
insert into auth.users (id, email)
select ('14170000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1417.test' from generate_series(1, 2) n;
insert into public.profiles (id, full_name, is_author)
select ('14170000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 2 from generate_series(1, 2) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, genres, status) values
  ('14170000-0000-4000-c000-000000000001', '14170000-0000-4000-a000-000000000002', 'Broken Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord, preview_cut_para_id, preview_cut_chapter_uid)
values ('14170000-0000-4000-d000-000000000001', '14170000-0000-4000-c000-000000000001', 1, 'live', 1000, 4, 2,
  10, 0, 'c0p0', '14170000-0000-4000-e000-000000000000');
update public.books set current_revision_id = '14170000-0000-4000-d000-000000000001'
where id = '14170000-0000-4000-c000-000000000001';

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set local role authenticated;
select pg_temp.as_user('14170000-0000-4000-a000-000000000001');
select lives_ok($$select public.report_book_problem('14170000-0000-4000-c000-000000000001',
  '14170000-0000-4000-d000-000000000001', '14170000-0000-4000-e000-000000000000', 'epubcfi(/6/2)',
  'Chapter two is missing')$$, 'a reader reports a problem');
reset role;

select results_eq($$select category::text, subject, channel::text, book_id, context ->> 'chapter_uid',
                           context ->> 'cfi', status::text
                    from public.support_tickets where user_id = '14170000-0000-4000-a000-000000000001'$$,
  $$values ('book_access', 'Problem in Broken Book', 'app', '14170000-0000-4000-c000-000000000001'::uuid,
            '14170000-0000-4000-e000-000000000000', 'epubcfi(/6/2)', 'open')$$,
  'it is a Book access ticket with the book and place');
select is((select m.body from public.ticket_messages m join public.support_tickets t on t.id = m.ticket_id
           where t.user_id = '14170000-0000-4000-a000-000000000001' and m.kind = 'reader'),
  'Chapter two is missing', 'the reader''s note is the first message');
select is((select count(*)::int from public.reports where reporter_id = '14170000-0000-4000-a000-000000000001'),
  0, 'no conduct report is made');

set local role authenticated;
select pg_temp.as_user('14170000-0000-4000-a000-000000000001');
select isnt(public.report_book_problem('14170000-0000-4000-c000-000000000001',
  '14170000-0000-4000-d000-000000000001', null, '', null), null, 'it returns the ticket id');
reset role;
select is((select m.body from public.ticket_messages m join public.support_tickets t on t.id = m.ticket_id
           where t.user_id = '14170000-0000-4000-a000-000000000001' and t.context ->> 'chapter_uid' is null),
  'Something is wrong in this book. The reader added no details.', 'no note still says what happened');

-- The daily ticket limit (10) applies.
insert into public.support_tickets (user_id, email, channel, category, subject)
select '14170000-0000-4000-a000-000000000001', 'u1@flow1417.test', 'app', 'other', 'filler ' || n
from generate_series(1, 8) n;
set local role authenticated;
select pg_temp.as_user('14170000-0000-4000-a000-000000000001');
select throws_ok($$select public.report_book_problem('14170000-0000-4000-c000-000000000001',
  '14170000-0000-4000-d000-000000000001', null, '', 'again')$$, '54000', 'daily_limit', 'the daily limit applies');
select throws_ok($$select public.report_book_problem('14170000-0000-4000-c000-00000000dead',
  '14170000-0000-4000-d000-000000000001', null, '', 'x')$$, 'P0001', 'not_found', 'an unknown book is refused');
reset role;

select * from finish();
rollback;
