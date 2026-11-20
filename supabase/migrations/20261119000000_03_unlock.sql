-- Flow 03 · Book page, preview and unlock (docs/prd/03-book-page-unlock.md).
-- Money first moves here: spend_credits is the only way credits leave a reader's balance, and only
-- the reader RPCs below call it. Everything runs in one transaction per call.
--
-- Small tables later flows own are created here in their minimal form, because this flow reads
-- them before those flows exist; each later flow extends its own table in its own migration:
--   subscriptions (09), reading_progress (04), follows and blocks (06/08),
--   app_config (16). Gift people come from follows only until flow 06 adds groups.
-- Review and book reports go into flow 06's `reports` table (20261119000700_03_reports.sql).

-- ─── Config ─────────────────────────────────────────────────────────────────
-- Plain key/value settings (flow 16 edits them). A missing key uses the default in _config().
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger app_config_updated_at before update on public.app_config
  for each row execute function public.set_updated_at();

create function public._config(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select value from public.app_config where key = p_key),
    '{
      "avg_book_price_credits": 125,
      "tip_presets": [20, 50, 100],
      "spend_rate_per_minute": 10,
      "topup_packs": [{"credits": 200, "naira": 600}, {"credits": 500, "naira": 1500}, {"credits": 1000, "naira": 3000}],
      "plans": [{"code": "monthly", "months": 1, "credits": 300, "naira": 900},
                {"code": "quarterly", "months": 3, "credits": 800, "naira": 2400},
                {"code": "yearly", "months": 12, "credits": 3000, "naira": 8400}]
    }'::jsonb -> p_key)
$$;

-- ─── Columns on core tables ─────────────────────────────────────────────────
alter table public.books
  add column tags text[] not null default '{}',
  add column price_override_credits integer check (price_override_credits > 0),
  add column price_override_reason text,
  add column preview_override_percent numeric(4, 1) check (preview_override_percent between 5 and 25),
  add column preview_override_reason text,
  add column reads_count integer not null default 0 check (reads_count >= 0),
  add column comments_count integer not null default 0 check (comments_count >= 0),
  add constraint books_price_override_reason check (
    (price_override_credits is null) = (price_override_reason is null));

alter table public.book_revisions
  add column content_notes text[] not null default '{}',
  add column no_explicit boolean not null default false,
  add column age_rating text,
  add column publisher text,
  add column isbn text,
  add column language text;

-- Ledger: the stable chapter id, the undo link, the gift recipient, the running balance and context.
alter table public.credit_ledger
  add column chapter_uid uuid,
  add column ref_ledger_id bigint references public.credit_ledger (id),
  add column counterparty_user_id uuid references public.profiles (id),
  add column balance_after integer,
  add column meta jsonb not null default '{}';
create unique index credit_ledger_ref_idx on public.credit_ledger (ref_ledger_id) where ref_ledger_id is not null;
create index credit_ledger_user_book_idx on public.credit_ledger (user_id, book_id) where book_id is not null;
create index credit_ledger_author_idx on public.credit_ledger (author_id) where author_id is not null;

-- ─── Minimal tables of later flows ──────────────────────────────────────────
-- Flow 09 adds store ids, pause, pending plan and the rest.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_code text not null,
  status text not null check (status in ('active', 'grace', 'billing_retry', 'paused', 'cancelled', 'expired', 'refunded')),
  period_start timestamptz not null default now(),
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, period_end desc);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Flow 04 adds the position (CFI), device and the RPCs that write it.
create table public.reading_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  percent numeric(5, 2) not null default 0 check (percent between 0 and 100),
  max_percent numeric(5, 2) not null default 0 check (max_percent between 0 and 100),
  chapter_ord integer not null default 0,
  finished_at timestamptz,
  last_opened_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index reading_progress_book_idx on public.reading_progress (book_id) where max_percent >= 95;

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ─── Flow 03 tables ─────────────────────────────────────────────────────────
create table public.book_price_history (
  id bigint generated always as identity primary key,
  book_id uuid not null references public.books (id) on delete cascade,
  revision_id uuid references public.book_revisions (id),
  kind text not null check (kind in ('computed', 'override', 'revision', 'preview')),
  old_credits integer,
  new_credits integer,
  reason text,
  staff_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index book_price_history_book_idx on public.book_price_history (book_id, created_at desc);

create table public.paygo_accounts (
  user_id uuid not null references public.profiles (id),
  book_id uuid not null references public.books (id),
  snapshot_price integer not null check (snapshot_price > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id),
  recipient_id uuid not null references public.profiles (id),
  book_id uuid not null references public.books (id),
  message text check (char_length(message) <= 140),
  ledger_id bigint not null references public.credit_ledger (id),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  check (sender_id <> recipient_id)
);
create index gifts_recipient_idx on public.gifts (recipient_id, created_at desc);

create table public.tips (
  id uuid primary key default gen_random_uuid(),
  ledger_id bigint not null references public.credit_ledger (id),
  from_user_id uuid not null references public.profiles (id),
  author_id uuid not null references public.profiles (id),
  book_id uuid references public.books (id),
  credits integer not null check (credits > 0),
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);
create index tips_author_idx on public.tips (author_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  body text check (char_length(body) <= 1000),
  spoiler boolean not null default false,
  status text not null default 'visible' check (status in ('visible', 'hidden_by_mod')),
  likes_count integer not null default 0 check (likes_count >= 0),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  unique (book_id, user_id)
);
create index reviews_book_idx on public.reviews (book_id, created_at desc) where status = 'visible';

create table public.review_likes (
  review_id uuid not null references public.reviews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table public.hidden_reviewers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, hidden_user_id),
  check (user_id <> hidden_user_id)
);

create table public.book_rating_stats (
  book_id uuid primary key references public.books (id) on delete cascade,
  avg numeric(3, 2) not null default 0,
  count integer not null default 0,
  h1 integer not null default 0,
  h2 integer not null default 0,
  h3 integer not null default 0,
  h4 integer not null default 0,
  h5 integer not null default 0
);

create table public.book_related (
  book_id uuid not null references public.books (id) on delete cascade,
  related_book_id uuid not null references public.books (id) on delete cascade,
  score integer not null,
  primary key (book_id, related_book_id)
);

-- Price and preview readers get: the staff override when set, else the live revision's.
create view public.book_effective with (security_invoker) as
  select b.id as book_id, b.current_revision_id as revision_id,
         coalesce(b.price_override_credits, r.price_credits) as effective_price,
         coalesce(b.preview_override_percent, r.preview_percent, 10) as effective_preview_percent
  from public.books b
  left join public.book_revisions r on r.id = b.current_revision_id;

