-- Flow 04 · Reading. Positions, sessions, annotations, passage discussion, devices and offline
-- licences, plus pay as you read in the reader: unlock_chapter and undo_chapter_unlock.
-- Every credit movement goes through spend_credits (flow 03) or the undo rows written here, in one
-- transaction. Keys are released by the api Worker (routes/04) only for chapters entitled_chapters
-- returns.

-- ─── reading_progress: the position (rule 14) ───────────────────────────────
alter table public.reading_progress
  add column revision_id uuid references public.book_revisions (id) on delete set null,
  add column cfi text check (char_length(cfi) <= 2000),
  add column chapter_uid uuid,
  add column para_id text check (char_length(para_id) <= 100),
  add column char_offset integer not null default 0 check (char_offset >= 0),
  add column max_chapter_ord integer not null default 0,
  add column device_id uuid,
  add column device_name text check (char_length(device_name) <= 80),
  add column first_opened_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- ─── reading_sessions (rule 69) ─────────────────────────────────────────────
create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  device_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_seconds integer not null check (active_seconds between 0 and 86400),
  created_at timestamptz not null default now(),
  unique (user_id, client_id),
  check (ended_at >= started_at)
);
create index reading_sessions_user_book_idx on public.reading_sessions (user_id, book_id);

-- ─── annotations (rules 38–45) ──────────────────────────────────────────────
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  revision_id uuid references public.book_revisions (id) on delete set null,
  kind text not null check (kind in ('highlight', 'note', 'bookmark')),
  color text check (color in ('green', 'yellow', 'blue', 'pink', 'purple', 'peach')),
  cfi_range text not null check (char_length(cfi_range) <= 2000),
  chapter_uid uuid,
  start_para_id text check (char_length(start_para_id) <= 100),
  start_char integer not null default 0 check (start_char >= 0),
  end_para_id text check (char_length(end_para_id) <= 100),
  end_char integer not null default 0 check (end_char >= 0),
  quote text check (char_length(quote) <= 500),
  note_text text check (char_length(note_text) <= 2000),
  visibility text not null default 'private' check (visibility in ('private', 'club')),
  shared_group_id uuid,
  moved boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  check ((kind = 'bookmark') = (color is null)),
  check ((visibility = 'club') = (shared_group_id is not null))
);
create index annotations_sync_idx on public.annotations (user_id, book_id, updated_at);

-- ─── passage discussion (rules 46–50) ───────────────────────────────────────
create table public.passage_comments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  para_id text not null check (char_length(para_id) <= 100),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  quote text check (char_length(quote) <= 500),
  reveal_at_chapter_ord smallint check (reveal_at_chapter_ord >= 0),
  status text not null default 'visible' check (status in ('visible', 'removed')),
  created_at timestamptz not null default now()
);
create index passage_comments_para_idx on public.passage_comments (book_id, para_id, created_at)
  where status = 'visible';

create table public.passage_comment_reactions (
  comment_id uuid not null references public.passage_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('heart', 'pray')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, kind)
);

-- Counts per passage (the markers read it).
create view public.passage_counts with (security_invoker) as
  select book_id, para_id, count(*)::int as count
  from public.passage_comments where status = 'visible'
  group by book_id, para_id;

-- ─── devices and offline licences (rules 4, 70–72) ──────────────────────────
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  public_key text not null check (char_length(public_key) between 100 and 2000),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, public_key)
);
create index devices_user_idx on public.devices (user_id) where revoked_at is null;

create table public.offline_licenses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  issued_at timestamptz not null default now(),
  valid_until timestamptz not null,
  primary key (user_id, device_id, book_id)
);

-- ─── reports: content problems from the reader (rule 26) ────────────────────
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('book', 'review', 'user', 'message', 'book_content'));
alter table public.reports add column context jsonb not null default '{}';
-- A reader may report several problems in one book; the "once while open" rule stays for the rest.
drop index public.reports_once_idx;
create unique index reports_once_idx on public.reports (reporter_id, target_type, target_id)
  where status = 'open' and target_type <> 'book_content';

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- The revision a reader reads: the book's current one, when the book is live, or when the reader
-- holds any active entitlement and access hasn't been removed ("unlocked books stay forever").
create function public._readable_revision(p_user uuid, p_book uuid) returns public.book_revisions
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.books;
  r public.book_revisions;
begin
  select * into b from public.books where id = p_book;
  if not found then
    perform public._raise('not_found');
  end if;
  if not (b.status = 'live'
          or b.author_id = p_user
          or (b.access_removed_at is null and exists (
                select 1 from public.entitlements e
                where e.user_id = p_user and e.book_id = p_book and e.revoked_at is null))) then
    perform public._raise('not_available');
  end if;
  select * into r from public.book_revisions where id = b.current_revision_id;
  if not found then
    perform public._raise('not_available');
  end if;
  return r;
end $$;

-- Access per chapter (rule 7): open (wholly free: inside the preview or price 0), partial (holds
-- the preview cut), unlocked (book or chapter entitlement, or the reader is the author), locked.
create function public._chapter_access(p_user uuid, p_book uuid, p_rev uuid) returns table (
  chapter_uid uuid, ord integer, access text)
