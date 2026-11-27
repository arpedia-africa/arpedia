-- Spec check 03-16 · flow 03 admin rule 1, flow 12 rule 41: staff Edit details and Replace cover
-- create a new revision that reuses the live files and goes to review; readers keep the live one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

insert into auth.users (id, email) values
  ('03f00000-0000-4000-a000-000000000001', 'author@t03f.local'),
  ('03f00000-0000-4000-a000-000000000002', 'pub@t03f.local'),
  ('03f00000-0000-4000-a000-000000000003', 'pub2@t03f.local'),
  ('03f00000-0000-4000-a000-000000000004', 'mod@t03f.local');
insert into public.profiles (id, full_name, is_author) values
  ('03f00000-0000-4000-a000-000000000001', 'Author', true),
  ('03f00000-0000-4000-a000-000000000002', 'Publisher', false),
  ('03f00000-0000-4000-a000-000000000003', 'Publisher Two', false),
  ('03f00000-0000-4000-a000-000000000004', 'Moderator', false)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('03f00000-0000-4000-a000-000000000002', 'publisher'),
  ('03f00000-0000-4000-a000-000000000003', 'publisher'),
  ('03f00000-0000-4000-a000-000000000004', 'moderator');

insert into public.books (id, author_id, title, subtitle, description, genres, status) values
  ('03f00000-0000-4000-c000-000000000001', '03f00000-0000-4000-a000-000000000001', 'Old Title', 'Sub',
   'Old description', '{Fiction}', 'live'),
  ('03f00000-0000-4000-c000-000000000002', '03f00000-0000-4000-a000-000000000001', 'Draft Book', null,
   null, '{Fiction}', 'draft');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord, preview_cut_para_id, artifact_prefix, manifest_key, generation, sealed_generation,
  work_version, sealed_work_version, cover_key, cover_sha256, source_key, source_type, content_notes,
  language, meta, published_at) values
  ('03f00000-0000-4000-d000-000000000001', '03f00000-0000-4000-c000-000000000001', 1, 'live', 30000, 120, 60, 10,
   -1, 'p0', 'books/r1/g2/', 'books/r1/g2/manifest.json', 2, 2, 3, 3, 'src/r1/cover', 'aa', 'src/r1/source.docx',
   'docx', '{Violence}', 'en', '{"title": "Old Title"}', now() - interval '10 days');
update public.books set current_revision_id = '03f00000-0000-4000-d000-000000000001'
where id = '03f00000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, pages, price_credits, full_file)
select '03f00000-0000-4000-d000-000000000001', ('03f00000-0000-4000-e000-00000000000' || n)::uuid, n, 'Ch ' || n,
       10000, 40, 20, 'c' || n || '.full.xhtml'
from generate_series(0, 2) n;
insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, generation, revoked_at)
select '03f00000-0000-4000-d000-000000000001'::uuid, u, '\x01'::bytea, 2, null::timestamptz
from (select null::uuid as u union all
      select ('03f00000-0000-4000-e000-00000000000' || n)::uuid from generate_series(0, 2) n) k
union all
select '03f00000-0000-4000-d000-000000000001', '03f00000-0000-4000-e000-000000000000', '\x00', 1, now();
insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint)
select '03f00000-0000-4000-d000-000000000001', 'p' || n, '03f00000-0000-4000-e000-000000000000', n, 'f' || n
from generate_series(0, 4) n;

-- Who may start one.
select pg_temp.as_user('03f00000-0000-4000-a000-000000000004');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-c000-000000000001', '{"title":"X"}') $$,
  '42501', null, 'a moderator cannot edit book details');
select pg_temp.as_user('03f00000-0000-4000-a000-000000000001');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-c000-000000000001', '{"title":"X"}') $$,
  '42501', null, 'an author cannot use the staff edit');

select pg_temp.as_user('03f00000-0000-4000-a000-000000000002');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-c000-000000000002', '{"title":"X"}') $$,
  '23514', null, 'a book that is not live is refused');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-c000-000000000001',
                    '{"title":"Old Title","genres":["Fiction"]}') $$,
  '22023', null, 'no real change and no cover is refused');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-c000-000000000001', '{"title":"  "}') $$,
  '22023', null, 'an empty title is refused');

-- Edit details: a draft copy of the live revision.
create temp table r on commit drop as
select public.staff_revise_book('03f00000-0000-4000-c000-000000000001',
  '{"title":" New Title ","description":"New description","genres":["Fiction"],"source_key":"evil"}',
  false, 'Typo in the title') as v;
grant select on r to authenticated, service_role;
select is((select v ->> 'revision_no' from r), '2', 'revision 2 is created');
select pg_temp.as_owner();
select is((select row(status, created_via, uploaded_by, base_revision_id, artifact_prefix, manifest_key,
                      sealed_generation, generation, work_version, source_key, cover_key)::text
           from public.book_revisions where id = (select (v ->> 'revision_id')::uuid from r)),
  row('draft', 'staff', '03f00000-0000-4000-a000-000000000002', '03f00000-0000-4000-d000-000000000001',
      'books/r1/g2/', 'books/r1/g2/manifest.json', 2, 2, 3, 'src/r1/source.docx', 'src/r1/cover')::text,
  'the copy keeps the sealed files, generation, working version and cover');