-- ─── Triggers ───────────────────────────────────────────────────────────────
-- Rating stats are recomputed from the visible reviews in the same transaction.
create function public._refresh_rating_stats(p_book uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.book_rating_stats (book_id, avg, count, h1, h2, h3, h4, h5)
  select p_book, coalesce(round(avg(stars), 2), 0), count(*),
         count(*) filter (where stars = 1), count(*) filter (where stars = 2),
         count(*) filter (where stars = 3), count(*) filter (where stars = 4),
         count(*) filter (where stars = 5)
  from public.reviews where book_id = p_book and status = 'visible'
  on conflict (book_id) do update set avg = excluded.avg, count = excluded.count,
    h1 = excluded.h1, h2 = excluded.h2, h3 = excluded.h3, h4 = excluded.h4, h5 = excluded.h5;
$$;

create function public._reviews_stats_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._refresh_rating_stats(coalesce(new.book_id, old.book_id));
  if tg_op = 'UPDATE' and new.book_id <> old.book_id then
    perform public._refresh_rating_stats(old.book_id);
  end if;
  return null;
end $$;
create trigger reviews_stats after insert or update of stars, status, book_id or delete on public.reviews
  for each row execute function public._reviews_stats_trigger();

create function public._review_likes_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reviews set likes_count = likes_count + case when tg_op = 'INSERT' then 1 else -1 end
  where id = coalesce(new.review_id, old.review_id);
  return null;
end $$;
create trigger review_likes_count after insert or delete on public.review_likes
  for each row execute function public._review_likes_trigger();

-- Reads = readers who opened the book (one reading_progress row each).
create function public._reads_count_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.books set reads_count = reads_count + 1 where id = new.book_id;
  return null;
end $$;
create trigger reading_progress_reads after insert on public.reading_progress
  for each row execute function public._reads_count_trigger();

-- ─── Helpers ────────────────────────────────────────────────────────────────
create function public._raise(p_code text, p_detail jsonb default '{}') returns void
language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_code using errcode = 'P0001', detail = p_detail::text;
end $$;

-- The caller, or an error. Reader RPCs act only for the signed-in user.
create function public._uid() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end $$;

-- Subscription state for the credit checks (rule 14): 'plan' when the reader may top up
-- (active, paused or past due, or cancelled with time left), else 'none'.
create function public._plan_state(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('state', 'plan', 'status', s.status, 'plan_code', s.plan_code,
                               'period_end', s.period_end)
     from public.subscriptions s
     where s.user_id = p_user
       and (s.status in ('active', 'grace', 'billing_retry', 'paused')
            or (s.status = 'cancelled' and s.period_end > now()))
     order by s.period_end desc limit 1),
    '{"state": "none"}'::jsonb)
$$;

