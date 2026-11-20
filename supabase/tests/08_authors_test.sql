-- Flow 08 · follow, author profile, paid messages (send_author_message, ack_dm_cost), posts and
-- comments, RLS on DM groups and follows, reply-time stats.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ─── Fixtures ───────────────────────────────────────────────────────────────
-- 1 reader (20 credits), 2 reader (3 credits), 3 author, 4 reader the author blocked,
-- 5 reader who blocked the author, 6 reader (not an author, no thread), 7 new account (20 credits).
insert into auth.users (id, email, created_at)
select ('80800000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow08.test',
       case when n = 7 then now() - interval '1 day' else now() - interval '60 days' end
from generate_series(1, 7) n;
insert into public.profiles (id, full_name, is_author)
select ('80800000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 3 from generate_series(1, 7) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('80800000-0000-4000-a000-000000000001', 20, 'top_up', 'topup', 't8:g1'),
  ('80800000-0000-4000-a000-000000000002', 3, 'top_up', 'topup', 't8:g2'),
  ('80800000-0000-4000-a000-000000000007', 20, 'top_up', 'topup', 't8:g7');
insert into public.user_blocks (blocker_id, blocked_id) values
  ('80800000-0000-4000-a000-000000000003', '80800000-0000-4000-a000-000000000004'),
  ('80800000-0000-4000-a000-000000000005', '80800000-0000-4000-a000-000000000003');
insert into public.author_posts (id, author_id, title, body, state, published_at) values
  ('80800000-0000-4000-e000-000000000001', '80800000-0000-4000-a000-000000000003', 'Post', 'Hello readers', 'published', now()),
  ('80800000-0000-4000-e000-000000000002', '80800000-0000-4000-a000-000000000003', 'Draft', 'Not yet', 'draft', null);

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- ─── Follow ─────────────────────────────────────────────────────────────────
select pg_temp.as_user('80800000-0000-4000-a000-000000000001');
select is((public.follow_author('80800000-0000-4000-a000-000000000003') ->> 'follower_count')::int, 1, 'follow counts 1');
select is((public.follow_author('80800000-0000-4000-a000-000000000003') ->> 'follower_count')::int, 1, 'follow is idempotent');
select throws_ok($$select public.follow_author('80800000-0000-4000-a000-000000000006')$$, 'P0001', 'not_found',
  'cannot follow someone who is not an author');
select pg_temp.as_user('80800000-0000-4000-a000-000000000005');
select throws_ok($$select public.follow_author('80800000-0000-4000-a000-000000000003')$$, 'P0001', 'blocked',
  'cannot follow an author you blocked');
select pg_temp.as_user('80800000-0000-4000-a000-000000000003');
select throws_ok($$select public.follow_author('80800000-0000-4000-a000-000000000003')$$, 'P0001', 'own_profile',
  'cannot follow yourself');

set local role authenticated;
select is((select count(*)::int from public.follows where followee_id = '80800000-0000-4000-a000-000000000003'), 0,
  'the author cannot see who follows them');
select pg_temp.as_user('80800000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.follows where followee_id = '80800000-0000-4000-a000-000000000003'), 1,
  'the follower sees their own follow');
select is((select follower_count from public.author_stats where author_id = '80800000-0000-4000-a000-000000000003'), 1,
  'anyone reads the follower count');
reset role;
select is((public.unfollow_author('80800000-0000-4000-a000-000000000003') ->> 'follower_count')::int, 0, 'unfollow counts 0');
select public.follow_author('80800000-0000-4000-a000-000000000003');

-- ─── Profile ────────────────────────────────────────────────────────────────
select is(public.get_author_profile('80800000-0000-4000-a000-000000000003') -> 'message' ->> 'available', 'true',
  'reader can message the author');
select is((public.get_author_profile('80800000-0000-4000-a000-000000000003') -> 'message' ->> 'cost_credits')::int, 5,
  'message price comes from config');
select is(public.get_author_profile('80800000-0000-4000-a000-000000000003') ->> 'following', 'true', 'profile shows following');
select pg_temp.as_user('80800000-0000-4000-a000-000000000004');
select is(public.get_author_profile('80800000-0000-4000-a000-000000000003') -> 'message' ->> 'reason', 'author_unavailable',
  'author who blocked the reader: messaging unavailable, no reason given');
select pg_temp.as_user('80800000-0000-4000-a000-000000000005');
select is(public.get_author_profile('80800000-0000-4000-a000-000000000003') ->> 'blocked_by_me', 'true', 'viewer blocked the author');
select is((select count(*)::int from public.get_author_posts('80800000-0000-4000-a000-000000000003')), 0,
  'posts hidden when the viewer blocked the author');

-- ─── Paid messages ──────────────────────────────────────────────────────────
select pg_temp.as_user('80800000-0000-4000-a000-000000000001');
select throws_ok($$select public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000001', 'Hi')$$, 'P0001', 'ack_required', 'no send before the cost notice');
select is((public.ack_dm_cost('80800000-0000-4000-a000-000000000003') ->> 'balance')::int, 20,
  'ack_dm_cost returns the true balance');
select is((public.start_author_dm('80800000-0000-4000-a000-000000000003') ->> 'group_id'),
  (public.get_author_thread('80800000-0000-4000-a000-000000000003') ->> 'group_id'), 'one thread per reader and author');
select is((public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000001', '  Hi Ifeoma!  ') ->> 'balance')::int, 15, 'first message deducts exactly 5');
select results_eq($$select delta, reason::text, author_id, author_earning_kobo from public.credit_ledger
  where user_id = '80800000-0000-4000-a000-000000000001' and reason = 'message'$$,
  $$values (-5, 'message', '80800000-0000-4000-a000-000000000003'::uuid, 800)$$,
  'one ledger row, -5, author earns ₦8.00');
select is((select cost_credits from public.messages where client_id = '80800000-0000-4000-f000-000000000001'), 5,
  'message stored with its cost');
select ok((select m.ledger_id = l.id from public.messages m join public.credit_ledger l on l.id = m.ledger_id
  where m.client_id = '80800000-0000-4000-f000-000000000001'), 'message carries its ledger row');
select is((public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000001', 'Hi Ifeoma!') ->> 'replayed'), 'true', 'retry with the same client_id replays');
select is((select count(*)::int from public.credit_ledger
  where user_id = '80800000-0000-4000-a000-000000000001' and reason = 'message'), 1, 'a retry never charges twice');
select throws_ok($$select public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000009', '')$$, 'P0001', 'bad_body', 'empty message rejected');

select pg_temp.as_user('80800000-0000-4000-a000-000000000002');
select public.ack_dm_cost('80800000-0000-4000-a000-000000000003');
select throws_ok($$select public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000002', 'Hello')$$, 'P0001', 'insufficient_credits', 'send blocked with 3 credits');
select is((select count(*)::int from public.messages where sender_id = '80800000-0000-4000-a000-000000000002')
  + (select count(*)::int from public.credit_ledger where user_id = '80800000-0000-4000-a000-000000000002' and reason = 'message'),
  0, 'no ledger row and no message when short');

select pg_temp.as_user('80800000-0000-4000-a000-000000000004');
select throws_ok($$select public.start_author_dm('80800000-0000-4000-a000-000000000003')$$, 'P0001', 'author_unavailable',
  'author who blocked the reader: no thread');
select throws_ok($$select public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000004', 'Hello')$$, 'P0001', 'author_unavailable', 'blocked pair cannot send');
select pg_temp.as_user('80800000-0000-4000-a000-000000000005');
select throws_ok($$select public.start_author_dm('80800000-0000-4000-a000-000000000003')$$, 'P0001', 'blocked',
  'reader who blocked the author cannot start a thread');
select is((select count(*)::int from public.credit_ledger where reason = 'message'
  and user_id in ('80800000-0000-4000-a000-000000000004', '80800000-0000-4000-a000-000000000005')), 0,
  'nothing charged for blocked pairs');

select pg_temp.as_user('80800000-0000-4000-a000-000000000007');
select public.ack_dm_cost('80800000-0000-4000-a000-000000000003');
select throws_ok($$select public.send_author_message('80800000-0000-4000-a000-000000000003',
  '80800000-0000-4000-f000-000000000007', 'call me on 0803 123 4567')$$, 'P0001', 'rejected_by_rules',
  'new accounts cannot send phone numbers');

-- Chat path: the reader can't post for free through the Durable Object; the author can.
select is((select reason from public.post_block_for(
  (select public._author_dm('80800000-0000-4000-a000-000000000001', '80800000-0000-4000-a000-000000000003')),
  '80800000-0000-4000-a000-000000000001')), 'paid_only', 'reader messages in an author thread are paid only');
select is((select reason from public.post_block_for(
  (select public._author_dm('80800000-0000-4000-a000-000000000001', '80800000-0000-4000-a000-000000000003')),
  '80800000-0000-4000-a000-000000000003')), null, 'the author replies free through chat');

-- RLS on DM groups.
create temporary table dm_id as
  select public._author_dm('80800000-0000-4000-a000-000000000001', '80800000-0000-4000-a000-000000000003') as id;
grant select on dm_id to authenticated;
set local role authenticated;
select pg_temp.as_user('80800000-0000-4000-a000-000000000006');
select is((select count(*)::int from public.groups where id = (select id from dm_id))
  + (select count(*)::int from public.messages where group_id = (select id from dm_id)), 0,
  'outsiders cannot read the thread or its messages');
select pg_temp.as_user('80800000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.messages where group_id = (select id from dm_id)), 1, 'the author reads the thread');
reset role;
select is(public.get_dm_reader((select id from dm_id)) ->> 'under_18', 'false', 'author sees the reader, with Under 18 flag');
select pg_temp.as_user('80800000-0000-4000-a000-000000000001');
select throws_ok($$select public.get_dm_reader((select id from dm_id))$$, 'P0001', 'not_found', 'only the author reads get_dm_reader');

-- ─── Comments ───────────────────────────────────────────────────────────────
create temporary table c1 as select (public.add_comment('80800000-0000-4000-e000-000000000001', null, 'First!',
  '80800000-0000-4000-f100-000000000001') ->> 'id')::uuid as id;
select is((select comment_count from public.author_posts where id = '80800000-0000-4000-e000-000000000001'), 1, 'comment counted');
select is((public.add_comment('80800000-0000-4000-e000-000000000001', null, 'First!',
  '80800000-0000-4000-f100-000000000001') ->> 'replayed'), 'true', 'comment retry replays');
select pg_temp.as_user('80800000-0000-4000-a000-000000000002');
create temporary table c2 as select (public.add_comment('80800000-0000-4000-e000-000000000001', (select id from c1),
  'Agree', '80800000-0000-4000-f100-000000000002') ->> 'id')::uuid as id;
select pg_temp.as_user('80800000-0000-4000-a000-000000000001');
select is((public.add_comment('80800000-0000-4000-e000-000000000001', (select id from c2), 'User 2 thanks',
  '80800000-0000-4000-f100-000000000003') ->> 'parent_id')::uuid, (select id from c1), 'a reply to a reply attaches to the same parent');
select pg_temp.as_user('80800000-0000-4000-a000-000000000002');
select is(public.delete_comment((select id from c2)) ->> 'state', 'deleted', 'deleting your own comment');
select pg_temp.as_user('80800000-0000-4000-a000-000000000006');
select throws_ok($$select public.delete_comment((select id from c1))$$, 'P0001', 'not_allowed', 'others cannot delete');
select pg_temp.as_user('80800000-0000-4000-a000-000000000003');
select is(public.delete_comment((select id from c1)) ->> 'state', 'removed', 'the author removes comments on their post');
select pg_temp.as_user('80800000-0000-4000-a000-000000000001');
select throws_ok($$select public.get_post('80800000-0000-4000-e000-000000000002')$$, 'P0001', 'not_found', 'drafts are private');
select is((public.like_post('80800000-0000-4000-e000-000000000001', true) ->> 'like_count')::int, 1, 'like counts');

select * from finish();
rollback;
