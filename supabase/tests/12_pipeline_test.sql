-- Flow 12 · book pipeline: the upload → verify → confirm → submit → seal → review → publish path,
-- publish guards, generation guards, chapter price invariants, release to review, fast lane,
-- anchor migration, unpublish refunds, RLS and the staff role matrix.
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

-- ─── Actors ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('12000000-0000-4000-a000-000000000001', 'author@test.local'),
  ('12000000-0000-4000-a000-000000000002', 'reader@test.local'),
  ('12000000-0000-4000-a000-000000000003', 'pub@test.local'),
  ('12000000-0000-4000-a000-000000000004', 'super@test.local'),
  ('12000000-0000-4000-a000-000000000005', 'ops@test.local'),
  ('12000000-0000-4000-a000-000000000006', 'support@test.local'),
  ('12000000-0000-4000-a000-000000000007', 'pubauthor@test.local');
insert into public.profiles (id, full_name, is_author) values
  ('12000000-0000-4000-a000-000000000001', 'Ifeoma Author', true),
  ('12000000-0000-4000-a000-000000000002', 'Ngozi Reader', false),
  ('12000000-0000-4000-a000-000000000003', 'Tunde Publisher', false),
  ('12000000-0000-4000-a000-000000000004', 'Amaka Super', false),
  ('12000000-0000-4000-a000-000000000005', 'Bola Ops', false),
  ('12000000-0000-4000-a000-000000000006', 'Sade Support', false),
  ('12000000-0000-4000-a000-000000000007', 'Kemi PubAuthor', true);
insert into public.staff_roles (user_id, role) values
  ('12000000-0000-4000-a000-000000000003', 'publisher'),
  ('12000000-0000-4000-a000-000000000004', 'super_admin'),
  ('12000000-0000-4000-a000-000000000005', 'operations_admin'),
  ('12000000-0000-4000-a000-000000000006', 'support'),
  ('12000000-0000-4000-a000-000000000007', 'publisher');

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
create function pg_temp.rev(p_title text) returns uuid language sql as $$
  select r.id from public.book_revisions r join public.books b on b.id = r.book_id
  where b.title = p_title order by r.revision_no desc limit 1
$$;

-- Three chapters, 1,000 + 3,000 + 2,000 words → 24 pages → 12 credits; the 10% cut sits in chapter 1,
-- so every chapter is chargeable; exact page weights 4, 12, 8 → prices 2, 6, 4.
create function pg_temp.result(p_extra jsonb default '{}') returns jsonb language sql as $$
  select '{
    "ok": true, "words": 6000, "pages": 24, "price_credits": 12, "preview_percent": 10,
    "preview_cut_para_id": "p_aaaaaaaaa2", "preview_cut_chapter_uid": "12000000-0000-4000-c100-000000000001",
    "free_through_ord": -1,
    "chapters": [
      {"chapter_uid": "12000000-0000-4000-c100-000000000001", "ord": 0, "title": "One",   "words": 1000, "words_before": 0,    "pages": 4},
      {"chapter_uid": "12000000-0000-4000-c100-000000000002", "ord": 1, "title": "Two",   "words": 3000, "words_before": 1000, "pages": 12},
      {"chapter_uid": "12000000-0000-4000-c100-000000000003", "ord": 2, "title": "Three", "words": 2000, "words_before": 4000, "pages": 8}
    ],
    "flags": [{"check_key": "cover_too_small", "message": "Your cover is a little small."}]
  }'::jsonb || p_extra
