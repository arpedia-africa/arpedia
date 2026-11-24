-- Spec check 16-15 · a staff reset link works for 30 minutes (flow 16 rule 7). Supabase's link life
-- (`otp_expiry`) is one setting for the whole project and readers' links live 60 minutes (flow 01
-- rule 11), so the console checks the age itself when the link lands: GoTrue stamps
-- auth.users.recovery_sent_at when it sends the email.
create function public.staff_reset_link_fresh() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.recovery_sent_at > now() - interval '30 minutes'
                   from auth.users u where u.id = auth.uid()), false)
$$;
revoke all on function public.staff_reset_link_fresh() from public, anon;
grant execute on function public.staff_reset_link_fresh() to authenticated;
