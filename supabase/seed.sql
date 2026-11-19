-- Local and CI seed, mirroring the prototype: Ngozi (reader), Ifeoma (author), Harmattan Letters
-- and 7 other books with chapters and prices, and one staff member per role.
-- Every account's password is `arpedia-local` (local and CI only; never used on staging).

-- ─── Users ──────────────────────────────────────────────────────────────────
create temporary table seed_users (id uuid, email text, full_name text, username text, is_author boolean,
  role public.staff_role);
insert into seed_users values
  ('00000000-0000-4000-a000-000000000001', 'ngozi@example.com',     'Ngozi Eze',                'ngozieze4821',   false, null),
  ('00000000-0000-4000-a000-000000000002', 'ifeoma@example.com',    'Ifeoma Nwachukwu',         'ifeoma',         true,  null),
  ('00000000-0000-4000-a000-000000000003', 'tolu@example.com',      'Tolu Adebayo',             'tolu',           true,  null),
  ('00000000-0000-4000-a000-000000000004', 'kemi.o@example.com',    'Kemi Ogunleye',            'kemi',           true,  null),
  ('00000000-0000-4000-a000-000000000005', 'chioma@example.com',    'Chioma Okafor',            'chioma',         true,  null),
  ('00000000-0000-4000-a000-000000000006', 'musa@example.com',      'Musa Danladi',             'musa',           true,  null),
  ('00000000-0000-4000-a000-000000000007', 'emeka@example.com',     'Emeka Obi',                'emeka',          true,  null),
  ('00000000-0000-4000-a000-000000000008', 'adaeze@example.com',    'Adaeze Rosemary Possible', 'adaeze',         true,  null),
  ('00000000-0000-4000-a000-000000000009', 'halima@example.com',    'Halima Bello',             'halima',         true,  null),
  ('00000000-0000-4000-b000-000000000001', 'amaka@arpedia.africa',  'Amaka Okafor',             'amaka.staff',    false, 'super_admin'),
  ('00000000-0000-4000-b000-000000000002', 'femi@arpedia.africa',   'Femi Lawson',              'femi.staff',     false, 'operations_admin'),
  ('00000000-0000-4000-b000-000000000003', 'tunde@arpedia.africa',  'Tunde Bakare',             'tunde.staff',    false, 'publisher'),
  ('00000000-0000-4000-b000-000000000004', 'zainab@arpedia.africa', 'Zainab Yusuf',             'zainab.staff',   false, 'moderator'),
  ('00000000-0000-4000-b000-000000000005', 'chinedu@arpedia.africa','Chinedu Eze',              'chinedu.staff',  false, 'finance'),
  ('00000000-0000-4000-b000-000000000006', 'bisi@arpedia.africa',   'Bisi Adeyemi',             'bisi.staff',     false, 'support'),
  ('00000000-0000-4000-b000-000000000007', 'kemi@arpedia.africa',   'Kemi Danjuma',             'kemid.staff',    false, 'analyst'),
  ('00000000-0000-4000-b000-000000000008', 'ifeanyi@arpedia.africa','Ifeanyi Obi',              'ifeanyi.staff',  false, 'publisher');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('arpedia-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(),
  '', '', '', ''
from seed_users;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from seed_users;

-- A later flow may add a trigger that creates profiles on sign-up; upsert so both work.
insert into public.profiles (id, username, full_name, is_author)
select id, username, full_name, is_author from seed_users
on conflict (id) do update set username = excluded.username, full_name = excluded.full_name,
  is_author = excluded.is_author;

insert into public.staff_roles (user_id, role)
select id, role from seed_users where role is not null;

-- Every seeded staff member has a verified authenticator with the same local-only TOTP secret,
-- so tools (smoke-admin, parity --admin) can pass two-step: tools/totp.mjs makes the code.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
select gen_random_uuid(), id, 'Authenticator', 'totp', 'verified', now(), now(), 'ARPEDIALOCALTOTPSEEDSECRETXXXXXX'
from seed_users where role is not null;

-- Recent activity, as on s-team.
update public.staff_roles s set last_active_at = now() - v.ago
from (values
  ('00000000-0000-4000-b000-000000000002'::uuid, interval '40 minutes'),
  ('00000000-0000-4000-b000-000000000003'::uuid, interval '58 minutes'),
  ('00000000-0000-4000-b000-000000000008'::uuid, interval '90 minutes'),
  ('00000000-0000-4000-b000-000000000004'::uuid, interval '73 minutes'),
  ('00000000-0000-4000-b000-000000000005'::uuid, interval '86 minutes'),
  ('00000000-0000-4000-b000-000000000006'::uuid, interval '1 day'),
  ('00000000-0000-4000-b000-000000000007'::uuid, interval '8 days')
) as v (id, ago)
where s.user_id = v.id;

-- One open invite, as on s-team (the token is unknown, so the link itself never works).
insert into public.staff_invites (email, full_name, role, invited_by, token_hash, expires_at)
values ('adaora@arpedia.africa', 'Adaora Nnadi', 'support', '00000000-0000-4000-b000-000000000001',
  encode(extensions.gen_random_bytes(32), 'hex'), now() + interval '70 hours');

-- ─── Books ──────────────────────────────────────────────────────────────────
-- words → pages = ceil(words / 250) → price = ceil(pages / 2) (packages/core pricing).
create temporary table seed_books (n int, title text, author uuid, genre text, words int, chapters int,
  description text);
insert into seed_books values
  (1, 'Harmattan Letters',     '00000000-0000-4000-a000-000000000002', 'Christian & Faith', 62400, 14,
   'A widow in Enugu finds her late husband''s unsent letters in a biscuit tin and learns he was praying for her years before they met. Over one dusty harmattan season she reads them in order, and each one changes how she sees her marriage.'),
  (2, 'Ruth of Ibadan',        '00000000-0000-4000-a000-000000000003', 'Romance',           79800, 18,
   'A schoolteacher leaves Ibadan for her mother-in-law''s village and finds a second home she never planned for.'),
  (3, 'A House Called Grace',  '00000000-0000-4000-a000-000000000004', 'Christian & Faith', 48750, 12,
   'Three sisters inherit a crumbling house in Abeokuta and one stubborn tenant who will not leave.'),
  (4, 'Still Waters, Lagos',   '00000000-0000-4000-a000-000000000005', 'Literary fiction',  55000, 15,
   'A ferry pilot on the Lagos lagoon keeps a secret for twenty years, until the water gives it back.'),
  (5, 'Seven Bridges to Jos',  '00000000-0000-4000-a000-000000000006', 'Thriller',          71480, 20,
   'A courier has one night and seven bridges to deliver a package nobody admits sending.'),
  (6, 'Psalms for the Danfo',  '00000000-0000-4000-a000-000000000007', 'Poetry',            21000,  9,
   'Poems written in traffic, between bus stops, for everyone who prays on the way to work.'),
  (7, 'The Alignment',         '00000000-0000-4000-a000-000000000008', 'Christian romance', 66000, 16,
   'Two church planners with opposite plans for the same Sunday discover they want the same thing.'),
  (8, 'Bread on Water',        '00000000-0000-4000-a000-000000000009', 'Short stories',     38500, 11,
   'Eleven stories about kindness that comes back, from Kano to Calabar.');

insert into public.books (id, author_id, title, genres, description, status, created_at)
select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid, author, title, array[genre], description,
  'live', now() - make_interval(days => 60 - n * 5)
from seed_books;

insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits,
  preview_percent, submitted_at, published_at)