$$;
create function pg_temp.prices(a int, b int, c int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000001', 'price_credits', a),
    jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000002', 'price_credits', b),
    jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000003', 'price_credits', c))
$$;
create function pg_temp.seal(p_paras text[], p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'artifact_prefix', 'books/x/g1/', 'manifest_key', 'books/x/g1/manifest.json',
    'chapters', jsonb_build_array(
      jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000001', 'free_file', 'c0.free', 'full_file', 'c0.full'),
      jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000002', 'free_file', 'c1.free', 'full_file', 'c1.full'),
      jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000003', 'free_file', 'c2.free', 'full_file', 'c2.full')),
    'keys', jsonb_build_array(
      jsonb_build_object('chapter_uid', null, 'wrapped_key', 'a2ZyZWU='),
      jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000001', 'wrapped_key', 'azE='),
      jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000002', 'wrapped_key', 'azI='),
      jsonb_build_object('chapter_uid', '12000000-0000-4000-c100-000000000003', 'wrapped_key', 'azM=')),
    'anchors', (select jsonb_agg(jsonb_build_object('para_id', p, 'chapter_uid', '12000000-0000-4000-c100-000000000001',
                                                    'ord', i, 'fingerprint', md5(p)) order by i)
                from unnest(p_paras) with ordinality as t(p, i)),
    'prices', pg_temp.prices(2, 6, 4)) || p_extra
$$;

-- ═══ 1. Author path: create → finalize → verify → confirm → submit → seal ═════
select pg_temp.as_user('12000000-0000-4000-a000-000000000001');
select lives_ok($$select public.create_revision('{"source_type":"docx","title":"Harmattan Test"}')$$,
  'author starts a book');
select throws_ok($$select public.create_revision('{"source_type":"epub"}',
  (select id from public.books where title = 'Harmattan Test'))$$, '23505', null, 'one open revision per book unless the author confirms replacing it');
select throws_ok($$select public.complete_verify(pg_temp.rev('Harmattan Test'), 1, '{}')$$, '42501', null,
  'authors cannot post Worker results');
select throws_ok($$update public.book_revisions set status = 'live' where id = pg_temp.rev('Harmattan Test')$$,
  '42501', null, 'authors cannot write status');
select throws_ok($$update public.book_revisions set price_credits = 1 where id = pg_temp.rev('Harmattan Test')$$,
  '42501', null, 'authors cannot write price');

select pg_temp.as_service();
select is(public.finalize_revision(pg_temp.rev('Harmattan Test'), '12000000-0000-4000-a000-000000000001',
  '{"source_sha256":"s1","converted_sha256":"c1","converted":true}') ->> 'status', 'processing',
  'finalize sends a phone conversion to verification');
select is(public.finalize_revision(pg_temp.rev('Harmattan Test'), '12000000-0000-4000-a000-000000000001',
  '{"source_sha256":"s1","converted_sha256":"c1","converted":true}') ->> 'duplicate', 'true',
  'a duplicate finalize is a no-op');
select pg_temp.as_owner();
select is((select count(*)::int from pgmq.q_book_verify
  where message ->> 'revision_id' = pg_temp.rev('Harmattan Test')::text), 1, 'one verify message queued');
select ok((select bool_and(vt > now() + interval '100 seconds') from pgmq.q_book_verify
  where message ->> 'revision_id' = pg_temp.rev('Harmattan Test')::text),
  'the cron cannot read it while the immediate run has it (120 s delay)');
select pg_temp.as_service();
select is(public.complete_verify(pg_temp.rev('Harmattan Test'), 0, pg_temp.result()) ->> 'applied', 'false',
  'verify result for an old generation is ignored');
select is(public.complete_verify(pg_temp.rev('Harmattan Test'), 1, pg_temp.result()) ->> 'status', 'draft',
  'verify returns the book to the author for chapters');
select is(public.finalize_revision(pg_temp.rev('Harmattan Test'), '12000000-0000-4000-a000-000000000001',
  '{"source_sha256":"s1","converted_sha256":"c1","converted":true}') ->> 'duplicate', 'true',
  'a finalize retry after verify is still a no-op');
select is((select readiness from public.book_revisions where id = pg_temp.rev('Harmattan Test')), 92,
  'readiness = 100 − cover_too_small (8)');

select pg_temp.as_user('12000000-0000-4000-a000-000000000001');
select throws_ok($$select public.submit_revision(pg_temp.rev('Harmattan Test'))$$, '23514', null,
  'submit needs confirmed chapters');
select pg_temp.as_service();
select throws_ok($$select public.confirm_chapters(pg_temp.rev('Harmattan Test'), '12000000-0000-4000-a000-000000000002',
  pg_temp.result())$$, '42501', null, 'only the author confirms chapters');
select is((public.confirm_chapters(pg_temp.rev('Harmattan Test'), '12000000-0000-4000-a000-000000000001',
  pg_temp.result()) ->> 'price_credits')::int, 12, 'confirm records the price');
select pg_temp.as_user('12000000-0000-4000-a000-000000000001');
select is(public.submit_revision(pg_temp.rev('Harmattan Test')) ->> 'generation', '2', 'submit starts a new generation');

select pg_temp.as_service();
select is(public.complete_seal(pg_temp.rev('Harmattan Test'), 1, pg_temp.seal(array['p_aaaaaaaaa1'])) ->> 'applied',
  'false', 'complete_seal ignores an old generation');
select is(public.seal_failed(pg_temp.rev('Harmattan Test'), 1), false, 'seal_failed ignores an old generation');
select is(public.seal_failed(pg_temp.rev('Harmattan Test'), 2), true, 'a seal that failed three times is retried');
select is((select status::text || coalesce(desk_reason, '') from public.book_revisions
  where id = pg_temp.rev('Harmattan Test')), 'processing',
  'a failed seal never sends the confirmed book to the desk');
select is((select count(*)::int from public.audit_log where action = 'book.seal_failed'
  and object_id = pg_temp.rev('Harmattan Test')::text), 1, 'staff are alerted once');
select throws_ok($$select public.complete_seal(pg_temp.rev('Harmattan Test'), 2,
  pg_temp.seal(array['p_aaaaaaaaa1'], jsonb_build_object('prices', pg_temp.prices(2, 6, 5))))$$, '23514', null,
  'complete_seal rejects prices that do not sum to the book price');
select is(public.complete_seal(pg_temp.rev('Harmattan Test'), 2,
  pg_temp.seal(array['p_aaaaaaaaa1', 'p_aaaaaaaaa2', 'p_aaaaaaaaa3', 'p_aaaaaaaaa4'])) ->> 'status',
  'ready_for_review', 'score 92 with no blocking flag routes to Ready for review');
select is(public.complete_seal(pg_temp.rev('Harmattan Test'), 2, pg_temp.seal(array['p_aaaaaaaaa1'])) ->> 'applied',
  'false', 'a duplicate seal message is a no-op');
select is((select count(*)::int from public.chapter_keys where revision_id = pg_temp.rev('Harmattan Test')
  and revoked_at is null), 4, 'one active key per chapter plus K_free');

-- ─── RLS while in review ────────────────────────────────────────────────────
select pg_temp.as_user('12000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.book_revisions where id = pg_temp.rev('Harmattan Test')), 0,
  'readers cannot see a revision in review');
select is((select count(*)::int from public.book_flags), 0, 'readers cannot see flags');
select throws_ok($$select * from public.chapter_keys$$, '42501', null, 'readers cannot read chapter_keys');
select pg_temp.as_user('12000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.book_flags f where f.revision_id = pg_temp.rev('Harmattan Test')), 1,
  'authors see their own flags');
select throws_ok($$select * from public.chapter_keys$$, '42501', null, 'authors cannot read chapter_keys');

-- ─── Staff role matrix ──────────────────────────────────────────────────────
select pg_temp.as_user('12000000-0000-4000-a000-000000000006');
select throws_ok($$select public.publish_revision(pg_temp.rev('Harmattan Test'))$$, '42501', null,
  'Support cannot publish');
select pg_temp.as_user('12000000-0000-4000-a000-000000000005');
select throws_ok($$select public.publish_revision(pg_temp.rev('Harmattan Test'))$$, '42501', null,
  'Operations admin cannot publish');
select lives_ok($$select public.desk_claim()$$, 'Operations admin can use the desk');
select pg_temp.as_user('12000000-0000-4000-a000-000000000001');
select throws_ok($$select public.publish_revision(pg_temp.rev('Harmattan Test'))$$, '42501', null,
  'authors cannot publish');

-- ═══ 2. Publish ══════════════════════════════════════════════════════════════
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select is(public.publish_revision(pg_temp.rev('Harmattan Test')) ->> 'status', 'live', 'Publisher publishes');
select is((select b.current_revision_id from public.books b where b.title = 'Harmattan Test'),
  pg_temp.rev('Harmattan Test'), 'the book points at the published revision');
select ok((select new_arrival_until > now() + interval '29 days' from public.books where title = 'Harmattan Test'),
  'first publish adds the book to New arrivals');
select is(public.publish_revision(pg_temp.rev('Harmattan Test')) ->> 'already', 'true', 'publishing again is a no-op');
select pg_temp.as_owner();
select is((select actor_id from public.audit_log where action = 'book.publish'
  and object_id = pg_temp.rev('Harmattan Test')::text), '12000000-0000-4000-a000-000000000003'::uuid,
  'audit row names the Publisher');

-- ─── A Publisher who wrote the book cannot publish it ───────────────────────
insert into public.books (id, author_id, title) values
  ('12000000-0000-4000-b000-000000000007', '12000000-0000-4000-a000-000000000007', 'Own Book');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  preview_cut_para_id, generation, sealed_generation, manifest_key, uploaded_by)
values ('12000000-0000-4000-e000-000000000007', '12000000-0000-4000-b000-000000000007', 1, 'ready_for_review',
  6000, 24, 12, 10, 'p_aaaaaaaaa2', 1, 1, 'm', '12000000-0000-4000-a000-000000000007');
insert into public.chapters (revision_id, chapter_uid, ord, title, words, pages, price_credits)
values ('12000000-0000-4000-e000-000000000007', '12000000-0000-4000-c100-000000000001', 0, 'One', 6000, 24, 12);
select pg_temp.as_user('12000000-0000-4000-a000-000000000007');
select throws_ok($$select public.publish_revision('12000000-0000-4000-e000-000000000007')$$, '42501', null,
  'a Publisher cannot publish their own book');

-- ─── A staff upload that went through the desk: a Publisher still confirms it ──
select pg_temp.as_owner();
insert into public.books (id, author_id, title) values
  ('12000000-0000-4000-b000-000000000008', '12000000-0000-4000-a000-000000000001', 'Desk Upload');
insert into public.book_revisions (id, book_id, revision_no, status, draft_step, created_via, uploaded_by, generation)
values ('12000000-0000-4000-e000-000000000008', '12000000-0000-4000-b000-000000000008', 1, 'draft', 'chapters',
  'desk', '12000000-0000-4000-a000-000000000003', 2);
select pg_temp.as_service();
select lives_ok($$select public.confirm_chapters('12000000-0000-4000-e000-000000000008',
  '12000000-0000-4000-a000-000000000007', pg_temp.result())$$,
  'any Publisher confirms chapters of a staff upload after a desk push');
select pg_temp.as_owner();
update public.book_revisions set draft_step = 'chapters', uploaded_by = '12000000-0000-4000-a000-000000000001'
  where id = '12000000-0000-4000-e000-000000000008';
select pg_temp.as_service();
select throws_ok($$select public.confirm_chapters('12000000-0000-4000-e000-000000000008',
  '12000000-0000-4000-a000-000000000003', pg_temp.result())$$, '42501', null,
  'a Publisher cannot confirm an author''s own upload');

-- ─── Blocking flag guard ────────────────────────────────────────────────────
select pg_temp.as_owner();
insert into public.book_flags (revision_id, check_key, blocking, severity, message)
values ('12000000-0000-4000-e000-000000000007', 'policy_hit', true, 'blocking', 'Policy');
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select throws_ok($$select public.publish_revision('12000000-0000-4000-e000-000000000007')$$, '23514', null,
  'an open blocking flag stops publishing');
select pg_temp.as_owner();
update public.book_revisions set status = 'needs_fixes' where id = '12000000-0000-4000-e000-000000000007';
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select throws_ok($$select public.publish_revision('12000000-0000-4000-e000-000000000007')$$, '23514', null,
  'only Ready for review (or scheduled) publishes');

-- ═══ 3. Release to review (fix → reseal → release → undo) ═══════════════════
select throws_ok($$select public.release_to_review('12000000-0000-4000-e000-000000000007')$$, '23514', null,
  'release needs every blocking flag closed');
select pg_temp.as_service();
select is((public.record_fix('12000000-0000-4000-e000-000000000007',
  (select id from public.book_flags where revision_id = '12000000-0000-4000-e000-000000000007'),
  '{"op":"dismiss_flag","reason":"Reviewed by hand"}', '{}', 0, '12000000-0000-4000-a000-000000000003')
  ->> 'readiness')::int, 100, 'dismissing the flag rescored to 100');
select throws_ok($$select public.record_fix('12000000-0000-4000-e000-000000000007', null,
  '{"op":"rename_chapter"}', '{}', 0, '12000000-0000-4000-a000-000000000003')$$, '40001', null,
  'a stale work version is refused');
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select throws_ok($$select public.release_to_review('12000000-0000-4000-e000-000000000007')$$, '23514', null,
  'release needs the fixed copy sealed');
select pg_temp.as_service();
select lives_ok($$select public.complete_seal('12000000-0000-4000-e000-000000000007',
  (public.begin_reseal('12000000-0000-4000-e000-000000000007', '12000000-0000-4000-a000-000000000003') ->> 'generation')::int,
  '{"artifact_prefix":"books/o/g2/","manifest_key":"books/o/g2/m.json","work_version":1}')$$,
  'staff reseal after the fix');
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select is(public.release_to_review('12000000-0000-4000-e000-000000000007') ->> 'status', 'ready_for_review',
  'Mark fixed and send to review');
select is(public.undo_release_to_review('12000000-0000-4000-e000-000000000007') ->> 'status', 'needs_fixes',
  'Undo while nobody opened Quick review');

-- ═══ 4. Update: anchors move, pointer swaps atomically ══════════════════════
select pg_temp.as_owner();
create table public.annotations (id serial primary key, book_id uuid, start_para_id text, end_para_id text,
                                 moved boolean not null default false);
create table public.passage_comments (id serial primary key, book_id uuid, para_id text);
insert into public.annotations (book_id, start_para_id, end_para_id)
select id, 'p_aaaaaaaaa3', 'p_aaaaaaaaa3' from public.books where title = 'Harmattan Test'
union all select id, 'p_aaaaaaaaa4', 'p_aaaaaaaaa4' from public.books where title = 'Harmattan Test';
insert into public.passage_comments (book_id, para_id)
select id, 'p_aaaaaaaaa3' from public.books where title = 'Harmattan Test';

-- revision 2: paragraph 3 removed, paragraph 5 added; both a big edit and a 1% edit are tried.
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  preview_cut_para_id, free_through_ord, generation, base_revision_id, uploaded_by, readiness, submitted_at)
select '12000000-0000-4000-e000-000000000002', b.id, 2, 'processing', 6000, 24, 12, 10, 'p_aaaaaaaaa2', -1, 3,
  b.current_revision_id, '12000000-0000-4000-a000-000000000001', 100, now()