language sql stable security definer set search_path = '' as $$
  select c.chapter_uid, c.ord,
    case
      when c.ord <= r.free_through_ord or c.price_credits = 0 then 'open'
      when b.author_id = p_user or public._owns_book(p_user, p_book) then 'unlocked'
      when exists (select 1 from public.entitlements e
                   where e.user_id = p_user and e.book_id = p_book and e.scope = 'chapter'
                     and e.chapter_uid = c.chapter_uid and e.revoked_at is null) then 'unlocked'
      when c.chapter_uid = r.preview_cut_chapter_uid then 'partial'
      else 'locked'
    end
  from public.chapters c
  join public.book_revisions r on r.id = c.revision_id
  join public.books b on b.id = r.book_id
  where c.revision_id = p_rev and b.id = p_book
$$;

-- Where a paragraph sits in the book, as a percent of all words (positions and spoiler checks).
create function public._para_percent(p_rev uuid, p_para text) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(a.words_before * 100.0 / nullif(r.words, 0), 2)
  from public.paragraph_anchors a join public.book_revisions r on r.id = a.revision_id
  where a.revision_id = p_rev and a.para_id = p_para
$$;

-- May the reader see text at this paragraph? Open and unlocked chapters: yes. Partial: up to the
-- preview cut. Locked: only the peek (rule 3: paragraphs that start within the first 300 words,
-- capped at 40% of the chapter).
create function public._para_readable(p_user uuid, p_book uuid, p_rev uuid, p_chapter uuid, p_para text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_access text;
  c public.chapters;
  a public.paragraph_anchors;
  v_cut public.paragraph_anchors;
begin
  select x.access into v_access from public._chapter_access(p_user, p_book, p_rev) x where x.chapter_uid = p_chapter;
  if v_access is null then
    return false;
  end if;
  if v_access in ('open', 'unlocked') then
    return true;
  end if;
  if p_para is null then
    return true; -- the chapter heading
  end if;
  select * into a from public.paragraph_anchors where revision_id = p_rev and para_id = p_para;
  if not found or a.chapter_uid <> p_chapter then
    return false;
  end if;
  if v_access = 'partial' then
    select x.* into v_cut from public.paragraph_anchors x
    join public.book_revisions r on r.id = x.revision_id and x.para_id = r.preview_cut_para_id
    where x.revision_id = p_rev;
    return v_cut.ord is null or a.ord <= v_cut.ord;
  end if;
  select * into c from public.chapters where revision_id = p_rev and chapter_uid = p_chapter;
  return a.words_before - c.words_before <= least(300, c.words * 0.4);
end $$;

create function public._annotation_json(a public.annotations) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'client_id', a.client_id, 'book_id', a.book_id,
    'revision_id', a.revision_id, 'kind', a.kind, 'color', a.color, 'cfi_range', a.cfi_range,
    'chapter_uid', a.chapter_uid, 'start_para_id', a.start_para_id, 'start_char', a.start_char,
    'end_para_id', a.end_para_id, 'end_char', a.end_char, 'quote', a.quote, 'note_text', a.note_text,
    'visibility', a.visibility, 'shared_group_id', a.shared_group_id, 'moved', a.moved,
    'deleted', a.deleted_at is not null, 'created_at', a.created_at, 'updated_at', a.updated_at)
$$;