select ('00000000-0000-4000-d000-' || lpad(n::text, 12, '0'))::uuid,
  ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid, 1, 'live', words,
  ceil(words / 250.0)::int, ceil(ceil(words / 250.0) / 2.0)::int, 10.0,
  now() - make_interval(days => 62 - n * 5), now() - make_interval(days => 60 - n * 5)
from seed_books;

update public.books b set current_revision_id = r.id
from public.book_revisions r where r.book_id = b.id;

-- Chapters: words spread evenly; chapters entirely inside the 10% preview cost 0; the price is
-- spread over the rest by exact pages with largest remainders, so it sums exactly (packages/core
-- chapterPrices).
with ch as (
  select b.n, r.id as revision_id, r.price_credits as price, g.i as ord,
    (b.words / b.chapters + case when g.i < b.words % b.chapters then 1 else 0 end) as words,
    b.words as total, b.chapters
  from seed_books b
  join public.book_revisions r on r.id = ('00000000-0000-4000-d000-' || lpad(b.n::text, 12, '0'))::uuid
  cross join lateral generate_series(0, b.chapters - 1) g(i)
), placed as (
  select *, coalesce(sum(words) over (partition by n order by ord rows between unbounded preceding and 1 preceding), 0)::int as words_before
  from ch
), weighted as (
  select *, case when words_before + words <= total * 0.1 then 0 else words / 250.0 end as weight
  from placed
), shares as (
  select *, price * weight / sum(weight) over (partition by n) as exact
  from weighted
), ranked as (
  select *, floor(exact)::int as fl,
    row_number() over (partition by n order by (exact - floor(exact)) desc, ord) as rk,
    price - sum(floor(exact)) over (partition by n) as leftover
  from shares
)
insert into public.chapters (revision_id, ord, kind, title, words, words_before, pages, price_credits,
  free_file, full_file)
