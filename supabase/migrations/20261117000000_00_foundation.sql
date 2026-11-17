-- Flow 00 · Foundation: shared core tables, helpers and RLS.
-- Later flows add their own tables and columns in their own migrations; never edit this file.

create extension if not exists pgcrypto with schema extensions;

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.staff_role as enum (
  'super_admin', 'operations_admin', 'publisher', 'moderator', 'finance', 'support', 'analyst'
);
create type public.app_theme as enum ('sunflower', 'palm', 'plum', 'night');
create type public.ledger_reason as enum (
  'plan_grant', 'rollover', 'top_up', 'unlock_all', 'chapter', 'undo', 'tip', 'message',
  'expiry', 'refund', 'staff_adjust', 'gift_out', 'gift_in', 'promo'
);
create type public.ledger_bucket as enum ('plan', 'rollover', 'topup', 'promo');
create type public.book_status as enum ('draft', 'live', 'scheduled', 'unpublished', 'taken_down', 'rejected');
create type public.revision_status as enum (
  'draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'sent_back',
  'scheduled', 'live', 'superseded', 'unpublished', 'taken_down', 'rejected'
);
create type public.chapter_kind as enum ('chapter', 'part');
create type public.entitlement_scope as enum ('book', 'chapter');
create type public.entitlement_source as enum ('unlock_all', 'chapter', 'chapter_complete', 'gift', 'staff');

-- ─── Shared trigger functions ───────────────────────────────────────────────
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.reject_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;

-- ─── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  full_name text not null default '',
  avatar_url text,
  bio text,
  is_reader boolean not null default true,
  is_author boolean not null default false,
  theme public.app_theme not null default 'sunflower',
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── staff_roles ────────────────────────────────────────────────────────────
-- One role per person (flow 16 rule 10). Written only by staff RPCs (flow 16) and the seed.
create table public.staff_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.staff_role not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_roles_updated_at before update on public.staff_roles
  for each row execute function public.set_updated_at();

-- True when the caller is active staff and holds `p_role` (Super admin holds every role).
-- With no argument: true for any active staff.
create function public.is_staff(p_role public.staff_role default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles s
    where s.user_id = auth.uid() and s.active
      and (p_role is null or s.role = p_role or s.role = 'super_admin')
  )
$$;

-- True when the caller is active staff holding any of `p_roles` (Super admin always passes).
create function public.is_staff_any(p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles s
    where s.user_id = auth.uid() and s.active
      and (s.role = any (p_roles) or s.role = 'super_admin')
  )
$$;

-- ─── audit_log ──────────────────────────────────────────────────────────────
-- Every staff action. Written only through write_audit(); nobody can update or delete.
-- actor_id has no foreign key: rows outlive the actor's profile (actor_name keeps who it was),
-- and an ON DELETE action would be an UPDATE that the no-update trigger rejects.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_role public.staff_role,
  area text not null,
  action text not null,
  object_type text,
  object_id text,
  object_label text,
  summary text,
  before jsonb,
  after jsonb,
  reason text,
  request_id text,
  ip inet,
  device text,
  mfa_verified_at timestamptz,
  retain_until timestamptz not null default (now() + interval '7 years')
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index audit_log_object_idx on public.audit_log (object_type, object_id);
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.reject_change();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.reject_change();

-- Record a staff action. Staff callers are recorded by name and role; the service role
-- (Workers acting for the system) is recorded with no actor.
create function public.write_audit(
  p_area text,
  p_action text,
  p_object_type text default null,
  p_object_id text default null,
  p_object_label text default null,
  p_summary text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'write_audit: not allowed' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.is_staff() then
    raise exception 'write_audit: staff only' using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (actor_id, actor_name, actor_role, area, action, object_type, object_id,
                                object_label, summary, before, after, reason)
  select v_uid, p.full_name, s.role, p_area, p_action, p_object_type, p_object_id,
         p_object_label, p_summary, p_before, p_after, p_reason
  from (select 1) one
  left join public.profiles p on p.id = v_uid
  left join public.staff_roles s on s.user_id = v_uid
  returning id into v_id;
  return v_id;
end $$;

-- ─── books, book_revisions, chapters ────────────────────────────────────────
create table public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  title text not null,
  subtitle text,
  genres text[] not null default '{}',
  description text,
  current_revision_id uuid,
  status public.book_status not null default 'draft',
  new_arrival_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index books_author_idx on public.books (author_id);
create index books_status_idx on public.books (status);
create trigger books_updated_at before update on public.books
  for each row execute function public.set_updated_at();

create table public.book_revisions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  status public.revision_status not null default 'draft',
  words integer check (words >= 0),
  pages integer check (pages >= 0),
  price_credits integer check (price_credits > 0),
  preview_percent numeric(4, 1) check (preview_percent between 0 and 25),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (book_id, revision_no)
);
create trigger book_revisions_updated_at before update on public.book_revisions
  for each row execute function public.set_updated_at();

alter table public.books
  add constraint books_current_revision_fk foreign key (current_revision_id)
  references public.book_revisions (id) on delete set null;

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  chapter_uid uuid not null default gen_random_uuid(),
  ord integer not null check (ord >= 0),
  kind public.chapter_kind not null default 'chapter',
  parent_ord integer,
  title text not null,
  words integer not null default 0 check (words >= 0),
  words_before integer not null default 0 check (words_before >= 0),
  pages numeric(7, 2) not null default 0 check (pages >= 0),
  price_credits integer not null default 0 check (price_credits >= 0),
  free_file text,
  full_file text,
  unique (revision_id, ord),
  unique (revision_id, chapter_uid)
);
create index chapters_uid_idx on public.chapters (chapter_uid);

