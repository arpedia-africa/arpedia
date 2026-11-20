-- Flow 03 seed: the readers the unlock sheets need (Ngozi 840 credits with a plan, Bola 40 credits
-- with a plan, Dayo with no plan), Harmattan Letters' reviewers, and people who follow Ngozi (gift).
-- Loaded after seed.sql (supabase/config.toml). Password `arpedia-local`, local and CI only.
create temporary table seed_03_users (id uuid, email text, full_name text, username text);
insert into seed_03_users values
  ('00000000-0000-4000-a000-000000000030', 'bola@example.com',     'Bola Adeyemi',   'bola'),
  ('00000000-0000-4000-a000-000000000031', 'dayo@example.com',     'Dayo Ogunbiyi',  'dayo'),
  ('00000000-0000-4000-a000-000000000032', 'chiamaka@example.com', 'Chiamaka Obi',   'chiamaka'),
  ('00000000-0000-4000-a000-000000000033', 'tunji@example.com',    'Tunji Adebisi',  'tunji'),
  ('00000000-0000-4000-a000-000000000034', 'hauwa@example.com',    'Hauwa Musa',     'hauwa'),
  ('00000000-0000-4000-a000-000000000035', 'kelechi@example.com',  'Kelechi Nwosu',  'kelechi'),
  ('00000000-0000-4000-a000-000000000036', 'funke@example.com',    'Funke Alabi',    'funke'),
  ('00000000-0000-4000-a000-000000000037', 'ibrahim@example.com',  'Ibrahim Lawal',  'ibrahim'),
  ('00000000-0000-4000-a000-000000000038', 'emeka.agu@example.com','Emeka Agu',      'emekaagu');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('arpedia-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(), '', '', '', ''
from seed_03_users;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from seed_03_users;
insert into public.profiles (id, username, full_name)
select id, username, full_name from seed_03_users
on conflict (id) do update set username = excluded.username, full_name = excluded.full_name;
-- Seeded accounts have finished onboarding (flow 01).
update public.profiles set onboarding_step = 'done' where id in (select id from seed_03_users);

-- ─── Plans and credits ──────────────────────────────────────────────────────
insert into public.subscriptions (user_id, plan_code, status, period_start, period_end) values
  ('00000000-0000-4000-a000-000000000001', 'quarterly', 'active', now() - interval '30 days', now() + interval '60 days'),
  ('00000000-0000-4000-a000-000000000030', 'monthly',   'active', now() - interval '20 days', now() + interval '10 days');
insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, ref_type, idempotency_key, created_at,
  balance_after)
values
  ('00000000-0000-4000-a000-000000000030', 300, 'plan_grant', 'plan', now() + interval '10 days',
   'subscription', 'seed:plan:bola', now() - interval '20 days', 300);
-- Bola: 300 − Seven Bridges to Jos (143) − Bread on Water (77) − two 20-credit tips = 40.
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
  ref_type, ref_id, idempotency_key, created_at)
select '00000000-0000-4000-a000-000000000030', -x.credits, x.reason::public.ledger_reason, 'plan', b.id,
  b.author_id, x.credits * 160, 'book', b.id::text, x.key, now() - x.age
from (values
  ('Seven Bridges to Jos', null, 'unlock_all', 'seed:unlock:bola:bridges', interval '15 days'),
  ('Bread on Water',       null, 'unlock_all', 'seed:unlock:bola:bread',   interval '12 days'),
  ('Seven Bridges to Jos', 20,   'tip',        'seed:tip:bola:1',          interval '11 days'),
  ('Bread on Water',       20,   'tip',        'seed:tip:bola:2',          interval '9 days')
) v(title, tip, reason, key, age)
join public.books b on b.title = v.title
join public.book_revisions r on r.id = b.current_revision_id
cross join lateral (select coalesce(v.tip, r.price_credits) as credits, v.reason, v.key, v.age) x;
insert into public.entitlements (user_id, book_id, scope, source, ledger_id)
select l.user_id, l.book_id, 'book', 'unlock_all', l.id from public.credit_ledger l
where l.idempotency_key like 'seed:unlock:bola:%';
insert into public.tips (ledger_id, from_user_id, author_id, book_id, credits)
select l.id, l.user_id, l.author_id, l.book_id, -l.delta from public.credit_ledger l
where l.idempotency_key like 'seed:tip:bola:%';

