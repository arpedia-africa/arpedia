-- Flow 14 · spec check 14-3: a ban needs a Moderator and a Super admin (rule 17), but the console
-- never listed or confirmed pending bans, so every ban stayed pending. The console now shows them
-- on Home ("Your tasks") and on the report; this adds the report each ban came from, and leaves
-- out bans the viewer decided themselves (they can't confirm their own).
drop function public.admin_pending_bans();

create function public.admin_pending_bans()
returns table (action_id uuid, report_id uuid, user_id uuid, user_name text, decided_by_name text, reason text,
               created_at timestamptz, is_minor boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.report_id, a.target_user_id, public.sender_name(a.target_user_id), public._staff_name(a.decided_by),
         a.reason, a.created_at, public.is_minor(a.target_user_id)
  from public.moderation_actions a
  where a.action = 'ban' and a.confirmed_by is null and a.undone_at is null
    and public.staff_mfa_ok() and public.is_staff('super_admin') and a.decided_by is distinct from auth.uid()
  order by a.created_at
$$;

revoke execute on function public.admin_pending_bans() from public, anon;
grant execute on function public.admin_pending_bans() to authenticated;