-- ─── credit_ledger ──────────────────────────────────────────────────────────
-- Append-only. Every credit movement is one row, written only inside SECURITY DEFINER
-- functions (flows 03, 09). Balances are derived, never edited.
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id),
  delta integer not null check (delta <> 0),
  reason public.ledger_reason not null,
  bucket public.ledger_bucket not null,
  expires_at timestamptz,
  txn_id uuid not null default gen_random_uuid(),
  ref_type text,
  ref_id text,
  idempotency_key text,
  book_id uuid references public.books (id),
  chapter_id uuid references public.chapters (id),
  author_id uuid references public.profiles (id),
  author_earning_kobo integer not null default 0,
  actor_id uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create unique index credit_ledger_idem_idx on public.credit_ledger (idempotency_key)
  where idempotency_key is not null;
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_book_idx on public.credit_ledger (book_id) where book_id is not null;
create index credit_ledger_txn_idx on public.credit_ledger (txn_id);
create trigger credit_ledger_no_update before update or delete on public.credit_ledger
  for each row execute function public.reject_change();
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function public.reject_change();

-- A user's credit balance, summed from the ledger. Readers may ask only for themselves;
-- Finance and Support may ask for anyone; the service role may ask for anyone.
create function public.credit_balance(p_user uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user
     and not public.is_staff_any(array['finance', 'support']::public.staff_role[]) then
    raise exception 'credit_balance: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select sum(delta) from public.credit_ledger where user_id = p_user), 0)::integer;
end $$;

-- ─── entitlements ───────────────────────────────────────────────────────────
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  book_id uuid not null references public.books (id),
  scope public.entitlement_scope not null,
  chapter_uid uuid,
  source public.entitlement_source not null,
  ledger_id bigint references public.credit_ledger (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  check ((scope = 'book') = (chapter_uid is null))
);
create unique index entitlements_book_active_idx on public.entitlements (user_id, book_id)
  where scope = 'book' and revoked_at is null;
create unique index entitlements_chapter_active_idx on public.entitlements (user_id, book_id, chapter_uid)
  where scope = 'chapter' and revoked_at is null;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.books enable row level security;
alter table public.book_revisions enable row level security;
alter table public.chapters enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.entitlements enable row level security;

-- profiles: own row, plus staff. Public fields for other readers come through a view (flow 01).
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- staff_roles: own row; Super admin sees everyone.
create policy staff_roles_select on public.staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff('super_admin')));

-- audit_log: Analyst and Operations admin see all, Finance only money (flow 16 rule 23).
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    (select public.is_staff_any(array['analyst', 'operations_admin']::public.staff_role[]))
    or (area = 'money' and (select public.is_staff('finance')))
  );

-- books: live books for every signed-in reader; authors their own; staff all.
create policy books_select on public.books for select to authenticated
  using (status = 'live' or author_id = (select auth.uid()) or (select public.is_staff()));

-- revisions: the current revision of a live book; the author's own; staff all.
create policy book_revisions_select on public.book_revisions for select to authenticated
  using (
    exists (
      select 1 from public.books b
      where b.id = book_id
        and ((b.status = 'live' and b.current_revision_id = book_revisions.id)
             or b.author_id = (select auth.uid()))
    )
    or (select public.is_staff())
  );

-- chapters follow their revision.
create policy chapters_select on public.chapters for select to authenticated
  using (exists (select 1 from public.book_revisions r where r.id = revision_id));

-- ledger and entitlements: own rows; Finance and Support read all.
create policy credit_ledger_select on public.credit_ledger for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_staff_any(array['finance', 'support']::public.staff_role[]))
  );
create policy entitlements_select on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Supabase grants everything to anon/authenticated/service_role by default. Narrow it:
-- clients only read (RLS decides which rows); money, entitlement and audit rows are written
-- only by SECURITY DEFINER functions owned by postgres.
revoke all on public.profiles, public.staff_roles, public.audit_log, public.books,
  public.book_revisions, public.chapters, public.credit_ledger, public.entitlements
  from anon, authenticated;

grant select on public.profiles, public.staff_roles, public.audit_log, public.books,
  public.book_revisions, public.chapters, public.credit_ledger, public.entitlements
  to authenticated;
-- Readers edit their own display fields only; role flags are set by RPCs.
grant update (full_name, avatar_url, bio, theme, interests) on public.profiles to authenticated;

-- The service role (Workers) bypasses RLS but still cannot rewrite money or the audit trail.
revoke insert, update, delete, truncate on public.credit_ledger, public.entitlements, public.audit_log
  from service_role;

revoke execute on function public.is_staff(public.staff_role), public.is_staff_any(public.staff_role[]),
  public.write_audit(text, text, text, text, text, text, jsonb, jsonb, text),
  public.credit_balance(uuid), public.set_updated_at(), public.reject_change()
  from public, anon;
grant execute on function public.is_staff(public.staff_role), public.is_staff_any(public.staff_role[]),
  public.write_audit(text, text, text, text, text, text, jsonb, jsonb, text),
  public.credit_balance(uuid)
  to authenticated, service_role;
