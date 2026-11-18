-- Flow 12 pipeline seed: books at every stage of the Books queue (Needs you, Processing, Sent back),
-- for the admin screens and their checks. Loaded after seed.sql (supabase/config.toml).
-- Ids: books 00000000-0000-4000-c100-…, revisions 00000000-0000-4000-d100-….

create temporary table seed_queue (n int, title text, author uuid, genre text, source public.source_type,
  status public.revision_status, words int, routed interval, assignee uuid, flags jsonb, step text);
insert into seed_queue values
  (1, 'Market Day in Onitsha', '00000000-0000-4000-a000-000000000005', 'Literary fiction', 'docx', 'needs_fixes',
   61204, '1 day', null,
   '[{"check_key":"image_too_large","message":"Chapter 12 has a picture of 6.2 MB. It will load slowly on mobile data.","suggestion":"Shrink it to about 1.2 MB. No visible change.","location":{"image":"img/12.jpg"},"auto_fixable":true,"fix_op":{"op":"shrink_image","image":"img/12.jpg"}},
     {"check_key":"chapter_title","message":"Chapter 4 starts with \"A debt in naira\" but it looks like body text, so it may not appear in the contents.","suggestion":"Make it the chapter 4 heading."},
     {"check_key":"repeated_text","message":"The end of \"Brother Chike\" is repeated at the start of the next chapter.","suggestion":"Remove the repeated paragraphs."}]', null),
  (2, 'The Prayer Warrior''s Wife', '00000000-0000-4000-a000-000000000009', 'Christian & Faith', 'pdf', 'needs_fixes',
   48210, '2 days', '00000000-0000-4000-b000-000000000003',
   '[{"check_key":"pdf_source","message":"This book was made from a PDF."},
     {"check_key":"low_structure_confidence","message":"Chapters and paragraphs came from a PDF, so check where they start and end."},
     {"check_key":"toc_mismatch","message":"The contents list has 18 chapters but 21 were found."},
     {"check_key":"cover_too_small","message":"The cover is 640 px wide; 800 px or more looks sharp."},
     {"check_key":"chapter_title","message":"Chapter 7 has no title.","suggestion":"Chapter 7"}]', null),
  (3, 'Garden of Small Mercies', '00000000-0000-4000-a000-000000000004', 'Christian & Faith', 'epub', 'ready_for_review',
   57300, '4 days', '00000000-0000-4000-b000-000000000001',
   '[{"check_key":"cover_aspect","message":"The cover is not the usual book shape (about 2 : 3)."}]', null),
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
   39900, null, null, '[]', null);

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
from seed_queue where status = 'sent_back';

-- An update to a live book: The Alignment r2 adds an epilogue (1.1% changed), waiting for review.
insert into public.book_revisions (id, book_id, revision_no, status, draft_step, source_type, uploaded_by,
  base_revision_id, words, pages, price_credits, preview_percent, submitted_at, routed_at, due_at, assigned_to,
  last_activity_at, steps, chapters_confirmed_at, generation, sealed_generation)
values ('00000000-0000-4000-d100-000000000099', '00000000-0000-4000-c000-000000000007', 2, 'ready_for_review',
  null, 'docx', '00000000-0000-4000-a000-000000000008', '00000000-0000-4000-d000-000000000007',
  66740, 267, 134, 10.0, now() - interval '26 hours', now() - interval '1 day', now() + interval '2 days',
  '00000000-0000-4000-b000-000000000003', now() - interval '2 hours',
  jsonb_build_object('received', now() - interval '26 hours', 'scored', now() - interval '1 day'),
  now() - interval '27 hours', 1, 1);
insert into public.revision_diffs (revision_id, base_revision_id, inserted_words, deleted_words, changed_pct,
  chapters_added, chapters_removed, cover_changed, metadata_changed, author_in_good_standing, fast_lane_eligible,
  reasons)
values ('00000000-0000-4000-d100-000000000099', '00000000-0000-4000-d000-000000000007', 740, 0, 1.121, 1, 0,
  false, false, true, false, array['chapters_added']);
select public._rescore('00000000-0000-4000-d100-000000000099');