select is((select meta ->> 'title' from public.book_revisions where id = (select (v ->> 'revision_id')::uuid from r)),
  'New Title', 'the new title is trimmed into the revision details');
select is((select staff_edit -> 'fields' from public.book_revisions
           where id = (select (v ->> 'revision_id')::uuid from r)), '["description", "title"]'::jsonb,
  'only the fields that really change are recorded (not unchanged genres, not unknown keys)');
select is((select count(*)::int from public.chapters where revision_id = (select (v ->> 'revision_id')::uuid from r)
           and full_file is not null), 3, 'chapters copied with their files');
select is((select count(*)::int from public.chapter_keys
           where revision_id = (select (v ->> 'revision_id')::uuid from r)), 4, 'only active keys are copied');
select is((select count(*)::int from public.paragraph_anchors
           where revision_id = (select (v ->> 'revision_id')::uuid from r)), 5, 'anchors copied');
select is((select title from public.books where id = '03f00000-0000-4000-c000-000000000001'), 'Old Title',
  'readers keep the live details');
select is((select count(*)::int from public.audit_log where action = 'book.staff_edit'
           and object_id = (select v ->> 'revision_id' from r) and reason = 'Typo in the title'), 1, 'audited');

-- The Worker finishes it: routed to review, never the fast lane.
select pg_temp.as_user('03f00000-0000-4000-a000-000000000002');
select throws_ok($$ select public.complete_staff_revision((select (v ->> 'revision_id')::uuid from r),
                    '03f00000-0000-4000-a000-000000000002') $$, '42501', null, 'staff cannot finish it directly');
select pg_temp.as_service();
select throws_ok($$ select public.complete_staff_revision((select (v ->> 'revision_id')::uuid from r),
                    '03f00000-0000-4000-a000-000000000003') $$, '42501', null, 'only the staff member who started it');
select is(public.complete_staff_revision((select (v ->> 'revision_id')::uuid from r),
            '03f00000-0000-4000-a000-000000000002') ->> 'status', 'ready_for_review', 'ready for review');
select is(public.complete_staff_revision((select (v ->> 'revision_id')::uuid from r),
            '03f00000-0000-4000-a000-000000000002') ->> 'duplicate', 'true', 'a retry is a no-op');
select pg_temp.as_owner();
select is((select row(metadata_changed, cover_changed, fast_lane_eligible, 'metadata_changed' = any (reasons))::text
           from public.revision_diffs where revision_id = (select (v ->> 'revision_id')::uuid from r)),
  '(t,f,f,t)', 'the diff says details changed, so a person reviews it');

-- The staff member who made the edit cannot publish it; another publisher can.
select pg_temp.as_user('03f00000-0000-4000-a000-000000000002');
select throws_ok($$ select public.publish_revision((select (v ->> 'revision_id')::uuid from r)) $$, '42501', null,
  'the editor cannot publish their own edit');
select pg_temp.as_user('03f00000-0000-4000-a000-000000000003');
select is(public.publish_revision((select (v ->> 'revision_id')::uuid from r)) ->> 'status', 'live',
  'a second publisher publishes it');
select pg_temp.as_owner();
select is((select row(title, description, current_revision_id = (select (v ->> 'revision_id')::uuid from r))::text
           from public.books where id = '03f00000-0000-4000-c000-000000000001'),
  '("New Title","New description",t)', 'readers now get the new details');

-- Replace cover: the draft waits for the cover; an unfinished one is replaced by the next edit.
select pg_temp.as_user('03f00000-0000-4000-a000-000000000002');
create temp table c1 on commit drop as
select public.staff_revise_book('03f00000-0000-4000-c000-000000000001', '{}', true) as v;
grant select on c1 to authenticated, service_role;
select is((select v ->> 'cover_key' from c1), format('src/%s/cover', (select v ->> 'revision_id' from c1)),
  'a new cover key for the browser upload');
create temp table c2 on commit drop as
select public.staff_revise_book('03f00000-0000-4000-c000-000000000001', '{}', true) as v;
grant select on c2 to authenticated, service_role;
select pg_temp.as_service();
select throws_ok($$ select public.complete_staff_revision((select (v ->> 'revision_id')::uuid from c2),
                    '03f00000-0000-4000-a000-000000000002') $$, '22023', null, 'a cover edit needs the cover');
select is(public.complete_staff_revision((select (v ->> 'revision_id')::uuid from c2),
            '03f00000-0000-4000-a000-000000000002',
            '{"sha256":"bb","flags":[{"check_key":"cover_too_small","message":"small"}]}') ->> 'status',
  'ready_for_review', 'cover edit routed with its cover flags');
select pg_temp.as_owner();
select is((select row((select count(*) from public.book_revisions where id = (select (v ->> 'revision_id')::uuid from c1)),
                      (select cover_changed from public.revision_diffs
                        where revision_id = (select (v ->> 'revision_id')::uuid from c2)),
                      (select count(*) from public.book_flags
                        where revision_id = (select (v ->> 'revision_id')::uuid from c2)
                          and check_key = 'cover_too_small'))::text),
  '(0,t,1)', 'the unfinished draft is gone; the cover change and its flag are recorded');

select * from finish();
rollback;