from public.books b where b.title = 'Harmattan Test';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, words_before, pages)
select '12000000-0000-4000-e000-000000000002', (c.value ->> 'chapter_uid')::uuid, (c.value ->> 'ord')::int, c.value ->> 'title',
  (c.value ->> 'words')::int, (c.value ->> 'words_before')::int, (c.value ->> 'pages')::numeric
from jsonb_array_elements(pg_temp.result() -> 'chapters') c;

select pg_temp.as_service();
select is(public.complete_seal('12000000-0000-4000-e000-000000000002', 3,
  pg_temp.seal(array['p_aaaaaaaaa1', 'p_aaaaaaaaa2', 'p_aaaaaaaaa4', 'p_aaaaaaaaa5'], jsonb_build_object(
    'anchor_migrations', '[{"old_para_id":"p_aaaaaaaaa3","nearest_para_id":"p_aaaaaaaaa2","method":"nearest"}]'::jsonb,
    'diff', '{"inserted_words":40,"deleted_words":30,"changed_pct":1.2,"chapters_added":1}'::jsonb))) ->> 'status',
  'ready_for_review', 'an update that adds a chapter skips the fast lane');
select is((select reasons from public.revision_diffs where revision_id = '12000000-0000-4000-e000-000000000002'),
  array['chapters_changed'], 'the diff records why');