select revision_id, ord, 'chapter', 'Chapter ' || (ord + 1), words, words_before, round(words / 250.0, 2),
  fl + case when weight > 0 and rk <= leftover then 1 else 0 end,
  case when words_before < total * 0.1 then 'c' || ord || '.free' end, 'c' || ord || '.full'
from ranked;

-- ─── Credits ────────────────────────────────────────────────────────────────
-- Ngozi: quarterly plan grant 800 + top-up 200, unlocked Ruth of Ibadan (160) → 840, as on s-book.
insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, ref_type, idempotency_key, created_at)
values
  ('00000000-0000-4000-a000-000000000001', 800, 'plan_grant', 'plan', now() + interval '60 days',
   'subscription', 'seed:plan:ngozi', now() - interval '30 days'),
  ('00000000-0000-4000-a000-000000000001', 200, 'top_up', 'topup', null,
   'transaction', 'seed:topup:ngozi', now() - interval '20 days');

with spend as (
  insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
    ref_type, ref_id, idempotency_key, created_at)
  select '00000000-0000-4000-a000-000000000001', -r.price_credits, 'unlock_all', 'plan', b.id, b.author_id,
    r.price_credits * 160, 'book', b.id::text, 'seed:unlock:ngozi:ruth', now() - interval '10 days'
  from public.books b join public.book_revisions r on r.id = b.current_revision_id
  where b.title = 'Ruth of Ibadan'
  returning id, book_id
)
insert into public.entitlements (user_id, book_id, scope, source, ledger_id)
select '00000000-0000-4000-a000-000000000001', book_id, 'book', 'unlock_all', id from spend;

-- ─── Flow 01 · onboarding ───────────────────────────────────────────────────
-- Seeded accounts have finished onboarding; Ngozi picked Fiction and Nigerian books.
update public.profiles set onboarding_step = 'done', signup_intent = case when is_author then 'author' else 'reader' end::public.signup_intent,
  terms_version = 1, privacy_version = 1, terms_accepted_at = now()
where id in (select id from seed_users);
insert into public.user_genres (user_id, genre_id)
select '00000000-0000-4000-a000-000000000001', id from public.genres where slug in ('fiction', 'nigerian-books');
-- Tag the seed books with launch genres too, so genre picks find them.
update public.books set genres = genres || case title
    when 'Harmattan Letters'    then array['Fiction', 'Christian', 'Nigerian books']
    when 'Ruth of Ibadan'       then array['Fiction', 'Nigerian books']
    when 'A House Called Grace' then array['Fiction', 'Christian', 'Drama']
    when 'Still Waters, Lagos'  then array['Fiction', 'African literature', 'Nigerian books']
    when 'Seven Bridges to Jos' then array['Fiction', 'Drama']
    when 'Psalms for the Danfo' then array['Faith', 'Short reads']
    when 'The Alignment'        then array['Fiction']
    when 'Bread on Water'       then array['Short reads', 'African literature']
  end
where id in (select ('00000000-0000-4000-c000-' || lpad(n::text, 12, '0'))::uuid from seed_books);

