-- Flow 07 · spec check 07-2: "Anyone" rooms were created with groups.visibility = 'public', so a
-- non-member could read the last messages through flow 06's get_messages (no spoiler stamps) and
-- open a read-only preview socket on the room's Durable Object (get_group_access 'preview').
-- Who may join a room is reading_rooms.join_policy (join_open_room, list_open_rooms); visibility
-- only ever opened flow 06's public-group reads. Every room is now private: members only.
create function public._room_always_private() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'room' then
    new.visibility := 'private';
  end if;
  return new;
end $$;

create trigger groups_room_private before insert or update of visibility, kind on public.groups
for each row execute function public._room_always_private();

update public.groups set visibility = 'private' where kind = 'room' and visibility <> 'private';

revoke execute on function public._room_always_private() from public, anon, authenticated;