create function public._balance(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger where user_id = p_user
$$;

-- Credits the reader has paid for chapters of a book, net of undone charges.
create function public._chapter_paid(p_user uuid, p_book uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(-sum(delta), 0)::int from public.credit_ledger
  where user_id = p_user and book_id = p_book and reason in ('chapter', 'undo')
$$;

create function public._owns_book(p_user uuid, p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entitlements
                 where user_id = p_user and book_id = p_book and scope = 'book' and revoked_at is null)
$$;

-- What the whole book still costs this reader: the cap (effective price, or the lower of it and
-- their pay-as-you-read snapshot) minus what they paid for chapters, never below 0.
create function public._remaining(p_user uuid, p_book uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(
    least(e.effective_price, coalesce(pa.snapshot_price, e.effective_price))
      - public._chapter_paid(p_user, p_book), 0)
  from public.book_effective e
  left join public.paygo_accounts pa on pa.user_id = p_user and pa.book_id = p_book
  where e.book_id = p_book
$$;

-- Spend limit per reader (config spend_rate_per_minute) across unlock, gift and tip.
create function public._check_spend_rate(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select count(distinct txn_id) from public.credit_ledger
      where user_id = p_user and delta < 0 and reason in ('unlock_all', 'gift_out', 'tip')
        and created_at > now() - interval '1 minute')
     >= (public._config('spend_rate_per_minute'))::int then
    perform public._raise('rate_limited');
  end if;
end $$;

-- A live book a reader can buy: live, with a live current revision.
create function public._buyable_book(p_book uuid) returns public.books
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.books;
begin
  select b.* into v from public.books b
  join public.book_revisions r on r.id = b.current_revision_id
  where b.id = p_book and b.status = 'live' and r.status = 'live';
  if not found then
    perform public._raise('not_available');
  end if;
  return v;
end $$;

-- ─── spend_credits (internal) ───────────────────────────────────────────────
-- The only way credits are spent. Serialises per reader, replays by key, refuses to go below zero,
-- and writes one row per bucket in spend order (flow 09 rule 12: rolled-over, plan, promo, top-up)
-- with one txn_id. The first row carries the reader's key; the others carry key#bucket.
-- Returns {ledger_id, txn_id, spent, balance, replayed}.
create function public.spend_credits(p_user uuid, p_amount integer, p_reason public.ledger_reason,
                                     p_book uuid, p_chapter_uid uuid, p_author uuid, p_key text,
                                     p_meta jsonb default '{}', p_counterparty uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'u:' || p_user || ':' || p_key;
  v_first public.credit_ledger;
  v_txn uuid := gen_random_uuid();
  v_balance int;
  v_left int := p_amount;
  v_take int;
  v_first_id bigint;
  v_id bigint;
  b record;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 100 then
    perform public._raise('bad_key');
  end if;
  if p_amount is null or p_amount <= 0 then
    perform public._raise('bad_amount');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_first from public.credit_ledger where idempotency_key = v_key;
  if found then
    return jsonb_build_object('ledger_id', v_first.id, 'txn_id', v_first.txn_id,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_first.txn_id),
      'balance', public._balance(p_user), 'replayed', true);
  end if;

  v_balance := public._balance(p_user);
  if v_balance < p_amount then
    perform public._raise('insufficient_credits',
      jsonb_build_object('missing', p_amount - v_balance, 'balance', v_balance, 'need', p_amount));
  end if;

  for b in
    select bucket, sum(delta)::int as available from public.credit_ledger
    where user_id = p_user group by bucket having sum(delta) > 0
    order by array_position(array['rollover', 'plan', 'promo', 'topup']::public.ledger_bucket[], bucket)
  loop
    exit when v_left = 0;
    v_take := least(v_left, b.available);
    v_left := v_left - v_take;
    v_balance := v_balance - v_take;
    insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, ref_type, ref_id,
      idempotency_key, book_id, chapter_uid, author_id, author_earning_kobo, counterparty_user_id,
      balance_after, meta)
    values (p_user, -v_take, p_reason, b.bucket, v_txn, case when p_book is not null then 'book' end,
      p_book::text, case when v_first_id is null then v_key else v_key || '#' || b.bucket end,
      p_book, p_chapter_uid, p_author, case when p_author is not null then v_take * 160 else 0 end,
      p_counterparty, v_balance, coalesce(p_meta, '{}'))
    returning id into v_id;
    v_first_id := coalesce(v_first_id, v_id);
  end loop;

  if v_left > 0 then
    -- Buckets disagree with the total (a negative bucket); never spend below zero.
    perform public._raise('insufficient_credits',
      jsonb_build_object('missing', v_left, 'balance', v_balance + p_amount - v_left, 'need', p_amount));
  end if;
  return jsonb_build_object('ledger_id', v_first_id, 'txn_id', v_txn, 'spent', p_amount,
    'balance', v_balance, 'replayed', false);
end $$;

-- ─── unlock_book ────────────────────────────────────────────────────────────
-- Unlock all, or Pay the rest after chapter payments. Returns
-- {ledger_id, spent, balance, entitlement_id, status: unlocked|already_unlocked}.
create function public.unlock_book(p_book uuid, p_expected_price integer, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_book public.books;
  v_price int;
  v_remaining int;
  v_spend jsonb;
  v_ent uuid;
  v_prior public.credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- Same key again: the original result, nothing new.
  select * into v_prior from public.credit_ledger where idempotency_key = 'u:' || v_user || ':' || p_key;
  if found then
    select id into v_ent from public.entitlements
    where user_id = v_user and book_id = v_prior.book_id and scope = 'book' and revoked_at is null;
    return jsonb_build_object('ledger_id', v_prior.id,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(v_user), 'entitlement_id', v_ent, 'status', 'unlocked');
  end if;

  v_book := public._buyable_book(p_book);
  -- Authors never pay themselves (credits spent would turn into their own earnings).
  if v_book.author_id = v_user then
    perform public._raise('own_book');
  end if;
  if public._owns_book(v_user, p_book) then
    select id into v_ent from public.entitlements
    where user_id = v_user and book_id = p_book and scope = 'book' and revoked_at is null;
    return jsonb_build_object('ledger_id', null, 'spent', 0, 'balance', public._balance(v_user),
      'entitlement_id', v_ent, 'status', 'already_unlocked');
  end if;

  select effective_price into v_price from public.book_effective where book_id = p_book;
  if p_expected_price is distinct from v_price then
    perform public._raise('price_changed',
      jsonb_build_object('price', v_price, 'remaining', public._remaining(v_user, p_book)));
  end if;
  perform public._check_spend_rate(v_user);

  v_remaining := public._remaining(v_user, p_book);
  if v_remaining > 0 then
    v_spend := public.spend_credits(v_user, v_remaining, 'unlock_all', p_book, null, v_book.author_id, p_key,
      jsonb_build_object('price', v_price, 'mode', case when v_remaining < v_price then 'rest' else 'upfront' end));
  end if;

  insert into public.entitlements (user_id, book_id, scope, source, ledger_id)
  values (v_user, p_book, 'book',
          (case when v_remaining > 0 then 'unlock_all' else 'chapter_complete' end)::public.entitlement_source,
          (v_spend ->> 'ledger_id')::bigint)
  returning id into v_ent;

  return jsonb_build_object('ledger_id', (v_spend ->> 'ledger_id')::bigint, 'spent', v_remaining,
    'balance', public._balance(v_user), 'entitlement_id', v_ent, 'status', 'unlocked');
end $$;

-- ─── gift_book ──────────────────────────────────────────────────────────────
create function public.gift_book(p_book uuid, p_recipient uuid, p_message text, p_expected_price integer,
                                 p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_book public.books;
  v_price int;
  v_spend jsonb;
  v_gift uuid;
  v_prior public.credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_prior from public.credit_ledger where idempotency_key = 'u:' || v_user || ':' || p_key;
  if found then
    select id into v_gift from public.gifts where ledger_id = v_prior.id;
    return jsonb_build_object('ledger_id', v_prior.id, 'gift_id', v_gift,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(v_user), 'status', 'sent');
  end if;

  v_book := public._buyable_book(p_book);
  if v_book.author_id = v_user then
    perform public._raise('own_book');
  end if;
  if p_recipient is null or p_recipient = v_user
     or not exists (select 1 from public.profiles where id = p_recipient and deleted_at is null) then
    perform public._raise('bad_recipient');
  end if;
  if exists (select 1 from public.blocks where (blocker_id = v_user and blocked_id = p_recipient)
                                              or (blocker_id = p_recipient and blocked_id = v_user)) then
    perform public._raise('bad_recipient');
  end if;
  if exists (select 1 from public.entitlements where user_id = p_recipient and book_id = p_book
                                                 and revoked_at is null) then
    perform public._raise('already_has_it');
  end if;
  if char_length(p_message) > 140 then
    perform public._raise('message_too_long');
  end if;

  select effective_price into v_price from public.book_effective where book_id = p_book;
  if p_expected_price is distinct from v_price then
    perform public._raise('price_changed', jsonb_build_object('price', v_price));
  end if;
  perform public._check_spend_rate(v_user);

  v_spend := public.spend_credits(v_user, v_price, 'gift_out', p_book, null, v_book.author_id, p_key,
    jsonb_build_object('price', v_price), p_recipient);
  insert into public.entitlements (user_id, book_id, scope, source, ledger_id)
  values (p_recipient, p_book, 'book', 'gift', (v_spend ->> 'ledger_id')::bigint);
  insert into public.gifts (sender_id, recipient_id, book_id, message, ledger_id)
  values (v_user, p_recipient, p_book, nullif(btrim(p_message), ''), (v_spend ->> 'ledger_id')::bigint)
  returning id into v_gift;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'gift_received', 'user_id', p_recipient,
    'from_user_id', v_user, 'book_id', p_book, 'gift_id', v_gift));

  return jsonb_build_object('ledger_id', (v_spend ->> 'ledger_id')::bigint, 'gift_id', v_gift,
    'spent', v_price, 'balance', (v_spend ->> 'balance')::int, 'status', 'sent');
end $$;

-- ─── tip_author ─────────────────────────────────────────────────────────────
create function public.tip_author(p_book uuid, p_credits integer, p_note text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_author uuid;
  v_spend jsonb;
  v_tip uuid;
  v_prior public.credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_prior from public.credit_ledger where idempotency_key = 'u:' || v_user || ':' || p_key;
  if found then
    select id into v_tip from public.tips where ledger_id = v_prior.id;
    return jsonb_build_object('ledger_id', v_prior.id, 'tip_id', v_tip,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(v_user), 'status', 'sent');
  end if;

  select author_id into v_author from public.books where id = p_book and status = 'live';
  if v_author is null then
    perform public._raise('not_available');
  end if;
  if v_author = v_user then
    perform public._raise('own_book');
  end if;
  if p_credits is null or not (public._config('tip_presets') @> to_jsonb(p_credits)) then
    perform public._raise('bad_amount');
  end if;
  if char_length(p_note) > 140 then
    perform public._raise('message_too_long');
  end if;
  perform public._check_spend_rate(v_user);

  v_spend := public.spend_credits(v_user, p_credits, 'tip', p_book, null, v_author, p_key,
    jsonb_build_object('credits', p_credits));
  insert into public.tips (ledger_id, from_user_id, author_id, book_id, credits, note)
  values ((v_spend ->> 'ledger_id')::bigint, v_user, v_author, p_book, p_credits, nullif(btrim(p_note), ''))
  returning id into v_tip;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'tip_received', 'user_id', v_author,
    'from_user_id', v_user, 'book_id', p_book, 'tip_id', v_tip, 'credits', p_credits));

  return jsonb_build_object('ledger_id', (v_spend ->> 'ledger_id')::bigint, 'tip_id', v_tip,
    'spent', p_credits, 'balance', (v_spend ->> 'balance')::int, 'status', 'sent');
end $$;

select pgmq.create('user_notify');

-- ─── Book page ──────────────────────────────────────────────────────────────
-- A review as the app shows it.
create function public._review_json(r public.reviews) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'user_id', r.user_id, 'name', p.full_name, 'avatar_url', p.avatar_url,
    'stars', r.stars, 'body', r.body, 'spoiler', r.spoiler, 'likes', r.likes_count,
    'liked', exists (select 1 from public.review_likes l where l.review_id = r.id and l.user_id = auth.uid()),
    'mine', r.user_id = auth.uid(), 'created_at', r.created_at, 'edited_at', r.edited_at)
  from public.profiles p where p.id = r.user_id