-- ─── Flow 06 · community ────────────────────────────────────────────────────
-- Groups, messages and blocks as on s-community, s-channel, s-discover and s-blocked. Member counts
-- are the real seeded rows, not the prototype's 1,240.
insert into public.groups (id, kind, name, description, owner_id, book_id, visibility, who_can_post,
  weekly_book_id, weekly_from_chapter, weekly_to_chapter, weekly_note, created_at) values
  ('00000000-0000-4000-d000-000000000001', 'club', 'Grace Readers',
   'Christian fiction book club. This week: Harmattan Letters ch. 7–9.', '00000000-0000-4000-a000-000000000005',
   null, 'public', 'members', '00000000-0000-4000-c000-000000000001', 7, 9, 'Vigil call Friday 8 pm', now() - interval '90 days'),
  ('00000000-0000-4000-d000-000000000002', 'author', 'Ifeoma''s Readers',
   'The official community for readers of Ifeoma Nwachukwu.', '00000000-0000-4000-a000-000000000002',
   null, 'public', 'owner_and_followers', null, null, null, null, now() - interval '80 days'),
  ('00000000-0000-4000-d000-000000000003', 'official', 'Arpedia Official',
   'Announcements, new releases and reading challenges.', '00000000-0000-4000-b000-000000000001',
   null, 'public', 'staff', null, null, null, null, now() - interval '120 days'),
  ('00000000-0000-4000-d000-000000000004', 'official', 'Arpedia Support',
   'Ask us anything about Arpedia.', '00000000-0000-4000-b000-000000000001',
   null, 'private', 'staff', null, null, null, null, now() - interval '120 days'),
  ('00000000-0000-4000-d000-000000000005', 'readalong', 'Harmattan Letters Read-Along',
   'Week-by-week discussion. Please mark spoilers.', '00000000-0000-4000-a000-000000000002',
   '00000000-0000-4000-c000-000000000001', 'public', 'members', null, null, null, null, now() - interval '30 days'),
  ('00000000-0000-4000-d000-000000000006', 'dm', 'Ngozi and Ifeoma', null, null,
   null, 'private', 'members', null, null, null, null, now() - interval '10 days'),
  ('00000000-0000-4000-d000-000000000007', 'club', 'Faith & Books',
   'Christian and faith-based reading, devotionals and testimonies.', '00000000-0000-4000-a000-000000000004',
   null, 'public', 'members', null, null, null, null, now() - interval '60 days'),
  ('00000000-0000-4000-d000-000000000008', 'club', 'Short Reads Lounge',
   'Quick stories for quick commutes. Share the ones you finished on the danfo.', '00000000-0000-4000-a000-000000000007',
   null, 'public', 'members', null, null, null, null, now() - interval '50 days'),
  ('00000000-0000-4000-d000-000000000009', 'club', 'UNN Christian Fellowship Books',
   'Campus reading group. Next pick vote closes Friday.', '00000000-0000-4000-a000-000000000006',
   null, 'public', 'members', null, null, null, null, now() - interval '40 days');

-- a000-…01 Ngozi · 02 Ifeoma · 03 Tolu · 04 Kemi · 05 Chioma · 06 Musa · 07 Emeka · 08 Adaeze · 09 Halima
insert into public.group_members (group_id, user_id, role, joined_at, last_read_at)
select ('00000000-0000-4000-d000-' || lpad(g::text, 12, '0'))::uuid,
       ('00000000-0000-4000-' || u)::uuid, r::public.group_role, now() - interval '30 days', now() - interval '6 days'
from (values
  (1, 'a000-000000000005', 'owner'), (1, 'a000-000000000001', 'member'), (1, 'a000-000000000002', 'member'),
  (1, 'a000-000000000009', 'moderator'), (1, 'a000-000000000006', 'member'), (1, 'a000-000000000008', 'member'),
  (1, 'a000-000000000003', 'member'),
  (2, 'a000-000000000002', 'owner'), (2, 'a000-000000000001', 'member'), (2, 'a000-000000000005', 'member'),
  (2, 'a000-000000000004', 'member'),
  (3, 'b000-000000000001', 'owner'), (3, 'a000-000000000001', 'member'), (3, 'a000-000000000002', 'member'),
  (3, 'a000-000000000003', 'member'), (3, 'a000-000000000004', 'member'), (3, 'a000-000000000005', 'member'),
  (3, 'a000-000000000006', 'member'), (3, 'a000-000000000007', 'member'), (3, 'a000-000000000008', 'member'),
  (3, 'a000-000000000009', 'member'),
  (4, 'b000-000000000001', 'owner'), (4, 'a000-000000000001', 'member'),
  (5, 'a000-000000000002', 'owner'), (5, 'a000-000000000001', 'member'), (5, 'a000-000000000009', 'member'),
  (6, 'a000-000000000001', 'member'), (6, 'a000-000000000002', 'member'),
  (7, 'a000-000000000004', 'owner'), (7, 'a000-000000000003', 'member'), (7, 'a000-000000000008', 'member'),
  (8, 'a000-000000000007', 'owner'), (8, 'a000-000000000003', 'member'),
  (9, 'a000-000000000006', 'owner'), (9, 'a000-000000000009', 'member')
) as t (g, u, r);

