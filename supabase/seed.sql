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
  ('00000000-0000-4000-b000-000000000007', 'kemi@arpedia.africa',   'Kemi Danjuma',             'kemid.staff',    false, 'analyst');

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
