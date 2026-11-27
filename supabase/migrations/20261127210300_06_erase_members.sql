-- Flow 06 · spec check 06-21 (States: deleted accounts): an erased account kept its club, channel
-- and reading room memberships, so it still counted toward member_count and was listed among the
-- members as "Former reader". Erasure now also leaves every group the person doesn't own (direct
-- messages were already handled in 20261124000400). Their club messages stay, anonymised by the
-- profile scrub ("Former reader"), as flow 06 says. An owner's row stays so the group keeps its
-- owner. Wrapped like 20261124000400, in the same transaction.
alter function public.erase_account(uuid) rename to _erase_account_v2;

create function public.erase_account(p_deletion uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select d.user_id from public.account_deletions d where d.id = p_deletion);
begin
  if not public._erase_account_v2(p_deletion) then
    return false;
  end if;
  -- member_count follows through the group_members_count trigger.
  delete from public.group_members gm using public.groups g
  where gm.group_id = g.id and gm.user_id = uid and gm.role <> 'owner'
    and g.owner_id is distinct from uid;
  return true;
end $$;

revoke execute on function public._erase_account_v2(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.erase_account(uuid) from public, anon, authenticated;
grant execute on function public.erase_account(uuid) to service_role;
