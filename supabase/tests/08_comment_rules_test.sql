-- Flow 08 · spec check 08-6: muted words on comments (held for review, automatic report, no
-- notification) and on paid messages to authors (refused before any charge; a reader under 18 is
-- also refused for Sexual content words, whatever their action).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- 1 adult reader (20 credits), 2 author, 3 reader aged 17 (20 credits), 4 another reader.
insert into auth.users (id, email, created_at)
select ('80860000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow08rules.test', now() - interval '60 days'
from generate_series(1, 4) n;
insert into public.profiles (id, full_name, is_author, date_of_birth)
select ('80860000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 2,
       case when n = 3 then (current_date - interval '17 years')::date else (current_date - interval '30 years')::date end
from generate_series(1, 4) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author,
  date_of_birth = excluded.date_of_birth;
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('80860000-0000-4000-a000-000000000001', 20, 'top_up', 'topup', 't86:g1'),
  ('80860000-0000-4000-a000-000000000003', 20, 'top_up', 'topup', 't86:g3');
insert into public.author_posts (id, author_id, title, body, state, published_at) values
  ('80860000-0000-4000-e000-000000000001', '80860000-0000-4000-a000-000000000002', 'Post', 'Hello readers', 'published', now());
delete from public.automod_words;
insert into public.automod_words (text, is_phrase, category, scope, action) values
  ('rubbishword', false, 'harassment', 'everywhere', 'hide_and_report'),
  ('mildword', false, 'abuse', 'everywhere', 'warn'),
  ('kiss me', true, 'sexual', 'chat_dms', 'warn');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- ─── Matcher ────────────────────────────────────────────────────────────────
select is((select count(*)::int from public._automod_hits('You are a RUBBBISHWORD!!', 'comment')), 1,
  'case and repeated letters still match');
select is((select count(*)::int from public._automod_hits('rubbishwords', 'comment')), 0, 'whole words only');
select is((select count(*)::int from public._automod_hits('kissme', 'dm')), 1, 'phrases also match squashed');
select is((select count(*)::int from public._automod_hits('kiss me', 'comment')), 0, 'chat and DM words skip comments');

-- ─── Comments ───────────────────────────────────────────────────────────────
select pg_temp.as_user('80860000-0000-4000-a000-000000000001');
create temporary table held as select (public.add_comment('80860000-0000-4000-e000-000000000001', null,
  'What a rubbishword post', '80860000-0000-4000-f100-000000000001') ->> 'id')::uuid as id;
update public.post_comments set created_at = now() - interval '1 minute' where id = (select id from held);
select is((select state::text from public.post_comments where id = (select id from held)), 'auto_hidden',
  'a Hide word holds the comment');
select is((select count(*)::int from public.reports where content_type = 'post_comment'
             and content_id = (select id from held) and reporter_id is null and status = 'auto_hidden'
             and reason = 'harassment'), 1, 'with an automatic report for moderators');
select is((select count(*)::int from pgmq.q_user_notify where message ->> 'comment_id' = (select id::text from held)), 0,
  'and nobody is notified');
select is((select comment_count from public.author_posts where id = '80860000-0000-4000-e000-000000000001'), 0,
  'a held comment is not counted');
select is(jsonb_array_length(public.get_post_comments('80860000-0000-4000-e000-000000000001') -> 'comments'), 1,
  'the commenter still sees it (under review)');
select pg_temp.as_user('80860000-0000-4000-a000-000000000004');
select is(jsonb_array_length(public.get_post_comments('80860000-0000-4000-e000-000000000001') -> 'comments'), 0,
  'other readers do not');
select is(public.add_comment('80860000-0000-4000-e000-000000000001', null, 'Bit of a mildword',
  '80860000-0000-4000-f100-000000000002') ->> 'state', 'visible', 'a Warn word has no comment form: it shows');
-- Paging (the cursor is the raw page's last row, so a held comment never stalls it).
create temporary table p1 as select public.get_post_comments('80860000-0000-4000-e000-000000000001', null, null, 1) as j;
select is((select jsonb_array_length(j -> 'comments') from p1), 0, 'page 1 holds only the held comment, hidden here');
select is((select j ->> 'has_more' from p1), 'true', 'and says there is more');
select is(public.get_post_comments('80860000-0000-4000-e000-000000000001',
  (select (j -> 'next' ->> 'at')::timestamptz from p1), (select (j -> 'next' ->> 'id')::uuid from p1), 1)
  -> 'comments' -> 0 ->> 'body', 'Bit of a mildword', 'the next page carries on after it');

-- ─── Paid messages ──────────────────────────────────────────────────────────
select pg_temp.as_user('80860000-0000-4000-a000-000000000001');
select public.ack_dm_cost('80860000-0000-4000-a000-000000000002');
select throws_ok($$select public.send_author_message('80860000-0000-4000-a000-000000000002',
  '80860000-0000-4000-f000-000000000001', 'This is rubbishword')$$, 'P0001', 'rejected_by_rules',
  'a Hide word refuses a paid message');
select is(public._balance('80860000-0000-4000-a000-000000000001'), 20, 'and nothing is charged');
select is((public.send_author_message('80860000-0000-4000-a000-000000000002',
  '80860000-0000-4000-f000-000000000002', 'Kiss me, Ifeoma') ->> 'balance')::int, 15,
  'an adult''s Warn word in the Sexual category is sent');

select pg_temp.as_user('80860000-0000-4000-a000-000000000003');
select public.ack_dm_cost('80860000-0000-4000-a000-000000000002');
select throws_ok($$select public.send_author_message('80860000-0000-4000-a000-000000000002',
  '80860000-0000-4000-f000-000000000003', 'Kiss me, Ifeoma')$$, 'P0001', 'rejected_by_rules',
  'the same message from a reader under 18 is refused');
select is(public._balance('80860000-0000-4000-a000-000000000003'), 20, 'without a charge');
select is((public.send_author_message('80860000-0000-4000-a000-000000000002',
  '80860000-0000-4000-f000-000000000004', 'Loved chapter two') ->> 'balance')::int, 15,
  'a clean message from the minor goes through');

select * from finish();
rollback;