select pg_temp.as_user('12000000-0000-4000-a000-000000000001');
select throws_ok($$select public.revision_links('12000000-0000-4000-e000-000000000002')$$, '42501', null,
  'only publishers read paragraph links');
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select is(public.revision_links('12000000-0000-4000-e000-000000000002') - 'paragraphs' - 'kept',
  '{"highlights":2,"highlights_kept":1,"comments_moved":1,"published":false}'::jsonb,
  'Revisions counts the highlights and discussions that will move');
-- PostgREST sessions preload pg-safeupdate, which refuses a DELETE with no WHERE; tests can't load it,
-- so check the function bodies instead (migrate_anchors once cleared its temp table that way).
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc ~* 'delete\s+from\s+[a-z_."]+\s*;'), 0,
  'no function deletes without a WHERE (pg-safeupdate refuses it under PostgREST)');
select is((public.publish_revision('12000000-0000-4000-e000-000000000002') -> 'anchors_moved' ->> 'highlights')::int, 1,
  'one highlight moved');
select is((select published_by from public.book_revisions where id = '12000000-0000-4000-e000-000000000002'),
  '12000000-0000-4000-a000-000000000003'::uuid, 'the revision records who approved it');
select pg_temp.as_owner();
select is((select status::text from public.book_revisions where id = (select base_revision_id from public.book_revisions
  where id = '12000000-0000-4000-e000-000000000002')), 'superseded', 'the old revision is superseded');
