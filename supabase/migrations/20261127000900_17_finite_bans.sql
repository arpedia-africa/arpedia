-- Flow 17 whole-app check (#72 row 13): a reader who deleted the account and tried to log in again saw
-- "Something went wrong" instead of "This account was deleted." GoTrue reads auth.users.banned_until
-- into a Go time and can't scan Postgres 'infinity', so every sign-in for that user (and any admin
-- user listing that meets the row) failed with a 500 before the ban was even checked.
-- Three writers set 'infinity': _start_deletion (app deletion), _sync_auth_ban (a ban with no end) and
-- the erasure. Rather than redefine each, a trigger stores a far, finite time instead, and existing
-- rows are fixed. 9999-12-31 is still "banned forever" for GoTrue (it only compares with now()).
create or replace function public._finite_banned_until() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.banned_until = 'infinity'::timestamptz then
    new.banned_until := '9999-12-31 23:59:59+00'::timestamptz;
  end if;
  return new;
end $$;

revoke all on function public._finite_banned_until() from public, anon, authenticated;

drop trigger if exists finite_banned_until on auth.users;
create trigger finite_banned_until before insert or update of banned_until on auth.users
  for each row execute function public._finite_banned_until();

update auth.users set banned_until = '9999-12-31 23:59:59+00' where banned_until = 'infinity';

-- With the ban readable, GoTrue answers user_banned for a banned email whatever the password, so the
-- sign-in Worker can't tell the reader "This account was deleted." from that alone (it would tell
-- anyone which emails were deleted). It asks this instead: 'deleted' only when the password is right
-- and the account's deletion is under way; null otherwise (the Worker then counts a wrong password).
-- Erased accounts have no email or password left, so they always get null. Service role only.
create or replace function public.banned_sign_in_reason(p_email text, p_password text) returns text
language sql stable security definer set search_path = '' as $$
  select 'deleted'
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
    and u.encrypted_password is not null
    and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
    and p.deleted_at is not null
  limit 1
$$;
revoke all on function public.banned_sign_in_reason(text, text) from public, anon, authenticated;
grant execute on function public.banned_sign_in_reason(text, text) to service_role;