$$;

-- Books readers can see as related cards.
create function public._book_card(p_book uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', b.id, 'title', b.title, 'author', p.full_name, 'author_id', b.author_id,
    'genre', b.genres[1], 'cover_key', r.cover_key)
  from public.books b
  join public.profiles p on p.id = b.author_id
  left join public.book_revisions r on r.id = b.current_revision_id
  where b.id = p_book
$$;

-- Everything the book page needs in one round trip (rule 1–12). A book that isn't live is
-- returned only to readers who own it (kept access after unpublish) or are coming-soon viewers.
create function public.get_book_page(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  b public.books;
  r public.book_revisions;
  v_price int;
  v_chapters int;
  v_chargeable int;
  v_owns boolean;
  v_paid int;
  v_progress public.reading_progress;
  v_top jsonb;
  v_related jsonb;
  v_first_unpaid jsonb;
begin
  select * into b from public.books where id = p_book;
  if not found then
    return null;
  end if;
  v_owns := public._owns_book(v_user, p_book);
  if b.status not in ('live', 'scheduled') and not (v_owns and b.access_removed_at is null) then
    return null;
  end if;
  select * into r from public.book_revisions where id = b.current_revision_id;
  if b.status = 'scheduled' then
    select * into r from public.book_revisions where book_id = p_book and status = 'scheduled'
    order by revision_no desc limit 1;
  end if;

  select effective_price into v_price from public.book_effective where book_id = p_book;
  select count(*) filter (where kind = 'chapter'), count(*) filter (where price_credits > 0)
    into v_chapters, v_chargeable
  from public.chapters where revision_id = r.id;
  v_paid := public._chapter_paid(v_user, p_book);
  select * into v_progress from public.reading_progress where user_id = v_user and book_id = p_book;

  -- Pay as you read: the first chargeable chapter the reader hasn't paid for.
  select jsonb_build_object('ord', c.ord, 'chapter_uid', c.chapter_uid, 'price', c.price_credits)
    into v_first_unpaid
  from public.chapters c
  where c.revision_id = r.id and c.price_credits > 0
    and not exists (select 1 from public.entitlements e where e.user_id = v_user and e.book_id = p_book
                      and e.scope = 'chapter' and e.chapter_uid = c.chapter_uid and e.revoked_at is null)
  order by c.ord limit 1;

  -- Top review: most liked 4–5 star review with text, else the newest with text; never hidden ones.
  select public._review_json(x) into v_top from public.reviews x
  where x.book_id = p_book and x.status = 'visible' and coalesce(btrim(x.body), '') <> ''
    and not exists (select 1 from public.hidden_reviewers h where h.user_id = v_user and h.hidden_user_id = x.user_id)
  order by (x.stars >= 4) desc, case when x.stars >= 4 then x.likes_count end desc nulls last, x.created_at desc
  limit 1;

  -- Readers also loved: co-finished books, topped up with top-rated books of the same genre when
  -- fewer than 4; owned books last.
  with rel as (
    select br.related_book_id as id, br.score::numeric as score, 0 as tier
    from public.book_related br join public.books x on x.id = br.related_book_id and x.status = 'live'
    where br.book_id = p_book
    union all
    select x.id, coalesce(s.avg, 0), 1
    from public.books x left join public.book_rating_stats s on s.book_id = x.id
    where x.status = 'live' and x.id <> p_book and x.genres && b.genres
      and (select count(*) from public.book_related where book_id = p_book) < 4
  ), picked as (
    select distinct on (id) id, score, tier from rel order by id, tier
  ), ranked as (
    select id, public._owns_book(v_user, id) as owned, tier, score from picked
    order by public._owns_book(v_user, id), tier, score desc limit 8
  )
  select coalesce(jsonb_agg(public._book_card(id) || jsonb_build_object('owned', owned)
                            order by owned, tier, score desc), '[]')
    into v_related from ranked;

  return jsonb_build_object(
    'book', jsonb_build_object('id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'description', b.description,
      'genres', b.genres, 'tags', b.tags[1:4], 'status', b.status, 'cover_key', r.cover_key,
      'author', jsonb_build_object('id', b.author_id, 'name', (select full_name from public.profiles where id = b.author_id))),
    'coming_soon', b.status = 'scheduled',
    'pages', r.pages, 'words', r.words,
    'read_minutes', (round(coalesce(r.words, 0) / 230.0 / 5) * 5)::int,
    'price', v_price,
    'chapters', v_chapters,
    'chargeable_chapters', v_chargeable,
    'per_chapter', case when v_chargeable > 0 then round(v_price::numeric / v_chargeable)::int end,
    'preview_percent', (select effective_preview_percent from public.book_effective where book_id = p_book),
    'rating', (select jsonb_build_object('avg', s.avg, 'count', s.count,
                 'h', jsonb_build_array(s.h1, s.h2, s.h3, s.h4, s.h5))
               from public.book_rating_stats s where s.book_id = p_book),
    'reads', b.reads_count, 'comments', b.comments_count,
    'top_review', v_top,
    'my_review', (select public._review_json(x) from public.reviews x where x.book_id = p_book and x.user_id = v_user),
    'owns_book', v_owns,
    'paid_credits', v_paid,
    'remaining', case when v_owns then 0 else public._remaining(v_user, p_book) end,
    'first_unpaid', v_first_unpaid,
    -- Unpaid chapter prices in reading order, for "your N credits cover the next k chapters" (rule 27).
    'unpaid_prices', case when v_owns then '[]'::jsonb else (
      select coalesce(jsonb_agg(c.price_credits order by c.ord), '[]')
      from public.chapters c
      where c.revision_id = r.id and c.price_credits > 0
        and not exists (select 1 from public.entitlements e where e.user_id = v_user and e.book_id = p_book
                          and e.scope = 'chapter' and e.chapter_uid = c.chapter_uid and e.revoked_at is null)) end,
    'progress', case when v_progress.user_id is null then null else jsonb_build_object(
      'percent', v_progress.percent, 'max_percent', v_progress.max_percent,
      'chapter_ord', v_progress.chapter_ord, 'finished_at', v_progress.finished_at) end,
    'balance', public._balance(v_user),
    'plan', public._plan_state(v_user),
    'following', exists (select 1 from public.follows where follower_id = v_user and followee_id = b.author_id),
    'is_author', b.author_id = v_user,
    'related', v_related
  );
end $$;

-- About this ebook (rule 39–41). Facts with no value are left out by the app.
create function public.get_book_about(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  b public.books;
  r public.book_revisions;
begin
  -- Same visibility and revision as get_book_page.
  select * into b from public.books where id = p_book;
  if not found or (b.status not in ('live', 'scheduled')
                   and not (public._owns_book(v_user, p_book) and b.access_removed_at is null)) then
    return null;
  end if;
  select * into r from public.book_revisions where id = b.current_revision_id;
  if b.status = 'scheduled' then
    select * into r from public.book_revisions where book_id = p_book and status = 'scheduled'
    order by revision_no desc limit 1;
  end if;
  return jsonb_build_object(
    'title', b.title, 'description', b.description, 'genre', b.genres[1],
    'author', jsonb_build_object('id', b.author_id, 'name', (select full_name from public.profiles where id = b.author_id)),
    'language', coalesce(r.language, r.meta ->> 'language'),
    'age', coalesce(r.age_rating, r.meta ->> 'age'),
    'publisher', r.publisher, 'isbn', r.isbn, 'published_at', r.published_at,
    'purchases', (select count(distinct user_id) from public.entitlements
                  where book_id = p_book and source in ('unlock_all', 'chapter', 'chapter_complete', 'gift')),
    'words', r.words, 'pages', r.pages,
    'price', (select effective_price from public.book_effective where book_id = p_book),
    'chapters', (select count(*) from public.chapters where revision_id = r.id and kind = 'chapter'),
    'read_minutes', (round(coalesce(r.words, 0) / 230.0 / 5) * 5)::int,
    'file_bytes', r.file_bytes,
    'content_notes', coalesce(nullif(r.content_notes, '{}'),
                              array(select jsonb_array_elements_text(coalesce(r.meta -> 'content_notes', '[]')))),
    'no_explicit', r.no_explicit,
    'rating', (select jsonb_build_object('avg', s.avg, 'count', s.count)
               from public.book_rating_stats s where s.book_id = p_book)
  );
end $$;

-- Ratings and reviews list (rule 42): newest first, optional star filter, hidden reviewers left out.
create function public.get_reviews(p_book uuid, p_stars integer default null, p_limit integer default 20,
                                   p_offset integer default 0) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rating', (select jsonb_build_object('avg', s.avg, 'count', s.count,
                 'h', jsonb_build_array(s.h1, s.h2, s.h3, s.h4, s.h5))
               from public.book_rating_stats s where s.book_id = p_book),
    'can_review', exists (select 1 from public.reading_progress p where p.user_id = auth.uid()
                            and p.book_id = p_book and p.max_percent >= 95),
    'reviews', coalesce((
      select jsonb_agg(public._review_json(x) order by x.created_at desc)
      from (select * from public.reviews x
            where x.book_id = p_book and x.status = 'visible' and (p_stars is null or x.stars = p_stars)
              and not exists (select 1 from public.hidden_reviewers h
                              where h.user_id = auth.uid() and h.hidden_user_id = x.user_id)
            order by x.created_at desc limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)) x
    ), '[]'))
  where auth.uid() is not null