select is((select count(*)::int from public.book_revisions r join public.books b on b.id = r.book_id
  where b.title = 'Harmattan Test' and r.status = 'live'), 1, 'exactly one live revision');
select is((select start_para_id from public.annotations where start_para_id <> 'p_aaaaaaaaa4'), 'p_aaaaaaaaa2',
  'a highlight on a removed paragraph moves to the nearest kept one');
select is((select count(*)::int from public.annotations where moved), 1, 'only the moved highlight is flagged');
select is((select para_id from public.passage_comments), 'p_aaaaaaaaa2', 'passage comments move too');

-- ─── Fast lane: a 1% edit publishes itself ──────────────────────────────────
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  preview_cut_para_id, free_through_ord, generation, base_revision_id, uploaded_by, submitted_at)
select '12000000-0000-4000-e000-000000000003', b.id, 3, 'processing', 6000, 24, 12, 10, 'p_aaaaaaaaa2', -1, 1,
  b.current_revision_id, '12000000-0000-4000-a000-000000000001', now()
from public.books b where b.title = 'Harmattan Test';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, words_before, pages)
select '12000000-0000-4000-e000-000000000003', (c.value ->> 'chapter_uid')::uuid, (c.value ->> 'ord')::int, c.value ->> 'title',
  (c.value ->> 'words')::int, (c.value ->> 'words_before')::int, (c.value ->> 'pages')::numeric