-- ─── get_reader_state (rule 10) ─────────────────────────────────────────────
create function public.get_reader_state(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  b public.books;
  r public.book_revisions;
  v_owns boolean;
  v_price int;
  v_progress public.reading_progress;
begin
  r := public._readable_revision(v_user, p_book);
  select * into b from public.books where id = p_book;
  v_owns := public._owns_book(v_user, p_book) or b.author_id = v_user;
  select effective_price into v_price from public.book_effective where book_id = p_book;
  select * into v_progress from public.reading_progress where user_id = v_user and book_id = p_book;

  return jsonb_build_object(
    'book', jsonb_build_object('id', b.id, 'title', b.title, 'status', b.status, 'cover_key', r.cover_key,
      'author', jsonb_build_object('id', b.author_id,
                                   'name', (select full_name from public.profiles where id = b.author_id))),
    'revision', jsonb_build_object('id', r.id, 'revision_no', r.revision_no, 'manifest_key', r.manifest_key,
      'artifact_prefix', r.artifact_prefix, 'words', r.words, 'pages', r.pages,
      'preview_cut', jsonb_build_object('chapter_uid', r.preview_cut_chapter_uid, 'para_id', r.preview_cut_para_id)),
    'chapters', (
      select coalesce(jsonb_agg(jsonb_build_object('chapter_uid', c.chapter_uid, 'ord', c.ord, 'kind', c.kind,
               'title', c.title, 'words', c.words, 'words_before', c.words_before, 'pages', c.pages,
               'price_credits', c.price_credits, 'access', x.access) order by c.ord), '[]')
      from public.chapters c join public._chapter_access(v_user, p_book, r.id) x on x.chapter_uid = c.chapter_uid
      where c.revision_id = r.id),
    'owns_book', v_owns,
    'is_author', b.author_id = v_user,
    'price', v_price,
    'paid_credits', public._chapter_paid(v_user, p_book),
    'remaining', case when v_owns then 0 else public._remaining(v_user, p_book) end,
    'balance', public._balance(v_user),
    'plan', public._plan_state(v_user),
    'position', case when v_progress.user_id is null then null else jsonb_build_object(
      'revision_id', v_progress.revision_id, 'cfi', v_progress.cfi, 'chapter_uid', v_progress.chapter_uid,
      'para_id', v_progress.para_id, 'char_offset', v_progress.char_offset, 'percent', v_progress.percent,
      'max_percent', v_progress.max_percent, 'device_id', v_progress.device_id,
      'device_name', v_progress.device_name, 'updated_at', v_progress.updated_at,
      'finished_at', v_progress.finished_at) end,
    'annotations_cursor', (select max(updated_at) from public.annotations where user_id = v_user and book_id = p_book),
    'reader_settings', (select reader_settings from public.profiles where id = v_user),
    'server_time', now()
  );
end $$;

-- ─── unlock_chapter (rules 54–57) ───────────────────────────────────────────
-- Returns {status: ok|already_unlocked, ledger_id, spent, balance, undo_until, book_completed}.
create function public.unlock_chapter(p_book uuid, p_chapter_uid uuid, p_source text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_book public.books;
  r public.book_revisions;
  c public.chapters;
  v_prior public.credit_ledger;
  v_price int;
  v_cap int;
  v_charge int;
  v_spend jsonb;
  v_ledger bigint;
  v_completed boolean := false;
begin
  if p_source is null or p_source not in ('tap', 'auto') then
    perform public._raise('bad_source');
  end if;
  if p_key is null or length(p_key) < 8 or length(p_key) > 100 then
    perform public._raise('bad_key');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- Same key again: the first result, nothing new.
  select * into v_prior from public.credit_ledger where idempotency_key = 'u:' || v_user || ':' || p_key;
  if found then
    if v_prior.reason <> 'chapter' or v_prior.book_id is distinct from p_book
       or v_prior.chapter_uid is distinct from p_chapter_uid then
      perform public._raise('key_reused');
    end if;
    return jsonb_build_object('status', 'ok', 'ledger_id', v_prior.id,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(v_user), 'undo_until', v_prior.created_at + interval '10 minutes',
      'book_completed', exists (select 1 from public.entitlements where user_id = v_user and book_id = p_book
                                  and scope = 'book' and source = 'chapter_complete' and revoked_at is null),
      'replayed', true);
  end if;

  v_book := public._buyable_book(p_book);
  if v_book.author_id = v_user then
    perform public._raise('own_book');
  end if;
  select * into r from public.book_revisions where id = v_book.current_revision_id;
  select * into c from public.chapters where revision_id = r.id and chapter_uid = p_chapter_uid;
  if not found then
    perform public._raise('not_found');
  end if;
  if c.ord <= r.free_through_ord or c.price_credits = 0 then
    perform public._raise('not_chargeable');
  end if;

  if public._owns_book(v_user, p_book) or exists (
       select 1 from public.entitlements where user_id = v_user and book_id = p_book and scope = 'chapter'
         and chapter_uid = p_chapter_uid and revoked_at is null) then
    return jsonb_build_object('status', 'already_unlocked', 'ledger_id', null, 'spent', 0,
      'balance', public._balance(v_user), 'undo_until', null, 'book_completed', false);
  end if;

  if p_source = 'auto' and coalesce((select (reader_settings ->> 'auto_unlock')::boolean
                                     from public.profiles where id = v_user), true) is not true then
    perform public._raise('auto_off');
  end if;
  -- 30 chapter charges a minute per reader.
  if (select count(*) from public.credit_ledger
      where user_id = v_user and reason = 'chapter' and idempotency_key not like '%#%'
        and created_at > now() - interval '1 minute') >= 30 then
    perform public._raise('rate_limited');
  end if;

  -- The price the reader started with stays their cap (flow 03 rule; flow 11 revisions).
  select effective_price into v_price from public.book_effective where book_id = p_book;
  insert into public.paygo_accounts (user_id, book_id, snapshot_price) values (v_user, p_book, v_price)
  on conflict do nothing;
  select least(pa.snapshot_price, v_price) into v_cap
  from public.paygo_accounts pa where pa.user_id = v_user and pa.book_id = p_book;
  v_charge := least(c.price_credits, greatest(v_cap - public._chapter_paid(v_user, p_book), 0));

  if v_charge > 0 then
    v_spend := public.spend_credits(v_user, v_charge, 'chapter', p_book, p_chapter_uid, v_book.author_id, p_key,
      jsonb_build_object('chapter_ord', c.ord, 'source', p_source, 'price', c.price_credits));
    v_ledger := (v_spend ->> 'ledger_id')::bigint;
  end if;

  insert into public.entitlements (user_id, book_id, scope, chapter_uid, source, ledger_id)
  values (v_user, p_book, 'chapter', p_chapter_uid, 'chapter', v_ledger);

  -- Paid the whole capped price: the book is theirs (the whole book becomes downloadable).
  if public._chapter_paid(v_user, p_book) >= v_cap then
    insert into public.entitlements (user_id, book_id, scope, source)
    values (v_user, p_book, 'book', 'chapter_complete');
    v_completed := true;
  end if;

  return jsonb_build_object('status', 'ok', 'ledger_id', v_ledger, 'spent', v_charge,
    'balance', public._balance(v_user),
    'undo_until', case when v_ledger is not null then now() + interval '10 minutes' end,
    'book_completed', v_completed, 'replayed', false);
end $$;

-- ─── undo_chapter_unlock (rule 59) ──────────────────────────────────────────
-- Refunds every bucket row of the charge, revokes the chapter entitlement and reverses the author
-- earning. p_staff (flow 14 Support) skips the 10-minute window and the 20% rule; it is audited there.
create function public._undo_chapter(p_user uuid, p_ledger bigint, p_key text, p_staff boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'u:' || p_user || ':' || p_key;
  l public.credit_ledger;
  v_prior public.credit_ledger;
  c public.chapters;
  p public.reading_progress;
  v_read int;
  v_txn uuid := gen_random_uuid();
  v_balance int;
  v_first bigint;
  v_id bigint;
  v_refund int := 0;
  x record;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 100 then
    perform public._raise('bad_key');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_prior from public.credit_ledger where idempotency_key = v_key;
  if found then
    if v_prior.reason <> 'undo' then
      perform public._raise('key_reused');
    end if;
    return jsonb_build_object('status', 'undone', 'refunded',
      (select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(p_user), 'chapter_uid', v_prior.chapter_uid, 'replayed', true);
  end if;

  select * into l from public.credit_ledger where id = p_ledger and user_id = p_user and reason = 'chapter';
  if not found then
    perform public._raise('not_found');
  end if;
  if exists (select 1 from public.credit_ledger u join public.credit_ledger o on o.id = u.ref_ledger_id
             where o.txn_id = l.txn_id) then
    perform public._raise('already_undone');
  end if;
  if not p_staff and l.created_at < now() - interval '10 minutes' then
    perform public._raise('undo_expired');
  end if;
  -- Unlock all or Pay the rest since: the book entitlement already covers this chapter.
  if exists (select 1 from public.entitlements where user_id = p_user and book_id = l.book_id
               and scope = 'book' and revoked_at is null) then
    perform public._raise('book_unlocked');
  end if;

  if not p_staff then
    -- Anti-abuse: refused once the reader has read more than 20% of the chapter (by words) or moved past it.
    select ch.* into c from public.chapters ch
    join public.books b on b.current_revision_id = ch.revision_id
    where b.id = l.book_id and ch.chapter_uid = l.chapter_uid;
    select * into p from public.reading_progress where user_id = p_user and book_id = l.book_id;
    if p.user_id is not null and c.chapter_uid is not null then
      if p.max_chapter_ord > c.ord then
        perform public._raise('already_read');
      end if;
      if p.chapter_uid = c.chapter_uid then
        select a.words_before - c.words_before into v_read
        from public.paragraph_anchors a where a.revision_id = c.revision_id and a.para_id = p.para_id;
        if coalesce(v_read, 0) > c.words * 0.2 then
          perform public._raise('already_read');
        end if;
      end if;
    end if;
  end if;

  v_balance := public._balance(p_user);
  for x in select * from public.credit_ledger where txn_id = l.txn_id order by id loop
    v_balance := v_balance - x.delta;
    v_refund := v_refund - x.delta;
    insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, txn_id, ref_type, ref_id,
      idempotency_key, book_id, chapter_uid, author_id, author_earning_kobo, balance_after, ref_ledger_id, meta)
    values (p_user, -x.delta, 'undo', x.bucket, x.expires_at, v_txn, 'ledger', x.id::text,
      case when v_first is null then v_key else v_key || '#' || x.bucket end,
      x.book_id, x.chapter_uid, x.author_id, -x.author_earning_kobo, v_balance, x.id,
      jsonb_build_object('staff', p_staff))
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
  end loop;

  update public.entitlements set revoked_at = now(), revoked_reason = 'undo'
  where user_id = p_user and book_id = l.book_id and scope = 'chapter' and chapter_uid = l.chapter_uid
    and revoked_at is null;

  return jsonb_build_object('status', 'undone', 'refunded', v_refund, 'balance', v_balance,
    'chapter_uid', l.chapter_uid, 'ledger_id', v_first, 'replayed', false);
end $$;

create function public.undo_chapter_unlock(p_ledger bigint, p_key text) returns jsonb
language sql security definer set search_path = '' as $$
  select public._undo_chapter(public._uid(), p_ledger, p_key, false)
$$;

-- ─── sync_reading_progress (rule 66) ────────────────────────────────────────
-- Ignores writes older than the stored one; max_percent and max_chapter_ord only grow; finished
-- the first time percent reaches 95; refuses positions the reader cannot open.
create function public.sync_reading_progress(p_book uuid, p_revision uuid, p_cfi text, p_chapter_uid uuid,
  p_para_id text, p_char_offset integer, p_percent numeric, p_device_id uuid, p_device_name text,
  p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  r public.book_revisions;
  c public.chapters;
  v_pct numeric;
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_row public.reading_progress;
begin
  r := public._readable_revision(v_user, p_book);
  -- A reader finishing the revision they started (rule: revision mid-session) may still send it.
  if p_revision is distinct from r.id then
    select * into r from public.book_revisions where id = p_revision and book_id = p_book;
    if not found then
      perform public._raise('bad_revision');
    end if;
  end if;
  select * into c from public.chapters where revision_id = r.id and chapter_uid = p_chapter_uid;
  if not found then
    perform public._raise('bad_position');
  end if;
  if not public._para_readable(v_user, p_book, r.id, p_chapter_uid, p_para_id) then
    perform public._raise('beyond_gate');
  end if;
  -- Percent stays inside the chapter it claims (the client computes it from the manifest).
  v_pct := least(greatest(coalesce(p_percent, 0),
                          round(c.words_before * 100.0 / nullif(r.words, 0), 1)),
                 round((c.words_before + c.words) * 100.0 / nullif(r.words, 0), 1), 100);

  insert into public.reading_progress as rp (user_id, book_id, revision_id, cfi, chapter_uid, para_id,
    char_offset, percent, max_percent, chapter_ord, max_chapter_ord, device_id, device_name, finished_at,
    last_opened_at, updated_at)
  values (v_user, p_book, r.id, p_cfi, p_chapter_uid, p_para_id, greatest(coalesce(p_char_offset, 0), 0),
    v_pct, v_pct, c.ord, c.ord, p_device_id, left(p_device_name, 80),
    case when v_pct >= 95 then now() end, now(), v_at)
  on conflict (user_id, book_id) do update set
    revision_id = excluded.revision_id, cfi = excluded.cfi, chapter_uid = excluded.chapter_uid,
    para_id = excluded.para_id, char_offset = excluded.char_offset, percent = excluded.percent,
    max_percent = greatest(rp.max_percent, excluded.percent), chapter_ord = excluded.chapter_ord,
    max_chapter_ord = greatest(rp.max_chapter_ord, excluded.chapter_ord), device_id = excluded.device_id,
    device_name = excluded.device_name,
    finished_at = coalesce(rp.finished_at, case when excluded.percent >= 95 then now() end),
    last_opened_at = now(), updated_at = excluded.updated_at
  where rp.updated_at <= excluded.updated_at;

  select * into v_row from public.reading_progress where user_id = v_user and book_id = p_book;
  return jsonb_build_object('percent', v_row.percent, 'max_percent', v_row.max_percent,
    'updated_at', v_row.updated_at, 'finished_at', v_row.finished_at, 'cfi', v_row.cfi,
    'applied', v_row.updated_at = v_at);
end $$;

-- ─── annotations sync (rule 43) ─────────────────────────────────────────────
-- p_batch: [{client_id, book_id, revision_id, kind, color, cfi_range, chapter_uid, start_para_id,
-- start_char, end_para_id, end_char, quote, note_text, visibility, deleted, updated_at}].
-- Last write by updated_at wins per annotation. Returns the stored rows.
create function public.upsert_annotations(p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  i jsonb;
  r public.book_revisions;
  v_at timestamptz;
  v_out jsonb := '[]';
  v_row public.annotations;
  v_kind text;
begin
  if jsonb_typeof(p_batch) <> 'array' or jsonb_array_length(p_batch) > 200 then
    perform public._raise('bad_batch');
  end if;
  for i in select * from jsonb_array_elements(p_batch) loop
    v_kind := i ->> 'kind';
    v_at := least(coalesce((i ->> 'updated_at')::timestamptz, now()), now());
    if coalesce(i ->> 'visibility', 'private') <> 'private' then
      perform public._raise('club_not_ready'); -- sharing to a club arrives with flow 06 groups
    end if;
    if not coalesce((i ->> 'deleted')::boolean, false) then
      r := public._readable_revision(v_user, (i ->> 'book_id')::uuid);
      -- Highlights only exist in text the reader can open (rule 37).
      if v_kind <> 'bookmark' and (i ->> 'revision_id')::uuid = r.id
         and not public._para_readable(v_user, (i ->> 'book_id')::uuid, r.id, (i ->> 'chapter_uid')::uuid,
                                       i ->> 'end_para_id') then
        perform public._raise('beyond_gate');
      end if;
      if v_kind = 'bookmark' and not exists (
           select 1 from public.annotations where user_id = v_user and client_id = (i ->> 'client_id')::uuid)
         and (select count(*) from public.annotations where user_id = v_user and book_id = (i ->> 'book_id')::uuid
                and kind = 'bookmark' and deleted_at is null) >= 200 then
        perform public._raise('bookmark_limit');
      end if;
    end if;

    insert into public.annotations as a (client_id, user_id, book_id, revision_id, kind, color, cfi_range,
      chapter_uid, start_para_id, start_char, end_para_id, end_char, quote, note_text, deleted_at,
      created_at, updated_at)
    values ((i ->> 'client_id')::uuid, v_user, (i ->> 'book_id')::uuid, (i ->> 'revision_id')::uuid, v_kind,
      case when v_kind = 'bookmark' then null else coalesce(i ->> 'color', 'yellow') end, i ->> 'cfi_range',
      (i ->> 'chapter_uid')::uuid, i ->> 'start_para_id', coalesce((i ->> 'start_char')::int, 0),
      i ->> 'end_para_id', coalesce((i ->> 'end_char')::int, 0), left(i ->> 'quote', 500),
      case when v_kind = 'note' then nullif(btrim(i ->> 'note_text'), '') end,
      case when coalesce((i ->> 'deleted')::boolean, false) then v_at end, v_at, v_at)
    on conflict (user_id, client_id) do update set
      kind = excluded.kind, color = excluded.color, cfi_range = excluded.cfi_range,
      note_text = excluded.note_text, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
    where a.updated_at < excluded.updated_at and a.book_id = excluded.book_id;

    select * into v_row from public.annotations where user_id = v_user and client_id = (i ->> 'client_id')::uuid;
    if v_row.book_id is distinct from (i ->> 'book_id')::uuid then
      perform public._raise('key_reused');
    end if;
    v_out := v_out || jsonb_build_array(public._annotation_json(v_row));
  end loop;
  return v_out;
end $$;

-- Changes since the cursor, tombstones included. Returns {items, cursor}.
create function public.pull_annotations(p_book uuid, p_since timestamptz default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(public._annotation_json(a) order by a.updated_at), '[]'),
    'cursor', max(a.updated_at))
  from (select * from public.annotations
        where user_id = public._uid() and book_id = p_book
          and (p_since is null or updated_at > p_since)
        order by updated_at limit 1000) a
$$;

-- ─── passage discussion (rules 46–50) ───────────────────────────────────────
-- A paragraph's thread is open to a reader whose furthest position has reached it (rule 49).
create function public._passage_reached(p_user uuid, p_book uuid, p_para text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public._para_percent(b.current_revision_id, p_para) <= coalesce(
              (select max_percent from public.reading_progress where user_id = p_user and book_id = p_book), 0)
     from public.books b where b.id = p_book),
    false)
    or exists (select 1 from public.books where id = p_book and author_id = p_user)
$$;

create function public.get_passage_counts(p_book uuid, p_chapter_uids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('para_id', pc.para_id, 'count', pc.count)), '[]')
  from public.passage_counts pc
  join public.books b on b.id = pc.book_id
  join public.paragraph_anchors a on a.revision_id = b.current_revision_id and a.para_id = pc.para_id
  where pc.book_id = p_book and a.chapter_uid = any (p_chapter_uids)
    and public._passage_reached(public._uid(), p_book, pc.para_id)
$$;

create function public._passage_comment_json(p_user uuid, pc public.passage_comments, p_max_ord integer,
  p_author uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', pc.id, 'body',
      case when pc.reveal_at_chapter_ord is not null and pc.reveal_at_chapter_ord > p_max_ord
                and pc.user_id <> p_user then null else pc.body end,
    'hidden_until_chapter', case when pc.reveal_at_chapter_ord is not null and pc.reveal_at_chapter_ord > p_max_ord
                                      and pc.user_id <> p_user then pc.reveal_at_chapter_ord + 1 end,
    'created_at', pc.created_at, 'mine', pc.user_id = p_user, 'is_author', pc.user_id = p_author,
    'user', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'username', p.username)
             from public.profiles p where p.id = pc.user_id),
    'hearts', (select count(*) from public.passage_comment_reactions where comment_id = pc.id and kind = 'heart'),
    'prays', (select count(*) from public.passage_comment_reactions where comment_id = pc.id and kind = 'pray'),
    'my_reactions', (select coalesce(jsonb_agg(kind), '[]') from public.passage_comment_reactions
                     where comment_id = pc.id and user_id = p_user))
