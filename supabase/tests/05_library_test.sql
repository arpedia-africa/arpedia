-- Flow 05 · get_library shelves, counts and pagination, save_book / unsave_book, set_library_view,
-- RLS on saved_books and the library_items view.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ─── Fixtures ───────────────────────────────────────────────────────────────
-- 1 reader, 2 another reader, 3 author.
insert into auth.users (id, email)
select ('50500000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow05.test' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('50500000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 3 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;

-- Books 1–8 by the author. 1–3, 5–7 live; 4 coming soon; 8 unpublished.
insert into public.books (id, author_id, title, genres, status)
select ('50500000-0000-4000-c000-00000000000' || n)::uuid, '50500000-0000-4000-a000-000000000003',
  'Book ' || chr(64 + n), '{Fiction}',
  (case n when 4 then 'scheduled' when 8 then 'unpublished' else 'live' end)::public.book_status
from generate_series(1, 8) n;
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  schedule_at)
select ('50500000-0000-4000-d000-00000000000' || n)::uuid, ('50500000-0000-4000-c000-00000000000' || n)::uuid, 1,
  (case n when 4 then 'scheduled' when 8 then 'unpublished' else 'live' end)::public.revision_status,
  10000, 40, 20, 10, case when n = 4 then now() + interval '20 days' end
from generate_series(1, 8) n;
update public.books b set current_revision_id = r.id from public.book_revisions r
where r.book_id = b.id and b.id::text like '50500000-%' and b.status <> 'scheduled';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, words_before, pages, price_credits) values
  ('50500000-0000-4000-d000-000000000001', '50500000-0000-4000-e000-000000000000', 0, 'One',   1000,    0,  4, 0),
  ('50500000-0000-4000-d000-000000000001', '50500000-0000-4000-e000-000000000001', 1, 'Two',   3000, 1000, 12, 6),
  ('50500000-0000-4000-d000-000000000001', '50500000-0000-4000-e000-000000000002', 2, 'Three', 6000, 4000, 24, 14);

-- Reader 1: reading Book A (30%, paid chapter Two: 6 credits), reading Book F at 94.9% (not finished),
-- finished Book E, owns Book B unopened (Saved), saved Book C and coming-soon Book D, saved Book H
-- before it was unpublished. Reader 2: reading Book G, saved Book C.
insert into public.reading_progress (user_id, book_id, percent, max_percent, chapter_ord, chapter_uid,
  finished_at, last_opened_at) values
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000001', 30, 30, 1,
   '50500000-0000-4000-e000-000000000001', null, now() - interval '1 hour'),
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000006', 94.9, 94.9, 0, null, null,
   now() - interval '2 hours'),
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000005', 100, 100, 0, null,
   now() - interval '3 days', now() - interval '3 days'),
  ('50500000-0000-4000-a000-000000000002', '50500000-0000-4000-c000-000000000007', 12, 12, 0, null, null, now());
insert into public.saved_books (user_id, book_id) values
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000003'),
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000004'),
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000008'),
  ('50500000-0000-4000-a000-000000000002', '50500000-0000-4000-c000-000000000003');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('50500000-0000-4000-a000-000000000001', 100, 'top_up', 'topup', 't5:g1');
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, idempotency_key, book_id, chapter_uid,
  author_id, author_earning_kobo)
values ('50500000-0000-4000-a000-000000000001', -6, 'chapter', 'topup', gen_random_uuid(), 't5:ch',
  '50500000-0000-4000-c000-000000000001', '50500000-0000-4000-e000-000000000001',
  '50500000-0000-4000-a000-000000000003', 960);
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source, ledger_id)
select user_id, book_id, 'chapter', chapter_uid, 'chapter', id from public.credit_ledger where idempotency_key = 't5:ch';
insert into public.entitlements (user_id, book_id, scope, source) values
  ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000002', 'book', 'gift');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
create function pg_temp.shelf(s text, srt text default 'last_opened') returns setof text
language sql as $$
  select x ->> 'title' from jsonb_array_elements(public.get_library(s, srt) -> 'items') with ordinality t(x, i)
  order by i
$$;
grant execute on function pg_temp.shelf(text, text) to authenticated;
create function pg_temp.item(s text, title text) returns jsonb
language sql as $$
  select x from jsonb_array_elements(public.get_library(s) -> 'items') x where x ->> 'title' = title
$$;
grant execute on function pg_temp.item(text, text) to authenticated;