from jsonb_array_elements(pg_temp.result() -> 'chapters') c;
select pg_temp.as_service();
select is(public.complete_seal('12000000-0000-4000-e000-000000000003', 1,
  pg_temp.seal(array['p_aaaaaaaaa1', 'p_aaaaaaaaa2', 'p_aaaaaaaaa4', 'p_aaaaaaaaa5'],
    '{"diff":{"inserted_words":30,"deleted_words":30,"changed_pct":1.0}}')) ->> 'fast_lane', 'true',
  'a 1% edit takes the fast lane');
select pg_temp.as_owner();
select is((select current_revision_id from public.books where title = 'Harmattan Test'),
  '12000000-0000-4000-e000-000000000003'::uuid, 'the fast-lane revision is live');
select ok(exists (select 1 from public.audit_log where action = 'book.publish' and actor_id is null
  and object_id = '12000000-0000-4000-e000-000000000003'), 'the fast lane writes a system audit row');

-- ═══ 5. set_chapter_prices invariants ═══════════════════════════════════════
update public.book_revisions set free_through_ord = 0 where id = '12000000-0000-4000-e000-000000000002';
select pg_temp.as_service();
select throws_ok($$select public.set_chapter_prices('12000000-0000-4000-e000-000000000002', pg_temp.prices(2, 6, 4))$$,
  '23514', null, 'a chapter inside the preview must cost 0');