$$;

-- People the reader can gift (rule 32–33): people who follow the reader. Owners and holders of any
-- chapter come back disabled; blocked people never appear.
create function public.get_gift_people(p_book uuid, p_query text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url,
      'why', 'Follows you',
      'has_it', exists (select 1 from public.entitlements e where e.user_id = p.id and e.book_id = p_book
                          and e.revoked_at is null))
      order by p.full_name), '[]')
  from public.follows f
  join public.profiles p on p.id = f.follower_id and p.deleted_at is null
  where f.followee_id = auth.uid()
    and not exists (select 1 from public.blocks k where (k.blocker_id = auth.uid() and k.blocked_id = p.id)
                                                   or (k.blocker_id = p.id and k.blocked_id = auth.uid()))
    and (p_query is null or p.full_name ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%')
$$;

-- Book discussion lock (rule 47).
create function public.get_book_discussion(p_book uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', b.title,
    'percent', coalesce(p.percent, 0), 'max_percent', coalesce(p.max_percent, 0),
    'unlocked', coalesce(p.max_percent, 0) >= 95,
    'chapter_ord', coalesce(p.chapter_ord, 0),
    'chapters', (select count(*) from public.chapters c where c.revision_id = b.current_revision_id and c.kind = 'chapter'),
    'chapter_title', (select c.title from public.chapters c where c.revision_id = b.current_revision_id
                        and c.ord = coalesce(p.chapter_ord, 0)))
  from public.books b
  left join public.reading_progress p on p.book_id = b.id and p.user_id = auth.uid()
  where b.id = p_book and auth.uid() is not null
    -- Same visibility as get_book_about.
    and (b.status in ('live', 'scheduled')
         or (public._owns_book(auth.uid(), p_book) and b.access_removed_at is null))
$$;

-- ─── Reviews ────────────────────────────────────────────────────────────────
create function public._finished(p_user uuid, p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reading_progress where user_id = p_user and book_id = p_book
                   and max_percent >= 95)
$$;

-- Post or edit the reader's review (rule 43–44). Only finishers (95%) may post.
create function public.post_review(p_book uuid, p_stars integer, p_body text, p_spoiler boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_row public.reviews;
begin
  if not public._finished(v_user, p_book) then
    perform public._raise('not_finished');
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    perform public._raise('bad_stars');
  end if;
  if char_length(p_body) > 1000 then
    perform public._raise('too_long');
  end if;
  insert into public.reviews (book_id, user_id, stars, body, spoiler)
  values (p_book, v_user, p_stars, nullif(btrim(p_body), ''), coalesce(p_spoiler, false))
  on conflict (book_id, user_id) do update
    set stars = excluded.stars, body = excluded.body, spoiler = excluded.spoiler, edited_at = now()
  returning * into v_row;
  return public._review_json(v_row);
end $$;

create function public.delete_review(p_review uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reviews where id = p_review and user_id = public._uid();
  if not found then
    perform public._raise('not_found');
  end if;
end $$;

create function public.toggle_review_like(p_review uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  if not exists (select 1 from public.reviews where id = p_review and status = 'visible') then
    perform public._raise('not_found');
  end if;
  delete from public.review_likes where review_id = p_review and user_id = v_user;
  if found then
    return false;
  end if;
  insert into public.review_likes (review_id, user_id) values (p_review, v_user);
  return true;
end $$;

create function public.hide_reviewer(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.hidden_reviewers (user_id, hidden_user_id) values (public._uid(), p_user)
  on conflict do nothing;
end $$;

create function public.unhide_reviewer(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.hidden_reviewers where user_id = public._uid() and hidden_user_id = p_user;
$$;

-- Follow the author from the book page (same state as the author profile, flow 08).
create function public.set_following(p_user uuid, p_follow boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  if p_follow then
    if p_user = v_user then
      perform public._raise('bad_target');
    end if;
    insert into public.follows (follower_id, followee_id) values (v_user, p_user) on conflict do nothing;
  else
    delete from public.follows where follower_id = v_user and followee_id = p_user;
  end if;
  return p_follow;
end $$;

-- Readers also loved: rebuilt nightly from finished-together counts.
create function public.rebuild_book_related() returns void
language sql security definer set search_path = '' as $$
  delete from public.book_related where true;
  insert into public.book_related (book_id, related_book_id, score)
  select a.book_id, b.book_id, count(*)
  from public.reading_progress a
  join public.reading_progress b on b.user_id = a.user_id and b.book_id <> a.book_id and b.max_percent >= 95
  where a.max_percent >= 95
  group by a.book_id, b.book_id;
$$;
select cron.schedule('book_related', '30 2 * * *', 'select public.rebuild_book_related()');

-- ─── Admin: pricing and access ──────────────────────────────────────────────
-- Price changes need the change_prices permission (Super admin, Finance) and two-step in the last
-- 10 minutes (the console re-prompts for the code).
create function public._require_price_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('change_prices')
          and coalesce(public.staff_mfa_verified_at() > now() - interval '10 minutes', false)) then
    raise exception 'Not allowed: change_prices' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Readers mid pay-as-you-read: paid for at least one chapter, don't own the book.
create function public._mid_paygo(p_book uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(distinct e.user_id)::int from public.entitlements e
  where e.book_id = p_book and e.scope = 'chapter' and e.revoked_at is null
    and not public._owns_book(e.user_id, p_book)
$$;

-- Chapter prices for the live revision: whole numbers, 0 inside the preview, summing to p_price.
-- The console computes them with packages/core chapterPrices; this checks them and saves them.
create function public._apply_book_price(p_rev uuid, p_price integer, p_prices jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_prices is null or jsonb_typeof(p_prices) <> 'array'
     or (select count(distinct p.chapter_uid) from jsonb_to_recordset(p_prices) as p(chapter_uid uuid, price_credits int)
         join public.chapters c on c.revision_id = p_rev and c.chapter_uid = p.chapter_uid)
        <> (select count(*) from public.chapters where revision_id = p_rev)
     or jsonb_array_length(p_prices) <> (select count(*) from public.chapters where revision_id = p_rev) then
    perform public._raise('bad_chapter_prices');
  end if;
  update public.chapters c set price_credits = p.price_credits
  from jsonb_to_recordset(p_prices) as p(chapter_uid uuid, price_credits int)
  where c.revision_id = p_rev and c.chapter_uid = p.chapter_uid;
  if exists (select 1 from public.chapters c join public.book_revisions r on r.id = c.revision_id
             where c.revision_id = p_rev
               and (c.price_credits is null or c.price_credits < 0
                    or (c.ord <= r.free_through_ord and c.price_credits <> 0)))
     or (select sum(price_credits) from public.chapters where revision_id = p_rev)
        <> (case when exists (select 1 from public.chapters c join public.book_revisions r on r.id = c.revision_id
                              where c.revision_id = p_rev and c.ord > r.free_through_ord)
                 then p_price else 0 end) then
    perform public._raise('bad_chapter_prices');
  end if;
end $$;

-- Override the price (p_price) or remove the override (p_price null). Writes price history and audit.
create function public.admin_set_book_price(p_book uuid, p_price integer, p_reason text, p_prices jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.books;
  v_old int;
  v_new int;
begin
  perform public._require_price_staff();
  if coalesce(btrim(p_reason), '') = '' then
    perform public._raise('reason_required');
  end if;
  if p_price is not null and (p_price < 1 or p_price > 100000) then
    perform public._raise('bad_amount');
  end if;
  select * into b from public.books where id = p_book for update;
  if not found or b.current_revision_id is null then
    perform public._raise('not_found');
  end if;
  select effective_price into v_old from public.book_effective where book_id = p_book;
  update public.books set price_override_credits = p_price,
    price_override_reason = case when p_price is null then null else btrim(p_reason) end
  where id = p_book;
  select effective_price into v_new from public.book_effective where book_id = p_book;
  perform public._apply_book_price(b.current_revision_id, v_new, p_prices);

  insert into public.book_price_history (book_id, revision_id, kind, old_credits, new_credits, reason, staff_id)
  values (p_book, b.current_revision_id, case when p_price is null then 'computed' else 'override' end,
          v_old, v_new, btrim(p_reason), auth.uid());
  perform public.write_audit('books', case when p_price is null then 'book.price_override_removed'
                                            else 'book.price_override' end,
    'book', p_book::text, b.title,
    format('Price %s → %s credits', v_old, v_new),
    jsonb_build_object('price', v_old, 'override', b.price_override_credits),
    jsonb_build_object('price', v_new, 'override', p_price), btrim(p_reason));
  return jsonb_build_object('old', v_old, 'new', v_new, 'mid_paygo', public._mid_paygo(p_book));
end $$;

-- Override the preview share (5–25%) or remove it (null). Publisher or Super admin. The preview
-- rebuild job (flow 12 Worker) makes the new cut live; until then readers keep the old one.
create function public.admin_set_preview(p_book uuid, p_percent numeric, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.books;
begin
  if not (public.is_staff('publisher') and public.staff_mfa_ok()) then
    raise exception 'Not allowed: preview override' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    perform public._raise('reason_required');
  end if;
  if p_percent is not null and p_percent not between 5 and 25 then
    perform public._raise('bad_percent');
  end if;
  select * into b from public.books where id = p_book for update;
  if not found then
    perform public._raise('not_found');
  end if;
  update public.books set preview_override_percent = p_percent,
    preview_override_reason = case when p_percent is null then null else btrim(p_reason) end
  where id = p_book;
  insert into public.book_price_history (book_id, revision_id, kind, old_credits, new_credits, reason, staff_id)
  values (p_book, b.current_revision_id, 'preview', null, null,
          format('Preview %s%% → %s', coalesce(b.preview_override_percent::text, 'default'),
                 coalesce(p_percent::text || '%', 'default')) || ': ' || btrim(p_reason), auth.uid());
  perform pgmq.send('book_verify', jsonb_build_object('kind', 'preview_rebuild', 'book_id', p_book,
    'revision_id', b.current_revision_id,
    'percent', coalesce(p_percent,
                        (select preview_percent from public.book_revisions where id = b.current_revision_id), 10)));
  perform public.write_audit('books', 'book.preview_override', 'book', p_book::text, b.title,
    format('Preview %s → %s', coalesce(b.preview_override_percent::text || '%', 'default'),
           coalesce(p_percent::text || '%', 'default')),
    jsonb_build_object('preview_override', b.preview_override_percent),
    jsonb_build_object('preview_override', p_percent), btrim(p_reason));
end $$;

-- Pricing and access tab: the computed price with its working, chapters, overrides and history.
create function public.admin_book_access(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.books;
  r public.book_revisions;
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into b from public.books where id = p_book;
  if not found then
    return null;
  end if;
  select * into r from public.book_revisions where id = b.current_revision_id;
  return jsonb_build_object(
    'book', jsonb_build_object('id', b.id, 'title', b.title, 'status', b.status),
    'revision', jsonb_build_object('id', r.id, 'revision_no', r.revision_no, 'words', r.words, 'pages', r.pages,
      'price', r.price_credits, 'preview_percent', r.preview_percent, 'free_through_ord', r.free_through_ord,
      'published_at', r.published_at,
      'published_by', (select full_name from public.profiles where id = r.published_by)),
    'effective_price', (select effective_price from public.book_effective where book_id = p_book),
    'price_override', case when b.price_override_credits is null then null else
      jsonb_build_object('credits', b.price_override_credits, 'reason', b.price_override_reason) end,
    'preview_override', case when b.preview_override_percent is null then null else
      jsonb_build_object('percent', b.preview_override_percent, 'reason', b.preview_override_reason) end,
    'mid_paygo', public._mid_paygo(p_book),
    'can_change_price', public.has_permission('change_prices'),
    'can_change_preview', public.is_staff('publisher'),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object('chapter_uid', c.chapter_uid, 'ord', c.ord,
        'kind', c.kind, 'parent_ord', c.parent_ord, 'title', c.title, 'words', c.words, 'pages', c.pages,
        'price', c.price_credits, 'free', c.ord <= r.free_through_ord) order by c.ord)
      from public.chapters c where c.revision_id = r.id), '[]'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', h.created_at, 'kind', h.kind,
        'old', h.old_credits, 'new', h.new_credits, 'reason', h.reason,
        'who', coalesce(p.full_name, 'System')) order by h.created_at desc)
      from public.book_price_history h left join public.profiles p on p.id = h.staff_id
      where h.book_id = p_book), '[]')
  );
end $$;

-- Book stats tab: everything from the ledger and reading_progress, never from a counter.
create function public.admin_book_stats(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'readers', (select count(*) from public.reading_progress where book_id = p_book),
    'finished', (select count(*) from public.reading_progress where book_id = p_book and max_percent >= 95),
    'finished_preview', (select count(*) from public.reading_progress p join public.book_effective e on e.book_id = p.book_id
                         where p.book_id = p_book and p.max_percent >= e.effective_preview_percent),
    -- Readers who last opened the book on each of the last 14 days (Lagos time).
    'per_day', (select jsonb_agg(jsonb_build_object('day', d::date, 'readers',
                  (select count(*) from public.reading_progress p where p.book_id = p_book
                     and (p.last_opened_at at time zone 'Africa/Lagos')::date = d::date)) order by d)
                from generate_series((now() at time zone 'Africa/Lagos')::date - 13,
                                     (now() at time zone 'Africa/Lagos')::date, interval '1 day') d),
    -- Share of readers reaching each numbered chapter (reading_progress.chapter_ord is the furthest).
    'reach', coalesce((select jsonb_agg(jsonb_build_object('no', x.no, 'title', x.title, 'readers', x.n) order by x.no)
      from (select row_number() over (order by c.ord) as no, c.title,
                   (select count(*) from public.reading_progress p where p.book_id = p_book and p.chapter_ord >= c.ord) as n
            from public.chapters c join public.books b on b.current_revision_id = c.revision_id
            where b.id = p_book and c.kind = 'chapter') x), '[]'),
    'unlocks_upfront', (select count(distinct user_id) from public.entitlements
                        where book_id = p_book and scope = 'book' and source = 'unlock_all'),
    'unlocks_paygo', (select count(distinct user_id) from public.entitlements e
                      where e.book_id = p_book and e.scope = 'chapter'
                        and not exists (select 1 from public.entitlements u where u.user_id = e.user_id
                                          and u.book_id = p_book and u.scope = 'book' and u.source = 'unlock_all')),
    'avg_paid', (select round(avg(paid)) from (
        select -sum(delta) as paid from public.credit_ledger
        where book_id = p_book and reason in ('unlock_all', 'chapter', 'undo') group by user_id
        having -sum(delta) > 0) x),
    'avg_paygo_credits', (select round(avg(paid)) from (
        select -sum(delta) as paid from public.credit_ledger
        where book_id = p_book and reason in ('chapter', 'undo') group by user_id having -sum(delta) > 0) x),
    'credits_spent', (select coalesce(-sum(delta), 0) from public.credit_ledger
                      where book_id = p_book and reason in ('unlock_all', 'chapter', 'undo', 'gift_out')),
    'tips', (select coalesce(sum(credits), 0) from public.tips where book_id = p_book),
    'author_earning_kobo', (select coalesce(sum(author_earning_kobo), 0) from public.credit_ledger
                            where book_id = p_book),
    -- Last 6 months, newest first; the current month stays open until it closes (flow 13).
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'credits', c, 'earning_kobo', k) order by m desc)
      from (select date_trunc('month', created_at at time zone 'Africa/Lagos')::date as m,
                   -sum(delta) filter (where reason in ('unlock_all', 'chapter', 'undo', 'gift_out', 'tip')) as c,
                   sum(author_earning_kobo) as k
            from public.credit_ledger where book_id = p_book
              and created_at > now() - interval '6 months' and author_earning_kobo <> 0
            group by 1) mm), '[]'),
    'month_open_from', date_trunc('month', now() at time zone 'Africa/Lagos')::date,
    'rating', (select jsonb_build_object('avg', s.avg, 'count', s.count)
               from public.book_rating_stats s where s.book_id = p_book)
  );
end $$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.app_config enable row level security;
alter table public.subscriptions enable row level security;
alter table public.reading_progress enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.book_price_history enable row level security;
alter table public.paygo_accounts enable row level security;
alter table public.gifts enable row level security;
alter table public.tips enable row level security;
alter table public.reviews enable row level security;
alter table public.review_likes enable row level security;
alter table public.hidden_reviewers enable row level security;
alter table public.book_rating_stats enable row level security;
alter table public.book_related enable row level security;

create policy app_config_select on public.app_config for select to authenticated using (true);
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy reading_progress_select on public.reading_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy follows_select on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy book_price_history_select on public.book_price_history for select to authenticated
  using ((select public.is_staff()));
create policy paygo_accounts_select on public.paygo_accounts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy gifts_select on public.gifts for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy tips_select on public.tips for select to authenticated
  using (from_user_id = (select auth.uid()) or author_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'support']::public.staff_role[])));