-- ─── Harmattan Letters: tags, reviews, reads ────────────────────────────────
update public.books set tags = array['Family', 'Enugu', 'Kaduna', 'Letters']
where id = '00000000-0000-4000-c000-000000000001';
update public.book_revisions set language = 'English', age_rating = '13+', publisher = 'Arpedia Press',
  content_notes = array['Grief', 'Death of a spouse'], no_explicit = true, file_bytes = 2516582
where id = '00000000-0000-4000-d000-000000000001';

-- Reviewers have finished the book (reviews need 95%).
insert into public.reading_progress (user_id, book_id, percent, max_percent, chapter_ord, finished_at)
select id, '00000000-0000-4000-c000-000000000001', 100, 100, 13, now() - interval '10 days'
from seed_03_users where username in ('chiamaka', 'tunji', 'hauwa', 'kelechi', 'funke', 'ibrahim');
-- Ngozi finished Ruth of Ibadan on 10 November.
insert into public.reading_progress (user_id, book_id, percent, max_percent, chapter_ord, finished_at)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000002', 100, 100, 17,
        '2026-11-10 18:00+01');

insert into public.reviews (book_id, user_id, stars, body, created_at)
select '00000000-0000-4000-c000-000000000001', u.id, v.stars, v.body, now() - v.age
from (values
  ('chiamaka', 5, 'I read this in two sittings and then immediately started it again. The Kaduna letters felt like going home to a house I have never lived in.', interval '2 days'),
  ('tunji',    5, 'Quiet, observant and deeply moving. Mama Nkem is one of the best mothers-in-law in recent Nigerian fiction.', interval '5 days'),
  ('hauwa',    4, 'The letters structure is brilliant. I was nervous about the ending and the author stuck the landing.', interval '7 days'),
  ('kelechi',  5, 'The neighbour who fixes the gate deserves his own book. That is all.', interval '14 days'),
  ('funke',    4, 'Beautiful prose. A few slow patches in the middle, but the last two chapters made up for them.', interval '21 days'),
  ('ibrahim',  5, 'Gave my mother a copy. She called me from Kaduna to talk about it for an hour.', interval '30 days')
) v(username, stars, body, age)
join seed_03_users u on u.username = v.username;

-- Likes, as on s-reviews (24, 18, 11, 7, 5, 3): the reviewers and Ngozi like each other's reviews;
-- the counts beyond real likers are seed-only.
update public.reviews r set likes_count = v.likes
from (values ('chiamaka', 24), ('tunji', 18), ('hauwa', 11), ('kelechi', 7), ('funke', 5), ('ibrahim', 3)) v(username, likes)
join seed_03_users u on u.username = v.username
where r.user_id = u.id and r.book_id = '00000000-0000-4000-c000-000000000001';

-- Prototype figures for reads and comments (seed only; triggers keep them from here on).
update public.books set reads_count = 18000, comments_count = 640
where id = '00000000-0000-4000-c000-000000000001';

-- ─── Gift people: Kemi Ogunleye and Emeka Agu follow Ngozi ──────────────────
insert into public.follows (follower_id, followee_id) values
  ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000038', '00000000-0000-4000-a000-000000000001');

-- Readers also loved Harmattan Letters (co-finish counts, as the nightly job would build them).
insert into public.book_related (book_id, related_book_id, score) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000003', 40),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000002', 32),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000007', 21),
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000006', 12);

insert into public.book_rating_stats (book_id) select id from public.books on conflict do nothing;