select throws_ok($$select public.set_chapter_prices('12000000-0000-4000-e000-000000000002', pg_temp.prices(0, 13, -1))$$,
  '23514', null, 'prices cannot be negative');
select throws_ok($$select public.set_chapter_prices('12000000-0000-4000-e000-000000000002',
  pg_temp.prices(0, 6, 6) - 2)$$, '22023', null, 'every chapter needs a price');
select lives_ok($$select public.set_chapter_prices('12000000-0000-4000-e000-000000000002', pg_temp.prices(0, 7, 5))$$,
  'valid prices are stored');
select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select throws_ok($$select public.set_chapter_prices('12000000-0000-4000-e000-000000000002', pg_temp.prices(0, 7, 5))$$,
  '42501', null, 'only Workers set chapter prices');

-- ═══ 6. Unpublish with Remove access refunds ════════════════════════════════
select pg_temp.as_owner();
insert into public.credit_ledger (user_id, delta, reason, bucket) values
  ('12000000-0000-4000-a000-000000000002', 100, 'top_up', 'topup');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo)
select '12000000-0000-4000-a000-000000000002', -12, 'unlock_all', 'topup', id, author_id, 1920
from public.books where title = 'Harmattan Test';
insert into public.entitlements (user_id, book_id, scope, source)
select '12000000-0000-4000-a000-000000000002', id, 'book', 'unlock_all' from public.books where title = 'Harmattan Test';

select pg_temp.as_user('12000000-0000-4000-a000-000000000003');
select is(public.unpublish_preview((select id from public.books where title = 'Harmattan Test')) ->> 'readers', '1',
  'Unpublish shows how many readers hold access');
select throws_ok($$select public.unpublish_book((select id from public.books where title = 'Harmattan Test'),
  'policy_violation', true, false, 'Harmattan Test')$$, '42501', null, 'only a Super admin removes access');
select pg_temp.as_user('12000000-0000-4000-a000-000000000004');
select throws_ok($$select public.unpublish_book((select id from public.books where title = 'Harmattan Test'),
  'policy_violation', true, false, 'Harmattan')$$, '22023', null, 'the title must be typed to confirm');
select throws_ok($$select public.unpublish_book((select id from public.books where title = 'Harmattan Test'),
  'quality', true, false, 'Harmattan Test')$$, '22023', null, 'remove access is for policy violations only');
select is((public.unpublish_book((select id from public.books where title = 'Harmattan Test'),
  'policy_violation', true, false, 'harmattan test') ->> 'refunded_credits')::int, 12, 'paid credits are refunded');
select pg_temp.as_owner();
select is(public.credit_balance('12000000-0000-4000-a000-000000000002'), 100, 'the reader''s balance is restored');
select is((select author_earning_kobo from public.credit_ledger where reason = 'refund'
  and user_id = '12000000-0000-4000-a000-000000000002'), -1920, 'the author''s earning is reversed');
select ok((select revoked_at is not null from public.entitlements where user_id = '12000000-0000-4000-a000-000000000002'),
  'the reader''s access is revoked');

select * from finish();
rollback;