-- reviews: visible rows for everyone signed in (plus your own and staff). Writes: your own row,
-- and only once you have read 95% of the book.
create policy reviews_select on public.reviews for select to authenticated
  using (status = 'visible' or user_id = (select auth.uid()) or (select public.is_staff()));
create policy reviews_insert on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and public._finished((select auth.uid()), book_id));
create policy reviews_update on public.reviews for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public._finished((select auth.uid()), book_id));
create policy reviews_delete on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()));
create policy review_likes_own on public.review_likes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy hidden_reviewers_own on public.hidden_reviewers for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy book_rating_stats_select on public.book_rating_stats for select to authenticated using (true);
create policy book_related_select on public.book_related for select to authenticated using (true);

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on public.app_config, public.subscriptions, public.reading_progress, public.follows, public.blocks,
  public.book_price_history, public.paygo_accounts, public.gifts, public.tips, public.reviews,
  public.review_likes, public.hidden_reviewers, public.book_rating_stats, public.book_related,
  public.book_effective
  from anon, authenticated;
grant select on public.app_config, public.subscriptions, public.reading_progress, public.follows, public.blocks,
  public.book_price_history, public.paygo_accounts, public.gifts, public.tips, public.reviews,
  public.review_likes, public.hidden_reviewers, public.book_rating_stats, public.book_related,
  public.book_effective
  to authenticated;
