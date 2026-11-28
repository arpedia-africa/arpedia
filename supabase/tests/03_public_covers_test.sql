-- Spec check 03-7, 05-7, 07-11: which covers the public cover route may serve.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values ('03070000-0000-4000-a000-000000000021', 'a@t0307.local');
insert into public.profiles (id, full_name, is_author) values ('03070000-0000-4000-a000-000000000021', 'Cover Author', true)
on conflict (id) do update set is_author = true;

-- Book n with one revision n. (book status, revision status, published)
create temporary table cases (n int, book public.book_status, rev public.revision_status, published boolean);
insert into cases values
  (1, 'live', 'live', true),            -- released
  (2, 'scheduled', 'scheduled', false), -- Coming soon
  (3, 'unpublished', 'unpublished', true),
  (4, 'draft', 'draft', false),
  (5, 'live', 'ready_for_review', false), -- an update in review of a live book
  (6, 'taken_down', 'taken_down', true),
  (7, 'rejected', 'rejected', false),
  (8, 'live', 'live', true),            -- held under a claim below
  (9, 'live', 'scheduled', false);      -- a scheduled update of a live book
insert into public.books (id, author_id, title, status)
select ('03070000-0000-4000-c000-00000000000' || n)::uuid, '03070000-0000-4000-a000-000000000021', 'Cover ' || n, book
from cases;
insert into public.book_revisions (id, book_id, revision_no, status, cover_key, published_at)
select ('03070000-0000-4000-d000-00000000000' || n)::uuid, ('03070000-0000-4000-c000-00000000000' || n)::uuid,
  case when n in (5, 9) then 2 else 1 end, rev, 'src/03070000-0000-4000-d000-00000000000' || n || '/cover',
  case when published then now() - interval '1 day' end
from cases;
update public.books set claim_hold_at = now() where id = '03070000-0000-4000-c000-000000000008';

create function pg_temp.k(n int) returns text language sql as $$
  select public.public_cover_key(('03070000-0000-4000-d000-00000000000' || n)::uuid)
$$;

select is(pg_temp.k(1), 'src/03070000-0000-4000-d000-000000000001/cover', 'a live book''s cover is public');
select is(pg_temp.k(2), 'src/03070000-0000-4000-d000-000000000002/cover', 'a scheduled (Coming soon) cover is public');
select is(pg_temp.k(3), 'src/03070000-0000-4000-d000-000000000003/cover', 'an unpublished book keeps its cover for owners');
select is(pg_temp.k(4), null, 'a draft cover stays private');
select is(pg_temp.k(5), null, 'a new revision in review stays private, even for a live book');
select is(pg_temp.k(6), null, 'a taken-down book''s cover is not served');
select is(pg_temp.k(7), null, 'a rejected book''s cover is not served');
select is(pg_temp.k(8), null, 'a book held under a copyright claim is not served');
select is(pg_temp.k(9), null, 'a scheduled update of a live book keeps its new cover private');
select is(public.public_cover_key('03070000-0000-4000-d000-0000000000ff'), null, 'an unknown revision is null');

select ok(not has_function_privilege('authenticated', 'public.public_cover_key(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.public_cover_key(uuid)', 'execute'),
  'only the service role (the Worker) can call it');

select * from finish();
rollback;