set local role authenticated;
select pg_temp.as_user('50500000-0000-4000-a000-000000000001');

-- ─── Shelves and counts (rules 2–6) ────────────────────────────────────────
select results_eq($$select pg_temp.shelf('reading')$$, $$values ('Book A'), ('Book F')$$,
  'Reading: started, not finished, newest first; 94.9% is still Reading');
select results_eq($$select pg_temp.shelf('finished')$$, $$values ('Book E')$$, 'Finished: finished_at set');
select results_eq($$select pg_temp.shelf('saved', 'title')$$, $$values ('Book B'), ('Book C'), ('Book D')$$,
  'Saved: saves plus the owned unopened book; a bare save of an unpublished book is left out');
select is(public.get_library('reading') -> 'counts', '{"reading": 2, "saved": 3, "finished": 1}'::jsonb,
  'counts match what each shelf lists');

-- ─── Item fields ────────────────────────────────────────────────────────────
select is((pg_temp.item('reading', 'Book A') ->> 'paid_credits')::int, 6, 'paid for chapters');
select is((pg_temp.item('reading', 'Book A') ->> 'remaining_credits')::int, 14, 'left to pay = price − paid');
select is((pg_temp.item('reading', 'Book A') ->> 'chapter_ord')::int, 2, 'chapter number counts all chapters');
select is((pg_temp.item('reading', 'Book A') ->> 'words_left')::int, 7000, 'words left from percent');
select is((pg_temp.item('saved', 'Book B') ->> 'owns_book')::boolean, true, 'owned unopened book is owned');
select isnt(pg_temp.item('saved', 'Book D') ->> 'coming_soon_at', null, 'coming-soon book carries its date');

-- ─── Pagination (Server: cursor by sort key, book id) ──────────────────────
select is(jsonb_array_length(public.get_library('saved', 'title', null, 2) -> 'items'), 2, 'page of 2');
select results_eq(
  $$select x ->> 'title' from jsonb_array_elements(public.get_library('saved', 'title',
      public.get_library('saved', 'title', null, 2) -> 'next', 2) -> 'items') x$$,
  $$values ('Book D')$$, 'next page continues after the cursor');
select is(public.get_library('saved', 'title', public.get_library('saved', 'title', null, 2) -> 'next', 2) -> 'next',
  'null'::jsonb, 'last page has no cursor');

-- ─── save_book / unsave_book (rules 3, 23) ─────────────────────────────────
select lives_ok($$select public.save_book('50500000-0000-4000-c000-000000000005');
                  select public.save_book('50500000-0000-4000-c000-000000000005')$$, 'save_book twice');
select is((select count(*)::int from public.saved_books where book_id = '50500000-0000-4000-c000-000000000005'), 1,
  'save_book is idempotent');
select throws_ok($$select public.save_book('50500000-0000-4000-c000-000000000008')$$, 'P0001', 'not_available',
  'an unpublished book cannot be saved');
select public.unsave_book('50500000-0000-4000-c000-000000000002');
select ok(not ((pg_temp.item('saved', 'Book B')) is not null)
          and exists (select 1 from public.entitlements where book_id = '50500000-0000-4000-c000-000000000002'
                        and revoked_at is null),
  'Remove from Saved hides the owned unopened book and keeps the entitlement');

-- ─── set_library_view (rule 8) ─────────────────────────────────────────────
select public.set_library_view('list');
select is((select library_view from public.profiles where id = '50500000-0000-4000-a000-000000000001'), 'list',
  'library view saved on the profile');

-- ─── RLS and grants ────────────────────────────────────────────────────────
select is((select count(*)::int from public.saved_books where user_id <> '50500000-0000-4000-a000-000000000001'), 0,
  'saved_books: own rows only');
select is((select count(*)::int from public.library_items where book_id = '50500000-0000-4000-c000-000000000007'), 0,
  'library_items: no other reader''s rows');
select throws_ok($$insert into public.saved_books (user_id, book_id)
                   values ('50500000-0000-4000-a000-000000000001', '50500000-0000-4000-c000-000000000006')$$,
  '42501', null, 'clients cannot write saved_books directly');

select pg_temp.as_user('50500000-0000-4000-a000-000000000002');
select results_eq($$select pg_temp.shelf('reading')$$, $$values ('Book G')$$, 'reader 2 sees only their own');

select * from finish();
rollback;