-- (group, sender, minutes ago, body, quote). Ngozi last read 6 days ago, so the newest ones are unread.
create temporary table seed_messages (g int, u text, ago int, body text, quote jsonb);
insert into seed_messages values
  (1, 'a000-000000000009', 1500, 'Welcome to this week''s reading! Chapters 7 to 9, vigil call on Friday.', null),
  (1, 'a000-000000000008', 1440, 'I finished chapter 7 on the bus this morning. Wow.', null),
  (1, 'a000-000000000006', 40, 'Please no spoilers past chapter 8 abeg', null),
  (1, 'a000-000000000001', 24, 'This one is for everyone waiting on God 🙏🏾',
   jsonb_build_object('book_id', '00000000-0000-4000-c000-000000000001', 'chapter', 7,
     'cfi', 'epubcfi(/6/16!/4/2/1:0)', 'book_title', 'Harmattan Letters',
     'text', 'Grace did not ask her to be ready. It only asked her to come.')),
  (1, 'a000-000000000002', 6, 'I cried writing it. My mother''s vigil songs are in there.', null),
  (1, 'a000-000000000005', 1, 'The night vigil chapter 😢 who else cried?', null),
  (6, 'a000-000000000001', 70, 'Chapter 11 left me with so many questions! Does Adaeze ever read the last letter?', null),
  (6, 'a000-000000000002', 45, 'Thank you Ngozi! Chapter 12 will answer that 😊', null),
  (2, 'a000-000000000005', 300, 'Who else is rereading Harmattan Letters before the sequel?', null),
  (2, 'a000-000000000002', 120, 'Thank you all for 800 readers! Questions for Friday go here.', null),
  (2, 'a000-000000000002', 62, 'A small treat: I will answer three questions on Friday', null),
  (3, 'b000-000000000001', 600, 'New this week: Psalms for the Danfo by Emeka Obi.', null),
  (3, 'b000-000000000001', 180, 'Reading challenge: finish one book this month to enter the free-year draw', null),
  (5, 'a000-000000000002', 9000, 'Week 1 starts today: chapters 1 to 4.', null),
  (5, 'a000-000000000009', 300, 'Friday we move to chapter 9. Catch up!', null),
  (4, 'b000-000000000001', 5760, 'Hello Ngozi, welcome to Arpedia. Ask us anything here.', null),
  (7, 'a000-000000000004', 200, 'Morning devotional pick: A House Called Grace, chapter 2.', null),
  (8, 'a000-000000000007', 400, 'Finished Bread on Water between Ojota and CMS. Story 4 is the one.', null),
  (9, 'a000-000000000006', 900, 'Vote for next month''s pick closes Friday.', null);

insert into public.messages (id, group_id, sender_id, client_id, kind, body, quote, created_at)
select public.uuid7(now() - make_interval(mins => ago)), ('00000000-0000-4000-d000-' || lpad(g::text, 12, '0'))::uuid,
       ('00000000-0000-4000-' || u)::uuid, gen_random_uuid(),
       case when quote is null then 'text' else 'quote' end::public.message_kind, body, quote,
       now() - make_interval(mins => ago)
from seed_messages;
update public.groups g set last_message_at = (select max(created_at) from public.messages m where m.group_id = g.id);
-- Ngozi has read the read-along and Support threads.
update public.group_members set last_read_at = now()
where user_id = '00000000-0000-4000-a000-000000000001'
  and group_id in ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-d000-000000000005');

insert into public.message_reactions (message_id, user_id, emoji)
select m.id, ('00000000-0000-4000-' || r.u)::uuid, r.e
from public.messages m
cross join (values ('a000-000000000001', '😢'), ('a000-000000000008', '😢'), ('a000-000000000009', '😢'),
                   ('a000-000000000002', '❤️'), ('a000-000000000003', '❤️')) as r (u, e)
where m.body = 'The night vigil chapter 😢 who else cried?';

-- Ngozi blocked two people (s-blocked): Emeka from a DM long ago, Tolu from Grace Readers.
insert into public.user_blocks (blocker_id, blocked_id, source_group_id, created_at) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000007', null, now() - interval '35 days'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003',
   '00000000-0000-4000-d000-000000000001', now() - interval '16 days');
