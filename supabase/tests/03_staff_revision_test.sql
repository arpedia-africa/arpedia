-- Spec check 03-16 · flow 03 admin rule 1, flow 12 rule 41: staff Edit details and Replace cover
-- create a new revision that reuses the live files and goes to review; readers keep the live one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

-- Who may make one: the Worker for a Publisher only.
select pg_temp.as_user('03f00000-0000-4000-a000-000000000002');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{"title":"X"}') $$,
  '42501', null, 'staff cannot call it directly (the Worker copies files first)');
select pg_temp.as_service();
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{"title":"X"}', null, null,
                    '03f00000-0000-4000-a000-000000000004') $$,
  '42501', null, 'not for a moderator');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{"title":"X"}', null, null,
                    '03f00000-0000-4000-a000-000000000001') $$,
  '42501', null, 'not for the author');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000002', '{"title":"X"}', null, null,
                    '03f00000-0000-4000-a000-000000000002') $$,
  '23514', null, 'a book that is not live is refused');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{"title":"Old Title","genres":["Fiction"]}',
                    null, null, '03f00000-0000-4000-a000-000000000002') $$,
  '22023', null, 'no real change and no cover is refused');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{"title":"  "}', null, null,
                    '03f00000-0000-4000-a000-000000000002') $$,
  '22023', null, 'an empty title is refused');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{"genres":[]}', null, null,
                    '03f00000-0000-4000-a000-000000000002') $$,
  '22023', null, 'an empty genre list is refused');
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1',
                    '03f00000-0000-4000-c000-000000000001', '{}', '{}', null,
                    '03f00000-0000-4000-a000-000000000002') $$,
  '22023', null, 'a cover edit needs the cover hash');

-- Edit details: a copy of the live revision, routed to review.
select is(public.staff_revise_book('03f00000-0000-4000-d000-0000000000a1', '03f00000-0000-4000-c000-000000000001',
  '{"title":" New Title ","description":"New description","genres":["Fiction"],"source_key":"evil"}',
  null, 'Typo in the title', '03f00000-0000-4000-a000-000000000002') ->> 'status', 'ready_for_review',
  'revision 2 goes straight to Ready for review');
select pg_temp.as_owner();
select is((select row(revision_no, created_via, uploaded_by, base_revision_id, artifact_prefix, manifest_key,
                      sealed_generation, generation, work_version, source_key, cover_key, submitted_at is not null)::text
           from public.book_revisions where id = '03f00000-0000-4000-d000-0000000000a1'),
  row(2, 'staff', '03f00000-0000-4000-a000-000000000002', '03f00000-0000-4000-d000-000000000001',
      'books/r1/g2/', 'books/r1/g2/manifest.json', 2, 2, 3, 'src/r1/source.docx', 'src/r1/cover', true)::text,
  'the copy keeps the sealed files, generation, working version and cover');
select is((select meta ->> 'title' from public.book_revisions where id = '03f00000-0000-4000-d000-0000000000a1'),
  'New Title', 'the new title is trimmed into the revision details');
select is((select staff_edit from public.book_revisions where id = '03f00000-0000-4000-d000-0000000000a1'),
  '{"cover": false, "fields": ["description", "title"]}'::jsonb,
  'only the fields that really change are recorded (not unchanged genres, not unknown keys, not the note)');
select is((select count(*)::int from public.chapters where revision_id = '03f00000-0000-4000-d000-0000000000a1'
           and full_file is not null), 3, 'chapters copied with their files');
select is((select count(*)::int from public.chapter_keys
           where revision_id = '03f00000-0000-4000-d000-0000000000a1'), 4, 'only active keys are copied');
select is((select count(*)::int from public.paragraph_anchors
           where revision_id = '03f00000-0000-4000-d000-0000000000a1'), 5, 'anchors copied');
select is((select row(metadata_changed, cover_changed, fast_lane_eligible, 'metadata_changed' = any (reasons))::text
           from public.revision_diffs where revision_id = '03f00000-0000-4000-d000-0000000000a1'),
  '(t,f,f,t)', 'the diff says details changed, so a person reviews it');
select is((select title from public.books where id = '03f00000-0000-4000-c000-000000000001'), 'Old Title',
  'readers keep the live details');
select is((select count(*)::int from public.audit_log where action = 'book.staff_edit'
           and object_id = '03f00000-0000-4000-d000-0000000000a1' and reason = 'Typo in the title'), 1,
  'audited with the note');
select pg_temp.as_service();
select throws_ok($$ select public.staff_revise_book('03f00000-0000-4000-d000-0000000000a2',
                    '03f00000-0000-4000-c000-000000000001', '{"title":"Again"}', null, null,
                    '03f00000-0000-4000-a000-000000000003') $$,
  '23505', null, 'one open revision at a time');

-- The staff member who made the edit cannot publish it; another publisher can.
select pg_temp.as_user('03f00000-0000-4000-a000-000000000002');
select throws_ok($$ select public.publish_revision('03f00000-0000-4000-d000-0000000000a1') $$, '42501', null,
  'the editor cannot publish their own edit');
select pg_temp.as_user('03f00000-0000-4000-a000-000000000003');
select is(public.publish_revision('03f00000-0000-4000-d000-0000000000a1') ->> 'status', 'live',
  'a second publisher publishes it');
select pg_temp.as_owner();
select is((select row(title, description, current_revision_id = '03f00000-0000-4000-d000-0000000000a1')::text
           from public.books where id = '03f00000-0000-4000-c000-000000000001'),
  '("New Title","New description",t)', 'readers now get the new details');
select is((select count(*)::int from public.chapter_keys where revision_id = '03f00000-0000-4000-d000-000000000001'
           and revoked_at is null), 4, 'the old revision keeps its keys for offline copies');

-- Replace cover: the new cover and its checks.
select pg_temp.as_service();
select is(public.staff_revise_book('03f00000-0000-4000-d000-0000000000a3', '03f00000-0000-4000-c000-000000000001',
  '{}', '{"sha256":"bb","flags":[{"check_key":"cover_too_small","message":"small"}]}', null,
  '03f00000-0000-4000-a000-000000000002') ->> 'status', 'ready_for_review', 'cover edit routed to review');
select pg_temp.as_owner();
select is((select row(r.cover_key = 'src/03f00000-0000-4000-d000-0000000000a3/cover', r.cover_sha256, d.cover_changed,
                      d.metadata_changed, (select count(*) from public.book_flags f
                                            where f.revision_id = r.id and f.check_key = 'cover_too_small'))::text
           from public.book_revisions r join public.revision_diffs d on d.revision_id = r.id
           where r.id = '03f00000-0000-4000-d000-0000000000a3'),
  '(t,bb,t,f,1)', 'the new cover, its hash and its flag are recorded');

select * from finish();
rollback;