-- Readers write their own reviews (policies enforce owner + 95%), likes and hidden reviewers.
grant insert (book_id, user_id, stars, body, spoiler), update (stars, body, spoiler, edited_at), delete
  on public.reviews to authenticated;
grant insert, delete on public.review_likes, public.hidden_reviewers to authenticated;
-- Money rows: the service role cannot write them directly either.
revoke insert, update, delete, truncate on public.gifts, public.tips, public.paygo_accounts from service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        '_config', '_refresh_rating_stats', '_reviews_stats_trigger', '_review_likes_trigger',
        '_reads_count_trigger', '_raise', '_uid', '_plan_state', '_balance', '_chapter_paid', '_owns_book',
        '_remaining', '_check_spend_rate', '_buyable_book', 'spend_credits', 'unlock_book', 'gift_book',
        'tip_author', '_review_json', '_book_card', 'get_book_page', 'get_book_about', 'get_reviews',
        'get_gift_people', 'get_book_discussion', '_finished', 'post_review', 'delete_review',
        'toggle_review_like', 'hide_reviewer', 'unhide_reviewer',
        'set_following', 'rebuild_book_related', '_require_price_staff', '_mid_paygo', '_apply_book_price',
        'admin_set_book_price', 'admin_set_preview', 'admin_book_access', 'admin_book_stats')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- RLS helper used inside the reviews policies.
