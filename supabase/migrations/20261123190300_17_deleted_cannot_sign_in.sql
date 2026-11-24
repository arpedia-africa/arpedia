-- Flow 17 whole-app check (account journey): after "Delete my account" the reader could sign straight
-- back in, to a full Home with her credits, until the erasure job ran (flow 10 rule 36: it can't be
-- undone from the app; Q3: no grace for app deletions). A deletion without a grace now blocks sign-in
-- at once (banned_until, as the erasure itself does); staff "delete after 30 days" keeps sign-in open
-- so the reader can restore within the grace. Otherwise unchanged from flow 10.
-- Start a deletion: hide the profile, end every session, drop push tokens and queue erasure.
create or replace function public._start_deletion(p_user uuid, p_via text, p_by uuid, p_reason text, p_erase_after timestamptz,
  p_grace_until timestamptz) returns public.account_deletions
language plpgsql security definer set search_path = '' as $$
declare
  res public.account_deletions;
begin
  if exists (select 1 from public.account_deletions where user_id = p_user and status in ('pending', 'erasing')) then
    raise exception 'already_deleting' using errcode = '22023';
  end if;
  if public._unpaid_earnings_kobo(p_user) > 0 then
    raise exception 'earnings_waiting' using errcode = '22023',
      hint = 'You have earnings waiting. We''ll delete your account after your next payout.';
  end if;
  update public.profiles set deleted_at = now(), deletion_requested_at = now() where id = p_user;
  update public.user_devices set revoked_at = coalesce(revoked_at, now()),
    revoked_by = coalesce(revoked_by, case when p_via = 'staff' then 'staff' else 'self' end),
    download_enabled = false, push_token = null
  where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
  if p_grace_until is null then
    update auth.users set banned_until = 'infinity' where id = p_user;
  end if;
  delete from public.account_deletions where user_id = p_user and status = 'blocked';
  insert into public.account_deletions (user_id, requested_via, requested_by, reason, erase_after, grace_until)
  values (p_user, p_via, p_by, p_reason, p_erase_after, p_grace_until)
  returning * into res;
  return res;
end $$;
