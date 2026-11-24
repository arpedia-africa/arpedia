-- Flow 01 · spec check 01-2: account takeover through Google auto-linking. Email confirmation is off
-- (rule 5: verification never blocks), so Supabase links a Google sign-in to an existing email
-- account with the same address even when nobody proved they own it. Someone could sign up with a
-- victim's email and their own password, wait for the victim to use Google, and keep access.
--
-- profiles.email_verified_at records proof of the address: a Google sign-in that vouches for it, a
-- finished password reset, later the verification mail. When Google links onto an email-password
-- account that was never verified, the password set by whoever created it is cleared and every
-- earlier session ends (access tokens already issued last until they expire, up to an hour). The
-- Google user keeps the account and can set a password again with Forgot password.
alter table public.profiles add column email_verified_at timestamptz;

update public.profiles p set email_verified_at = coalesce(i.created_at, now())
from auth.identities i where i.user_id = p.id and i.provider = 'google' and p.email_verified_at is null;

create function public._google_link_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.provider <> 'google' then
    return new;
  end if;
  if exists (select 1 from auth.identities i where i.user_id = new.user_id and i.provider = 'email' and i.id <> new.id)
     and (select p.email_verified_at from public.profiles p where p.id = new.user_id) is null then
    update auth.users set encrypted_password = null where id = new.user_id;
    -- Sessions from before this sign-in (the new one may be written in the same request).
    delete from auth.sessions where user_id = new.user_id and created_at < now() - interval '5 seconds';
    -- Directly, not write_audit: Supabase Auth runs this with no JWT, which write_audit refuses.
    insert into public.audit_log (area, action, object_type, object_id, summary)
    values ('readers', 'google_link_password_cleared', 'user', new.user_id::text,
            'Google linked to an unverified email account: password cleared, earlier sessions ended');
  end if;
  -- Proof only when Google itself vouches for this account's address.
  if coalesce((new.identity_data ->> 'email_verified')::boolean, false)
     and lower(new.identity_data ->> 'email') = (select lower(u.email) from auth.users u where u.id = new.user_id) then
    update public.profiles set email_verified_at = coalesce(email_verified_at, now()) where id = new.user_id;
  end if;
  return new;
end $$;

-- A finished password reset also proves the inbox: the one-time recovery token was used.
create function public._recovery_proves_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.recovery_token, '') <> '' and coalesce(new.recovery_token, '') = '' then
    update public.profiles set email_verified_at = coalesce(email_verified_at, now()) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_recovery_used after update of recovery_token on auth.users
for each row execute function public._recovery_proves_email();
revoke execute on function public._recovery_proves_email() from public, anon, authenticated;

create trigger on_auth_identity_linked after insert on auth.identities
for each row execute function public._google_link_guard();

revoke execute on function public._google_link_guard() from public, anon, authenticated;