grant execute on function public._finished(uuid, uuid) to authenticated;

-- Readers (own JWT).
grant execute on function
  public.unlock_book(uuid, integer, text),
  public.gift_book(uuid, uuid, text, integer, text),
  public.tip_author(uuid, integer, text, text),
  public.get_book_page(uuid),
  public.get_book_about(uuid),
  public.get_reviews(uuid, integer, integer, integer),
  public.get_gift_people(uuid, text),
  public.get_book_discussion(uuid),
  public.post_review(uuid, integer, text, boolean),
  public.delete_review(uuid),
  public.toggle_review_like(uuid),
  public.hide_reviewer(uuid),
  public.unhide_reviewer(uuid),
  public.set_following(uuid, boolean)
  to authenticated;

-- Staff (own JWT; each checks its own permission).
grant execute on function
  public.admin_set_book_price(uuid, integer, text, jsonb),
  public.admin_set_preview(uuid, numeric, text),
  public.admin_book_access(uuid),
  public.admin_book_stats(uuid)
  to authenticated;

-- spend_credits stays callable by nobody but the definer functions above (owner postgres).

-- Existing live books start with empty rating stats so every page reads one row.
insert into public.book_rating_stats (book_id) select id from public.books on conflict do nothing;
insert into public.app_config (key, value)
select k, public._config(k) from unnest(array['avg_book_price_credits', 'tip_presets', 'spend_rate_per_minute',
  'topup_packs', 'plans']) k;
