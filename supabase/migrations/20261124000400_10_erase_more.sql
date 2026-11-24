-- Flow 10 · spec check 10-1: erase_account left personal data behind after status "done". Rule 37
-- erases library, reading history, direct messages, push tokens and devices too. The original is
-- wrapped (renamed _erase_account_base) so its body stays in one place; this adds what it missed,
-- in the same transaction. Kept as before: ledger, payments, reviews and discussion comments (shown
-- as "Former reader"), reports, consent and policy records, and the audit entry.
alter function public.erase_account(uuid) rename to _erase_account_base;

create function public.erase_account(p_deletion uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select d.user_id from public.account_deletions d where d.id = p_deletion);
begin
  if not public._erase_account_base(p_deletion) then
    return false;
  end if;
  -- Library.
  delete from public.saved_books where user_id = uid;
  delete from public.library_hidden where user_id = uid;
  delete from public.offline_licenses where user_id = uid;
  delete from public.coming_soon_notify where user_id = uid;
  delete from public.book_requests where user_id = uid;
  -- Reading history.
  delete from public.room_member_progress where user_id = uid;
  delete from public.recommendation_cache where user_id = uid;
  delete from public.search_events where user_id = uid;
  -- Direct messages: what they sent, and their place in each conversation.
  delete from public.message_reactions r using public.messages m, public.groups g
  where r.message_id = m.id and m.group_id = g.id and g.kind = 'dm' and (m.sender_id = uid or r.user_id = uid);
  delete from public.messages m using public.groups g
  where m.group_id = g.id and g.kind = 'dm' and m.sender_id = uid;
  delete from public.group_members gm using public.groups g
  where gm.group_id = g.id and g.kind = 'dm' and gm.user_id = uid;
  -- Blocks, both ways.
  delete from public.blocks where blocker_id = uid or blocked_id = uid;
  delete from public.user_blocks where blocker_id = uid or blocked_id = uid;
  -- Devices, push and in-app notices.
  delete from public.devices where user_id = uid;
  delete from public.push_held where user_id = uid;
  delete from public.push_log where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.banner_dismissals where user_id = uid;
  delete from public.banner_modal_seen where user_id = uid;
  delete from public.group_mute_carry where user_id = uid;
  delete from public.room_code_attempts where user_id = uid;
  return true;
end $$;

revoke execute on function public._erase_account_base(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.erase_account(uuid) from public, anon, authenticated;
grant execute on function public.erase_account(uuid) to service_role;
