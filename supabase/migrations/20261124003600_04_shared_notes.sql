-- Flow 04 spec-check fix 04-3 (server half): a note can be shared with one of the reader's clubs.
-- upsert_annotations accepted only private annotations (`club_not_ready`). Now a highlight or note
-- may carry visibility 'club' with shared_group_id, if the reader is a member of that group. The
-- quote card itself is posted through the chat Worker (flow 06 rule 19: can_quote, live delivery),
-- not by a Postgres share_quote, which would skip the Durable Object and never reach open chats.

create or replace function public.upsert_annotations(p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  i jsonb;
  r public.book_revisions;
  v_at timestamptz;
  v_out jsonb := '[]';
  v_row public.annotations;
  v_kind text;
  v_vis text;
  v_group uuid;
begin
  if jsonb_typeof(p_batch) <> 'array' or jsonb_array_length(p_batch) > 200 then
    perform public._raise('bad_batch');
  end if;
  for i in select * from jsonb_array_elements(p_batch) loop
    v_kind := i ->> 'kind';
    v_at := least(coalesce((i ->> 'updated_at')::timestamptz, now()), now());
    v_vis := coalesce(i ->> 'visibility', 'private');
    if v_vis not in ('private', 'club') then perform public._raise('bad_batch'); end if;
    -- A tombstone is stored private: nothing about a deleted note is shared.
    v_group := case when v_vis = 'club' and not coalesce((i ->> 'deleted')::boolean, false)
                    then (i ->> 'shared_group_id')::uuid end;
    -- Shared with a club: highlights and notes only, and only to a group the reader is in (not banned).
    if v_vis = 'club' and not coalesce((i ->> 'deleted')::boolean, false) and (
         v_kind = 'bookmark' or v_group is null or not public.is_group_member(v_group, v_user)) then
      perform public._raise('not_member');
    end if;
    if not coalesce((i ->> 'deleted')::boolean, false) then
      r := public._readable_revision(v_user, (i ->> 'book_id')::uuid);
      -- Highlights only exist in text the reader can open (rule 37).
      if v_kind <> 'bookmark' and (i ->> 'revision_id')::uuid = r.id
         and not public._para_readable(v_user, (i ->> 'book_id')::uuid, r.id, (i ->> 'chapter_uid')::uuid,
                                       i ->> 'end_para_id') then
        perform public._raise('beyond_gate');
      end if;
      if v_kind = 'bookmark' and not exists (
           select 1 from public.annotations where user_id = v_user and client_id = (i ->> 'client_id')::uuid)
         and (select count(*) from public.annotations where user_id = v_user and book_id = (i ->> 'book_id')::uuid
                and kind = 'bookmark' and deleted_at is null) >= 200 then
        perform public._raise('bookmark_limit');
      end if;
    end if;

    insert into public.annotations as a (client_id, user_id, book_id, revision_id, kind, color, cfi_range,
      chapter_uid, start_para_id, start_char, end_para_id, end_char, quote, note_text, visibility,
      shared_group_id, deleted_at, created_at, updated_at)
    values ((i ->> 'client_id')::uuid, v_user, (i ->> 'book_id')::uuid, (i ->> 'revision_id')::uuid, v_kind,
      case when v_kind = 'bookmark' then null else coalesce(i ->> 'color', 'yellow') end, i ->> 'cfi_range',
      (i ->> 'chapter_uid')::uuid, i ->> 'start_para_id', coalesce((i ->> 'start_char')::int, 0),
      i ->> 'end_para_id', coalesce((i ->> 'end_char')::int, 0), left(i ->> 'quote', 500),
      case when v_kind = 'note' then nullif(btrim(i ->> 'note_text'), '') end,
      case when v_group is null then 'private' else 'club' end, v_group,
      case when coalesce((i ->> 'deleted')::boolean, false) then v_at end, v_at, v_at)
    on conflict (user_id, client_id) do update set
      kind = excluded.kind, color = excluded.color, cfi_range = excluded.cfi_range,
      note_text = excluded.note_text, visibility = excluded.visibility, shared_group_id = excluded.shared_group_id,
      deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
    where a.updated_at < excluded.updated_at and a.book_id = excluded.book_id;

    select * into v_row from public.annotations where user_id = v_user and client_id = (i ->> 'client_id')::uuid;
    if v_row.book_id is distinct from (i ->> 'book_id')::uuid then
      perform public._raise('key_reused');
    end if;
    v_out := v_out || jsonb_build_array(public._annotation_json(v_row));
  end loop;
  return v_out;
end $$;
