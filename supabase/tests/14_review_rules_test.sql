-- Flow 14 · spec check 14-13: reviews meet the muted words (Hide, Blur and flag, Warn) and the
-- new-account link rule; a hidden review stays hidden through edits.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create function pg_temp.review(p_user uuid, p_book uuid) returns public.reviews language sql as $$
  select * from public.reviews where user_id = p_user and book_id = p_book
$$;
create function pg_temp.auto_report(p_user uuid) returns text language sql as $$
  select string_agg(r.status::text || ':' || r.reason::text, ',') from public.reports r
  where r.content_type = 'review' and r.reporter_id is null and r.reported_user_id = p_user
$$;

-- 1–4 old readers, 5 new reader (4 days old: past the 3-day review wait, under the 7-day link rule), 6 author.
insert into auth.users (id, email, created_at)
select ('14e00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t14e.local',
       case when n = 5 then now() - interval '4 days' else now() - interval '60 days' end
from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author)
select ('14e00000-0000-4000-a000-00000000000' || n)::uuid, 'Reviewer ' || n, n = 6 from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, genres, status) values
  ('14e00000-0000-4000-c000-000000000001', '14e00000-0000-4000-a000-000000000006', 'Reviewed', '{Fiction}', 'live');
insert into public.reading_progress (user_id, book_id, percent, max_percent)
select ('14e00000-0000-4000-a000-00000000000' || n)::uuid, '14e00000-0000-4000-c000-000000000001', 100, 100
from generate_series(1, 5) n;
insert into public.automod_words (text, is_phrase, category, scope, action) values
  ('hidethisword', false, 'harassment', 'reviews', 'hide'),
  ('blurthisword', false, 'spoilers', 'everywhere', 'blur'),
  ('warnthisword', false, 'abuse', 'everywhere', 'warn'),
  ('chatonlyword', false, 'abuse', 'chat_dms', 'hide');

-- ─── Hide ───────────────────────────────────────────────────────────────────
select pg_temp.as_user('14e00000-0000-4000-a000-000000000001');
select public.post_review('14e00000-0000-4000-c000-000000000001', 2, 'What H1D3THISWORD rubbish', false);
select pg_temp.as_owner();
select is((pg_temp.review('14e00000-0000-4000-a000-000000000001', '14e00000-0000-4000-c000-000000000001')).status,
  'hidden_by_mod', 'a Hide word (with substitutions) hides the review from others');
select is(pg_temp.auto_report('14e00000-0000-4000-a000-000000000001'), 'auto_hidden:harassment',
  'with an automatic report for moderators');
select is((select count(*)::int from public.automod_hits h join public.automod_words w on w.id = h.word_id
           where w.text = 'hidethisword'), 1, 'the hit is counted');

select pg_temp.as_user('14e00000-0000-4000-a000-000000000001');
select public.post_review('14e00000-0000-4000-c000-000000000001', 4, 'A clean edit', false);
select pg_temp.as_owner();
select is((pg_temp.review('14e00000-0000-4000-a000-000000000001', '14e00000-0000-4000-c000-000000000001')).status,
  'hidden_by_mod', 'a clean edit does not make a hidden review visible');
select is(pg_temp.auto_report('14e00000-0000-4000-a000-000000000001'), 'auto_hidden:harassment',
  'and adds no second report');

-- ─── Blur and flag ──────────────────────────────────────────────────────────
select pg_temp.as_user('14e00000-0000-4000-a000-000000000002');
select public.post_review('14e00000-0000-4000-c000-000000000001', 5, 'The blurthisword twist!', false);
select pg_temp.as_owner();
select is((select status || '/' || spoiler::text
           from pg_temp.review('14e00000-0000-4000-a000-000000000002', '14e00000-0000-4000-c000-000000000001')),
  'visible/true', 'a Blur word shows the review behind the spoiler blur');
select is(pg_temp.auto_report('14e00000-0000-4000-a000-000000000002'), 'open:spoilers', 'and flags it for moderators');

-- ─── Warn, chat-only words, clean text ──────────────────────────────────────
select pg_temp.as_user('14e00000-0000-4000-a000-000000000003');
select public.post_review('14e00000-0000-4000-c000-000000000001', 3, 'warnthisword and chatonlyword', false);
select pg_temp.as_owner();
select is((select status || '/' || spoiler::text
           from pg_temp.review('14e00000-0000-4000-a000-000000000003', '14e00000-0000-4000-c000-000000000001')),
  'visible/false', 'Warn and chat-only words leave a review as it is');
select is(pg_temp.auto_report('14e00000-0000-4000-a000-000000000003'), null, 'with no report');

-- ─── Links from new accounts ────────────────────────────────────────────────
select pg_temp.as_user('14e00000-0000-4000-a000-000000000005');
select throws_ok($$ select public.post_review('14e00000-0000-4000-c000-000000000001', 5, 'Buy at cheapbooks.com', false) $$,
  'rejected_by_rules', 'an account under 7 days cannot put a link in a review');
select lives_ok($$ select public.post_review('14e00000-0000-4000-c000-000000000001', 5, 'Loved it', false) $$,
  'the same account can post a review without one');
select pg_temp.as_user('14e00000-0000-4000-a000-000000000004');
select lives_ok($$ select public.post_review('14e00000-0000-4000-c000-000000000001', 5, 'See arpedia.africa', false) $$,
  'an older account can');

select * from finish();
rollback;
