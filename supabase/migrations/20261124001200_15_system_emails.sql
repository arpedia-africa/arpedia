-- Flow 15 fix · welcome and receipt emails. The dispatcher (flow 15 notify) sends template emails
-- for notices on `user_notify`; nothing enqueued a welcome (reader finished onboarding) or a
-- receipt (web checkout paid). Google Play sends its own receipt, so only web payments get one.

-- ─── welcome: onboarding reaches `plans` or `done` for the first time ──────
create function public._welcome_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.onboarding_step_ord(old.onboarding_step) < public.onboarding_step_ord('plans')
     and public.onboarding_step_ord(new.onboarding_step) >= public.onboarding_step_ord('plans') then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'welcome', 'user_id', new.id));
  end if;
  return null;
end $$;
revoke all on function public._welcome_notice() from public, anon, authenticated;

create trigger profiles_welcome_notice
  after update of onboarding_step on public.profiles
  for each row execute function public._welcome_notice();

-- ─── receipt: a web transaction becomes `succeeded` ────────────────────────
create function public._receipt_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item text;
begin
  if new.store <> 'web' or new.status <> 'succeeded' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'succeeded' then return null; end if;
  if new.kind = 'plan' then
    select p.name || ' plan' into v_item from public.plans p where p.code = new.plan_code;
  else
    select t.credits || ' credits' into v_item from public.topup_products t where t.code = new.topup_code;
  end if;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'receipt', 'user_id', new.user_id,
    'transaction_id', new.id, 'amount_kobo', new.gross_kobo, 'item', coalesce(v_item, 'Arpedia'),
    'paid_at', now()));  -- when it succeeded, not when checkout began
  return null;
end $$;
revoke all on function public._receipt_notice() from public, anon, authenticated;

create trigger transactions_receipt_notice
  after insert or update of status on public.transactions
  for each row execute function public._receipt_notice();

-- ─── verify email (flow 01 rule 5: sent in the background, never blocks) ───
-- Email confirmation is off in Supabase Auth, so Auth sends nothing. A new email sign-up queues a
-- notice; the dispatcher asks for a one-time link token (skipped once the address is proven, e.g.
-- by Google) and the Worker's GET /v1/email-verify confirms it, setting profiles.email_verified_at.
-- Only the token's hash is stored. Staff invites (invited_at) confirm through their own link.
create table public.email_verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.email_verifications enable row level security;
-- No policies or client grants: only the service role (dispatcher, Worker) reads or writes it.
revoke all on public.email_verifications from public, anon, authenticated;

create function public._verify_email_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.invited_at is null then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'verify_email', 'user_id', new.id));
  end if;
  return null;
end $$;
revoke all on function public._verify_email_notice() from public, anon, authenticated;

create trigger on_auth_user_verify_email after insert on auth.users
  for each row execute function public._verify_email_notice();

-- A fresh token for the link (the last one stops working), or null when there is nothing to prove.
create function public.issue_email_verification(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select u.email into v_email from auth.users u join public.profiles p on p.id = u.id
  where u.id = p_user and p.email_verified_at is null and p.deleted_at is null;
  if v_email is null then return null; end if;
  insert into public.email_verifications (user_id, token_hash, email, expires_at)
  values (p_user, encode(extensions.digest(v_token, 'sha256'), 'hex'), lower(v_email), now() + interval '7 days')
  on conflict (user_id) do update set token_hash = excluded.token_hash, email = excluded.email,
    expires_at = excluded.expires_at, created_at = now();
  return v_token;
end $$;

-- 'verified', 'expired' (old, used or for an address the account no longer has) or 'invalid'.
create function public.confirm_email_verification(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.email_verifications;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return 'invalid'; end if;
  delete from public.email_verifications
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') returning * into v;
  if v.user_id is null then return 'invalid'; end if;
  if v.expires_at < now()
     or v.email is distinct from (select lower(u.email) from auth.users u where u.id = v.user_id) then
    return 'expired';
  end if;
  update public.profiles set email_verified_at = coalesce(email_verified_at, now()) where id = v.user_id;
  return 'verified';
end $$;

revoke all on function public.issue_email_verification(uuid) from public, anon, authenticated;
revoke all on function public.confirm_email_verification(text) from public, anon, authenticated;
grant execute on function public.issue_email_verification(uuid) to service_role;
grant execute on function public.confirm_email_verification(text) to service_role;

-- The verify template gains the link variable, and a first real wording (a new version; past
-- versions stay as they were).
update public.email_templates set variables = '{first_name,code,link}' where key = 'verify_email';
insert into public.email_template_versions (template_key, number, subject, preheader, body)
select 'verify_email', coalesce(max(number), 0) + 1, 'Confirm your email', 'One tap to confirm it''s you',
  'Hi {{first_name}},' || chr(10) || chr(10) ||
  'Please confirm this is your email address for Arpedia:' || chr(10) || '{{link}}' || chr(10) || chr(10) ||
  'The link works for 7 days. If you didn''t sign up, you can ignore this email.' || chr(10) || chr(10) ||
  'The Arpedia team'
from public.email_template_versions where template_key = 'verify_email';
