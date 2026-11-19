-- Flow 12 pipeline seed: books at every stage of the Books queue (Needs you, Processing, Sent back),
-- for the admin screens and their checks. Loaded after seed.sql (supabase/config.toml).
-- Ids: books 00000000-0000-4000-c100-…, revisions 00000000-0000-4000-d100-….

-- The prototype's people for these screens: Obiageli Nnaji (Market Day in Onitsha, Fix flagged issues),
-- Esther Akande (Garden of Small Mercies, Quick review) and Ifeanyi Obi, a second Publisher.
create temporary table seed_pipeline_users (id uuid, email text, full_name text, username text, is_author boolean,
  role public.staff_role);
insert into seed_pipeline_users values
  ('00000000-0000-4000-a000-000000000010', 'obiageli@example.com',  'Obiageli Nnaji', 'obiageli',      true,  null),
  ('00000000-0000-4000-a000-000000000011', 'esther@example.com',    'Esther Akande',  'esther',        true,  null),
  ('00000000-0000-4000-b000-000000000008', 'ifeanyi@arpedia.africa', 'Ifeanyi Obi',   'ifeanyi.staff', false, 'publisher');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('arpedia-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(), '', '', '', ''
from seed_pipeline_users where id not in (select id from auth.users);
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from seed_pipeline_users where id::text not in (select provider_id from auth.identities where provider = 'email');
insert into public.profiles (id, username, full_name, is_author)
select id, username, full_name, is_author from seed_pipeline_users
on conflict (id) do update set username = excluded.username, full_name = excluded.full_name,
  is_author = excluded.is_author;
insert into public.staff_roles (user_id, role)
select id, role from seed_pipeline_users where role is not null
on conflict do nothing;

create temporary table seed_queue (n int, title text, author uuid, genre text, source public.source_type,
  status public.revision_status, words int, routed interval, assignee uuid, flags jsonb, step text);
insert into seed_queue values
  (1, 'Market Day in Onitsha', '00000000-0000-4000-a000-000000000010', 'Literary fiction', 'docx', 'needs_fixes',
   61204, '1 day', null,
   '[{"check_key":"image_too_large","message":"Chapter 12 has a picture of 6.2 MB. It will load slowly on mobile data.","suggestion":"Shrink it to about 1.2 MB. No visible change.","location":{"image":"img/12.jpg"},"auto_fixable":true,"fix_op":{"op":"shrink_image","image":"img/12.jpg"}},
     {"check_key":"chapter_title","message":"Chapter 4 starts with “A debt in naira” but it looks like body text, so it may not appear in the contents.","suggestion":"Make it the chapter 4 heading."},
     {"check_key":"chapter_title","message":"Chapter 9 has two possible titles: “What the river keeps” and “IX”.","suggestion":"Use “What the river keeps”."}]', null),
  (2, 'The Prayer Warrior''s Wife', '00000000-0000-4000-a000-000000000009', 'Christian & Faith', 'pdf', 'needs_fixes',
   48210, '2 days', '00000000-0000-4000-b000-000000000003',
   '[{"check_key":"pdf_source","message":"This book was made from a PDF."},
     {"check_key":"low_structure_confidence","message":"Chapters and paragraphs came from a PDF, so check where they start and end."},
     {"check_key":"toc_mismatch","message":"The contents list has 18 chapters but 21 were found."},
     {"check_key":"cover_too_small","message":"The cover is 640 px wide; 800 px or more looks sharp."},
     {"check_key":"chapter_title","message":"Chapter 7 has no title.","suggestion":"Chapter 7"}]', null),
  (3, 'Garden of Small Mercies', '00000000-0000-4000-a000-000000000011', 'Christian & Faith', 'epub', 'ready_for_review',
   71480, '4 days', '00000000-0000-4000-b000-000000000008', '[]', null),
  (4, 'Kano Nights', '00000000-0000-4000-a000-000000000006', 'Thriller', 'epub', 'ready_for_review',
   68900, '2 days', '00000000-0000-4000-b000-000000000001',
   '[{"check_key":"copyright_missing","message":"There is no copyright page.","suggestion":"Add one from the book details."}]', null),
  (5, 'Daughters of Zion Street', '00000000-0000-4000-a000-000000000007', 'Christian romance', 'epub', 'ready_for_review',
   52140, '1 day', null, '[]', null),
  (6, 'Songs for Mama Ijeoma', '00000000-0000-4000-a000-000000000003', 'Poetry', 'docx', 'ready_for_review',
   24800, '5 hours', null, '[]', null),
  (7, 'Lagos After Rain', '00000000-0000-4000-a000-000000000002', 'Romance', 'docx', 'processing',
   70100, null, null, '[]', 'checks'),
  (8, 'Prayer Points for Tuesday', '00000000-0000-4000-a000-000000000009', 'Christian & Faith', 'pdf', 'with_desk',
   null, null, null, '[]', 'received'),
  (9, 'The River Between Us', '00000000-0000-4000-a000-000000000003', 'Literary fiction', 'docx', 'sent_back',
   44000, null, null, '[]', null),
  (10, 'Okada Diaries', '00000000-0000-4000-a000-000000000006', 'Short stories', 'epub', 'sent_back',
   31250, null, null, '[]', null),
  (11, 'The Last Harmattan', '00000000-0000-4000-a000-000000000005', 'Christian & Faith', 'pdf', 'sent_back',
   39900, null, null, '[]', null),
  (12, 'Aunty Bisi''s Kitchen', '00000000-0000-4000-a000-000000000007', 'Food & Home', 'docx', 'sent_back',
   null, null, null, '[]', 'failed');

insert into public.books (id, author_id, title, genres, description, status, created_at)
select ('00000000-0000-4000-c100-' || lpad(n::text, 12, '0'))::uuid, author, title, array[genre],
  'A seeded book waiting in the pipeline.', 'draft', now() - make_interval(days => 20 - n)
from seed_queue;

insert into public.book_revisions (id, book_id, revision_no, status, draft_step, source_type, uploaded_by,
  words, pages, price_credits, preview_percent, submitted_at, routed_at, due_at, assigned_to, last_activity_at,
  steps, desk_reason, sent_back_note, source_key, cover_key, chapters_confirmed_at, generation, sealed_generation)
select ('00000000-0000-4000-d100-' || lpad(n::text, 12, '0'))::uuid,
  ('00000000-0000-4000-c100-' || lpad(n::text, 12, '0'))::uuid, 1, status, null, source, author,
  words, ceil(words / 250.0)::int, ceil(ceil(words / 250.0) / 2.0)::int, 10.0,
  now() - coalesce(routed, '6 hours') - interval '1 hour',
  now() - routed,
  case status when 'needs_fixes' then now() - routed + interval '2 days'
              when 'ready_for_review' then now() - routed - interval '1 hour' + interval '3 days'
              when 'with_desk' then now() + interval '1 day' end,
  assignee, case when assignee is not null then now() - interval '1 hour' end,
  case when step = 'received' then jsonb_build_object('received', now() - interval '20 hours')
       when step = 'failed' then jsonb_build_object('received', now() - interval '40 minutes')
       when step is not null then jsonb_build_object('received', now() - interval '9 minutes',
         'converted', now() - interval '8 minutes', 'chapters_found', now() - interval '6 minutes')
       else jsonb_build_object('received', now() - interval '3 days', 'scored', now() - coalesce(routed, '1 day')) end,
  case when status = 'with_desk' then 'pdf_source' end,
  case when status = 'sent_back' then 'Please send the Word file; the PDF lost the chapter breaks.' end,
  format('src/00000000-0000-4000-d100-%s/source.%s', lpad(n::text, 12, '0'), source),
  format('src/00000000-0000-4000-d100-%s/cover', lpad(n::text, 12, '0')),
  case when status in ('needs_fixes', 'ready_for_review') then now() - routed - interval '2 hours' end,
  1, case when status in ('needs_fixes', 'ready_for_review') then 1 end
from seed_queue;

select public._insert_flags(('00000000-0000-4000-d100-' || lpad(n::text, 12, '0'))::uuid, flags, 'worker')
from seed_queue where jsonb_array_length(flags) > 0;
select public._rescore(('00000000-0000-4000-d100-' || lpad(n::text, 12, '0'))::uuid)
from seed_queue where status in ('needs_fixes', 'ready_for_review');

insert into public.send_backs (revision_id, issues, note, sent_by, source, sent_at)
select ('00000000-0000-4000-d100-' || lpad(n::text, 12, '0'))::uuid,
  '[{"text":"Chapters run together after chapter 6."},{"text":"The cover is blurry."}]',
  'Please send the Word file; the PDF lost the chapter breaks.', '00000000-0000-4000-b000-000000000003',
  'quick_review', now() - make_interval(days => n - 7)
from seed_queue where status = 'sent_back' and step is null;
-- Okada Diaries was reminded within the last day, so it shows "Reminded" instead of the button.
update public.send_backs set reminded_at = now() - interval '20 hours'
where revision_id = '00000000-0000-4000-d100-000000000010';

-- Failed today: a Word file that could not be opened went back automatically (rule 48).
update public.book_revisions
   set sent_back_note = 'We could not open your file. It looks damaged, which can happen when a download stops halfway. Please save it again as .docx and upload it here. Nothing else is needed.'
 where id = '00000000-0000-4000-d100-000000000012';
insert into public.send_backs (revision_id, issues, note, sent_by, source, sent_at)
select id, '[]', sent_back_note, null, 'desk_auto', now() - interval '38 minutes'
from public.book_revisions where id = '00000000-0000-4000-d100-000000000012';

-- Revision history for Revisions (s-book-revisions). The Alignment: r1 (Tunde Bakare) and r2 (Ifeanyi Obi,
-- new cover) replaced, r3 live through the fast lane, r4 adds an epilogue (1.1% changed) and waits for a person.
-- The seeded live revision becomes r3; r1 and r2 are inserted before it.
update public.book_revisions
   set revision_no = 3, fast_lane = true, uploaded_by = '00000000-0000-4000-a000-000000000008', created_via = 'author',
       submitted_at = now() - interval '77 days 2 hours', published_at = now() - interval '77 days'
 where id = '00000000-0000-4000-d000-000000000007';
insert into public.book_revisions (id, book_id, revision_no, status, source_type, uploaded_by, created_via,
  base_revision_id, words, pages, price_credits, preview_percent, submitted_at, published_at, published_by,
  cover_sha256, manifest_key)
values
  ('00000000-0000-4000-d100-000000000097', '00000000-0000-4000-c000-000000000007', 1, 'superseded', 'docx',
   '00000000-0000-4000-b000-000000000003', 'staff', null, 65870, 264, 132, 10.0,
   now() - interval '190 days', now() - interval '189 days', '00000000-0000-4000-b000-000000000003', 'cover-a',
   'books/00000000-0000-4000-d100-000000000097/g1/manifest.json'),
  ('00000000-0000-4000-d100-000000000098', '00000000-0000-4000-c000-000000000007', 2, 'superseded', 'docx',
   '00000000-0000-4000-b000-000000000008', 'staff', '00000000-0000-4000-d100-000000000097', 65950, 264, 132, 10.0,
   now() - interval '128 days', now() - interval '127 days', '00000000-0000-4000-b000-000000000008', 'cover-b',
   'books/00000000-0000-4000-d100-000000000098/g1/manifest.json');
update public.book_revisions set base_revision_id = '00000000-0000-4000-d100-000000000098'
 where id = '00000000-0000-4000-d000-000000000007';
insert into public.revision_diffs (revision_id, base_revision_id, inserted_words, deleted_words, changed_pct,
  chapters_added, chapters_removed, changed_chapter_uids, cover_changed, metadata_changed, fast_lane_eligible,
  reasons)
values
  ('00000000-0000-4000-d100-000000000098', '00000000-0000-4000-d100-000000000097', 160, 80, 0.364, 0, 0, '{}',
   true, false, false, array['cover_changed']),
  ('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-d100-000000000098', 90, 40, 0.197, 0, 0,
   (select array_agg(chapter_uid::text order by ord) from public.chapters
     where revision_id = '00000000-0000-4000-d000-000000000007' and ord between 2 and 8),
   false, false, true, '{}');

-- Fast-lane updates of other live books (the "Recent fast-lane updates" panel and its spot audit).
create temporary table seed_fast (n int, base_no int, pct numeric, ago interval, audit public.fast_lane_result);
insert into seed_fast values
  (1, 2, 0.2, '7 days', 'ok'),
  (4, 1, 0.4, '21 days', 'ok'),
  (8, 1, 0.1, '30 days', 'ok'),
  (2, 2, 1.2, '9 days', 'pending');
update public.book_revisions r set revision_no = f.base_no + 1
  from seed_fast f where r.id = ('00000000-0000-4000-d000-' || lpad(f.n::text, 12, '0'))::uuid;
insert into public.book_revisions (id, book_id, revision_no, status, source_type, uploaded_by, words, pages,
  price_credits, preview_percent, submitted_at, published_at, published_by, manifest_key)
select ('00000000-0000-4000-d100-' || lpad((100 + f.n * 10 + g.i)::text, 12, '0'))::uuid, r.book_id, g.i,
  'superseded', 'docx', b.author_id, r.words, r.pages, r.price_credits, 10.0,
  r.submitted_at - make_interval(days => 40 * (f.base_no + 1 - g.i)),
  r.published_at - make_interval(days => 40 * (f.base_no + 1 - g.i)), '00000000-0000-4000-b000-000000000003',
  format('books/%s/g1/manifest.json', r.id)
from seed_fast f
join public.book_revisions r on r.id = ('00000000-0000-4000-d000-' || lpad(f.n::text, 12, '0'))::uuid
join public.books b on b.id = r.book_id
cross join lateral generate_series(1, f.base_no) g(i);
update public.book_revisions r
   set fast_lane = true, published_at = now() - f.ago, submitted_at = now() - f.ago - interval '20 minutes',
       base_revision_id = ('00000000-0000-4000-d100-' || lpad((100 + f.n * 10 + f.base_no)::text, 12, '0'))::uuid
  from seed_fast f where r.id = ('00000000-0000-4000-d000-' || lpad(f.n::text, 12, '0'))::uuid;
insert into public.revision_diffs (revision_id, base_revision_id, inserted_words, deleted_words, changed_pct,
  changed_chapter_uids, fast_lane_eligible)
select r.id, r.base_revision_id, round(r.words * f.pct / 200), round(r.words * f.pct / 200), f.pct,
  (select array_agg(c.chapter_uid::text order by c.ord) from public.chapters c
    where c.revision_id = r.id and c.ord in (1, 4)), true
from seed_fast f join public.book_revisions r on r.id = ('00000000-0000-4000-d000-' || lpad(f.n::text, 12, '0'))::uuid;
insert into public.fast_lane_audits (revision_id, status, audited_by, note, picked_at, audited_at)
select ('00000000-0000-4000-d000-' || lpad(f.n::text, 12, '0'))::uuid, f.audit,
  case when f.audit = 'ok' then '00000000-0000-4000-b000-000000000008'::uuid end, null,
  now() - f.ago + interval '1 day', case when f.audit = 'ok' then now() - f.ago + interval '2 days' end
from seed_fast f;

insert into public.book_revisions (id, book_id, revision_no, status, draft_step, source_type, uploaded_by,
  base_revision_id, words, pages, price_credits, preview_percent, submitted_at, routed_at, due_at, assigned_to,
  last_activity_at, steps, chapters_confirmed_at, generation, sealed_generation)
values ('00000000-0000-4000-d100-000000000099', '00000000-0000-4000-c000-000000000007', 4, 'ready_for_review',
  null, 'docx', '00000000-0000-4000-a000-000000000008', '00000000-0000-4000-d000-000000000007',
  66740, 267, 134, 10.0, now() - interval '26 hours', now() - interval '1 day', now() + interval '2 days',
  '00000000-0000-4000-b000-000000000003', now() - interval '2 hours',
  jsonb_build_object('received', now() - interval '26 hours', 'scored', now() - interval '1 day'),
  now() - interval '27 hours', 1, 1);
insert into public.revision_diffs (revision_id, base_revision_id, inserted_words, deleted_words, changed_pct,
  chapters_added, chapters_removed, changed_chapter_uids, added_chapter_uids, cover_changed, metadata_changed,
  author_in_good_standing, fast_lane_eligible, reasons)
values ('00000000-0000-4000-d100-000000000099', '00000000-0000-4000-d000-000000000007', 740, 0, 1.121, 1, 0,
  (select array_agg(chapter_uid::text) from public.chapters
    where revision_id = '00000000-0000-4000-d000-000000000007' and ord = 13),
  array[gen_random_uuid()::text], false, false, true, false, array['chapters_changed']);
select public._rescore('00000000-0000-4000-d100-000000000099');