$$;

create function public.get_passage_thread(p_book uuid, p_para text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  b public.books;
  v_max_ord int;
begin
  select * into b from public.books where id = p_book;
  if not found or not public._passage_reached(v_user, p_book, p_para) then
    perform public._raise('not_reached');
  end if;
  select coalesce(max_chapter_ord, 0) into v_max_ord from public.reading_progress
  where user_id = v_user and book_id = p_book;
  return jsonb_build_object(
    'para_id', p_para,
    'chapter_ord', (select c.ord from public.paragraph_anchors a
                    join public.chapters c on c.revision_id = a.revision_id and c.chapter_uid = a.chapter_uid
                    where a.revision_id = b.current_revision_id and a.para_id = p_para),
    'count', (select count(*) from public.passage_comments where book_id = p_book and para_id = p_para
                and status = 'visible'),
    'comments', (select coalesce(jsonb_agg(public._passage_comment_json(v_user, pc, coalesce(v_max_ord, 0), b.author_id)
                                           order by pc.created_at), '[]')
                 from public.passage_comments pc
                 where pc.book_id = p_book and pc.para_id = p_para and pc.status = 'visible'
                   and not exists (select 1 from public.blocks where blocker_id = v_user and blocked_id = pc.user_id)));
end $$;

create function public.post_passage_comment(p_book uuid, p_para text, p_body text, p_quote text default null,
  p_reveal_at_chapter_ord integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_row public.passage_comments;
begin
  if not public._passage_reached(v_user, p_book, p_para) then
    perform public._raise('not_reached');
  end if;
  if coalesce(char_length(btrim(p_body)), 0) not between 1 and 1000 then
    perform public._raise('bad_body');
  end if;
  if (select count(*) from public.passage_comments where user_id = v_user
        and created_at > now() - interval '1 minute') >= 10 then
    perform public._raise('rate_limited');
  end if;
  insert into public.passage_comments (book_id, para_id, user_id, body, quote, reveal_at_chapter_ord)
  values (p_book, p_para, v_user, btrim(p_body), left(p_quote, 500), p_reveal_at_chapter_ord)
  returning * into v_row;
  return public._passage_comment_json(v_user, v_row, 32767,
    (select author_id from public.books where id = p_book));
end $$;

create function public.react_passage_comment(p_comment uuid, p_kind text, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  pc public.passage_comments;
begin
  if p_kind not in ('heart', 'pray') then
    perform public._raise('bad_kind');
  end if;
  select * into pc from public.passage_comments where id = p_comment and status = 'visible';
  if not found or not public._passage_reached(v_user, pc.book_id, pc.para_id) then
    perform public._raise('not_found');
  end if;
  if p_on then
    insert into public.passage_comment_reactions (comment_id, user_id, kind) values (p_comment, v_user, p_kind)
    on conflict do nothing;
  else
    delete from public.passage_comment_reactions where comment_id = p_comment and user_id = v_user and kind = p_kind;
  end if;
  return p_on;
end $$;

-- Moderators remove comments (flow 14 screens); audited.
create function public.moderate_passage_comment(p_comment uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff_any(array['moderator', 'super_admin']::public.staff_role[]) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('visible', 'removed') then
    perform public._raise('bad_status');
  end if;
  update public.passage_comments set status = p_status where id = p_comment;
  if not found then
    perform public._raise('not_found');
  end if;
  perform public.write_audit('moderation', 'passage_comment_' || p_status, 'passage_comment', p_comment::text,
    null, null, null, null, p_reason);
end $$;

-- ─── report, sessions ───────────────────────────────────────────────────────
create function public.report_book_problem(p_book uuid, p_revision uuid, p_chapter_uid uuid, p_cfi text,
  p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_id uuid;
begin
  perform public._readable_revision(v_user, p_book);
  if char_length(p_note) > 500 then
    perform public._raise('bad_note');
  end if;
  if (select count(*) from public.reports where reporter_id = v_user and target_type = 'book_content'
        and created_at > now() - interval '1 hour') >= 20 then
    perform public._raise('rate_limited');
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, note, context)
  values (v_user, 'book_content', p_book, 'book_content', nullif(btrim(p_note), ''),
    jsonb_build_object('revision_id', p_revision, 'chapter_uid', p_chapter_uid, 'cfi', left(p_cfi, 2000)))
  returning id into v_id;
  return v_id;
end $$;

create function public.log_reading_session(p_client_id uuid, p_book uuid, p_device_id uuid,
  p_started_at timestamptz, p_ended_at timestamptz, p_active_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reading_sessions (client_id, user_id, book_id, device_id, started_at, ended_at, active_seconds)
  values (p_client_id, public._uid(), p_book, p_device_id, p_started_at, least(p_ended_at, now()),
    least(greatest(p_active_seconds, 0),
          greatest(extract(epoch from least(p_ended_at, now()) - p_started_at)::int, 0)))
  on conflict (user_id, client_id) do update set ended_at = excluded.ended_at,
    active_seconds = excluded.active_seconds;
end $$;

-- ─── reader settings (rule 63) ──────────────────────────────────────────────
create or replace function public.set_reader_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_out jsonb;
  v_ok boolean;
begin
  v_ok := case p_key
    when 'auto_unlock' then jsonb_typeof(p_value) = 'boolean'
    when 'font_size' then jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 14 and 28
                          and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
    when 'font' then p_value #>> '{}' in ('literata', 'inter', 'serif', 'atkinson')
    when 'line_spacing' then p_value #>> '{}' in ('tight', 'normal', 'loose')
    when 'layout' then p_value #>> '{}' in ('pages', 'scroll')
    when 'theme' then p_value #>> '{}' in ('light', 'sepia', 'dark')
    when 'last_light_theme' then p_value #>> '{}' in ('light', 'sepia')
    when 'highlight_color' then p_value #>> '{}' in ('green', 'yellow', 'blue', 'pink', 'purple', 'peach')
    else false
  end;
  if not coalesce(v_ok, false) or jsonb_typeof(p_value) not in ('boolean', 'number', 'string') then
    perform public._raise('bad_setting');
  end if;
  update public.profiles set reader_settings = reader_settings || jsonb_build_object(p_key, p_value)
  where id = v_user
  returning reader_settings into v_out;
  return v_out;
end $$;

-- ─── For the api Worker ─────────────────────────────────────────────────────
-- Called with the reader's JWT: the chapters whose keys the reader may hold (K_free is always
-- allowed). {revision_id, all, chapter_uids}.
create function public.entitled_chapters(p_book uuid, p_revision uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  r public.book_revisions;
begin
  r := public._readable_revision(v_user, p_book);
  -- The revision the reader holds a licence for stays readable until they reopen (rule: Server).
  if p_revision is not null and p_revision <> r.id then
    if not exists (select 1 from public.offline_licenses
                   where user_id = v_user and book_id = p_book and revision_id = p_revision) then
      perform public._raise('stale_revision');
    end if;
    select * into r from public.book_revisions where id = p_revision;
  end if;
  return jsonb_build_object('revision_id', r.id,
    'all', public._owns_book(v_user, p_book) or (select author_id from public.books where id = p_book) = v_user,
    'chapter_uids', (select coalesce(jsonb_agg(x.chapter_uid order by x.ord), '[]')
                     from public._chapter_access(v_user, p_book, r.id) x where x.access in ('open', 'unlocked')),
    'partial_uids', (select coalesce(jsonb_agg(x.chapter_uid order by x.ord), '[]')
                     from public._chapter_access(v_user, p_book, r.id) x where x.access = 'partial'));
end $$;

-- Service role (Worker): register or refresh a device. Returns the device id.
create function public.worker_register_device(p_user uuid, p_name text, p_public_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.devices (user_id, name, public_key) values (p_user, left(btrim(p_name), 80), p_public_key)
  on conflict (user_id, public_key) do update set name = excluded.name, last_seen_at = now(), revoked_at = null
  returning id into v_id;
  return v_id;
end $$;

-- Service role (Worker): record a licence. At most 3 devices hold downloaded books per account
-- (default); a 4th raises device_limit.
create function public.worker_record_license(p_user uuid, p_device uuid, p_book uuid, p_revision uuid,
  p_valid_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.devices where id = p_device and user_id = p_user and revoked_at is null) then
    perform public._raise('bad_device');
  end if;
  perform pg_advisory_xact_lock(hashtext('license:' || p_user::text));
  if (select count(distinct device_id) from public.offline_licenses
      where user_id = p_user and device_id <> p_device and valid_until > now()) >= 3 then
    perform public._raise('device_limit');
  end if;
  insert into public.offline_licenses (user_id, device_id, book_id, revision_id, issued_at, valid_until)
  values (p_user, p_device, p_book, p_revision, now(), p_valid_until)
  on conflict (user_id, device_id, book_id) do update set revision_id = excluded.revision_id,
    issued_at = excluded.issued_at, valid_until = excluded.valid_until;
  update public.devices set last_seen_at = now() where id = p_device;
end $$;

-- Service role (Worker): the wrapped keys for K_free and the given chapters, and the revision's
-- files. Only called after entitled_chapters (with the reader's JWT) said which chapters.
create function public.worker_key_bundle(p_revision uuid, p_chapter_uids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'revision_id', r.id, 'book_id', r.book_id, 'artifact_prefix', r.artifact_prefix,
    'manifest_key', r.manifest_key,
    'keys', (select coalesce(jsonb_agg(jsonb_build_object('chapter_uid', k.chapter_uid,
                                         'wrapped_key', encode(k.wrapped_key, 'base64'))), '[]')
             from public.chapter_keys k
             where k.revision_id = r.id and k.revoked_at is null
               and (k.chapter_uid is null or k.chapter_uid = any (p_chapter_uids))),
    'chapters', (select coalesce(jsonb_agg(jsonb_build_object('chapter_uid', c.chapter_uid, 'ord', c.ord,
                                             'free_file', c.free_file, 'full_file', c.full_file) order by c.ord), '[]')
                 from public.chapters c where c.revision_id = r.id))
  from public.book_revisions r where r.id = p_revision
$$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.reading_sessions enable row level security;
alter table public.annotations enable row level security;
alter table public.passage_comments enable row level security;
alter table public.passage_comment_reactions enable row level security;
alter table public.devices enable row level security;
alter table public.offline_licenses enable row level security;

create policy reading_sessions_select on public.reading_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy annotations_select on public.annotations for select to authenticated
  using (user_id = (select auth.uid()));
create policy passage_comments_select on public.passage_comments for select to authenticated
  using ((status = 'visible' and public._passage_reached((select auth.uid()), book_id, para_id))
         or user_id = (select auth.uid())
         or (select public.is_staff_any(array['moderator', 'support', 'super_admin']::public.staff_role[])));
create policy passage_comment_reactions_select on public.passage_comment_reactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy devices_select on public.devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy offline_licenses_select on public.offline_licenses for select to authenticated
  using (user_id = (select auth.uid()));
-- chapter_keys: no policies (service role only, flow 12).

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on public.reading_sessions, public.annotations, public.passage_comments,
  public.passage_comment_reactions, public.devices, public.offline_licenses, public.passage_counts
  from anon, authenticated;
grant select on public.reading_sessions, public.annotations, public.passage_comments,
  public.passage_comment_reactions, public.devices, public.offline_licenses
  to authenticated;
-- Licences are the Worker's: only its definer functions write them.
revoke insert, update, delete, truncate on public.offline_licenses from service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        '_readable_revision', '_chapter_access', '_para_percent', '_para_readable', '_annotation_json',
        'get_reader_state', 'unlock_chapter', '_undo_chapter', 'undo_chapter_unlock', 'sync_reading_progress',
        'upsert_annotations', 'pull_annotations', '_passage_reached', 'get_passage_counts',
        '_passage_comment_json', 'get_passage_thread', 'post_passage_comment', 'react_passage_comment',
        'moderate_passage_comment', 'report_book_problem', 'log_reading_session', 'set_reader_setting',
        'entitled_chapters', 'worker_register_device', 'worker_record_license', 'worker_key_bundle')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- RLS helper used inside the passage_comments policy.
grant execute on function public._passage_reached(uuid, uuid, text) to authenticated;

-- Readers (own JWT).
grant execute on function
  public.get_reader_state(uuid),
  public.unlock_chapter(uuid, uuid, text, text),
  public.undo_chapter_unlock(bigint, text),
  public.sync_reading_progress(uuid, uuid, text, uuid, text, integer, numeric, uuid, text, timestamptz),
  public.upsert_annotations(jsonb),
  public.pull_annotations(uuid, timestamptz),
  public.get_passage_counts(uuid, uuid[]),
  public.get_passage_thread(uuid, text),
  public.post_passage_comment(uuid, text, text, text, integer),
  public.react_passage_comment(uuid, text, boolean),
  public.report_book_problem(uuid, uuid, uuid, text, text),
  public.log_reading_session(uuid, uuid, uuid, timestamptz, timestamptz, integer),
  public.set_reader_setting(text, jsonb),
  public.entitled_chapters(uuid, uuid)
  to authenticated;

-- Staff (own JWT; checks its own permission).
grant execute on function public.moderate_passage_comment(uuid, text, text) to authenticated;

-- The api Worker (service role).
grant execute on function
  public.worker_register_device(uuid, text, text),
  public.worker_record_license(uuid, uuid, uuid, uuid, timestamptz),
  public.worker_key_bundle(uuid, uuid[])
  to service_role;
