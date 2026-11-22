-- Flow 04 seed: paragraph anchors and the 10% preview cut for the seed books (as complete_seal
-- would write them), Ngozi's place in Harmattan Letters, and passage comments to discuss.
-- Loaded after 03_unlock.sql. Local and CI only.

-- ─── Paragraph anchors: ~150-word paragraphs, ids c{ord}p{i} ────────────────
with ch as (
  select c.revision_id, c.chapter_uid, c.ord as chapter_ord, c.words, c.words_before,
    greatest(ceil(c.words / 150.0)::int, 1) as n
  from public.chapters c
  join public.book_revisions r on r.id = c.revision_id
  where r.id::text like '00000000-0000-4000-d000-%'
), paras as (
  select ch.*, g.i,
    ch.words / ch.n + case when g.i < ch.words % ch.n then 1 else 0 end as pwords
  from ch cross join lateral generate_series(0, ch.n - 1) g(i)
), placed as (
  select *, words_before + coalesce(sum(pwords) over (partition by revision_id, chapter_ord order by i
            rows between unbounded preceding and 1 preceding), 0)::int as pbefore
  from paras
)
insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint, words, words_before)
select revision_id, 'c' || chapter_ord || 'p' || i, chapter_uid,
  (row_number() over (partition by revision_id order by chapter_ord, i) - 1)::int,
  md5(revision_id::text || chapter_ord || ':' || i), pwords, pbefore
from placed
on conflict do nothing;

-- ─── Preview cut at 10% of the words ────────────────────────────────────────
update public.book_revisions r set
  free_through_ord = coalesce((select max(c.ord) from public.chapters c
                               where c.revision_id = r.id and c.words_before + c.words <= r.words * 0.1), -1),
  preview_cut_para_id = cut.para_id,
  preview_cut_chapter_uid = cut.chapter_uid
from (
  select distinct on (a.revision_id) a.revision_id, a.para_id, a.chapter_uid
  from public.paragraph_anchors a join public.book_revisions x on x.id = a.revision_id
  where a.words_before + a.words >= x.words * 0.1
  order by a.revision_id, a.ord
) cut
where cut.revision_id = r.id and r.id::text like '00000000-0000-4000-d000-%';

-- ─── Ngozi is a few pages into Harmattan Letters (inside the free preview) ──
insert into public.reading_progress (user_id, book_id, revision_id, chapter_uid, para_id, char_offset, percent,
  max_percent, chapter_ord, max_chapter_ord, device_name, updated_at)
select '00000000-0000-4000-a000-000000000001', r.book_id, r.id, a.chapter_uid, a.para_id, 0,
  round(a.words_before * 100.0 / r.words, 1), round(a.words_before * 100.0 / r.words, 1), 0, 0,
  'Redmi Note 13', now() - interval '1 day'
from public.book_revisions r
join public.paragraph_anchors a on a.revision_id = r.id and a.para_id = 'c0p12'
where r.id = '00000000-0000-4000-d000-000000000001'
on conflict (user_id, book_id) do nothing;

-- ─── Passage comments (readers who finished Harmattan Letters) ──────────────
insert into public.passage_comments (book_id, para_id, user_id, body, created_at)
select '00000000-0000-4000-c000-000000000001', v.para, u.id, v.body, now() - v.age
from (values
  ('c0p3', 'chiamaka', 'The biscuit tin! My grandmother kept her letters in the exact same Danish cookies tin.', interval '3 days'),
  ('c0p3', 'tunji',    'This is where I knew the book would make me cry.', interval '2 days'),
  ('c0p3', 'hauwa',    'Read this paragraph three times. The detail about the rust on the lid is perfect.', interval '30 hours'),
  ('c0p8', 'kelechi',  'Mama Nkem saying nothing here says everything.', interval '20 hours'),
  ('c0p8', 'funke',    'The silence in this scene is so loud.', interval '5 hours'),
  ('c1p2', 'ibrahim',  'Kaduna in the harmattan, exactly like this. Dust on everything, even the prayers.', interval '4 hours')
) v(para, username, body, age)
join public.profiles u on u.username = v.username;

insert into public.passage_comment_reactions (comment_id, user_id, kind)
select pc.id, u.id, 'heart' from public.passage_comments pc
join public.profiles u on u.username in ('tunji', 'hauwa', 'kelechi') and u.id <> pc.user_id
where pc.book_id = '00000000-0000-4000-c000-000000000001' and pc.para_id = 'c0p3';
