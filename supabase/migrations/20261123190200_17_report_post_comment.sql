-- Flow 17 · readers can report a comment on an author's post (flow 08 comments through flow 14's
-- create_report). Adds the post_comment case to _report_target (the snapshot staff see) and to
-- _set_content_state (so the auto-hide, restore and remove actions reach the comment).

create or replace function public._report_target(p_type public.report_content_type, p_id uuid, p_viewer uuid)
returns table (reported_user uuid, group_id uuid, book_id uuid, snapshot jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  x public.messages;
  g public.groups;
  b public.books;
  p public.profiles;
  pc public.post_comments;
  ap public.author_posts;
begin
  if p_type in ('message', 'dm') then
    select * into x from public.messages where id = p_id;
    if x.id is null or x.state <> 'visible' or not public.is_group_member(x.group_id, p_viewer) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    select * into g from public.groups where id = x.group_id;
    if (g.kind = 'dm') <> (p_type = 'dm') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select x.sender_id, x.group_id, null::uuid, jsonb_build_object(
      'body', x.body, 'quote', x.quote, 'sender_id', x.sender_id, 'sender_name', public.sender_name(x.sender_id),
      'group_name', g.name, 'group_kind', g.kind, 'created_at', x.created_at,
      -- Chat: 5 messages either side. DM: the last 50 messages of the thread (rule 6).
      'context', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'sender_id', c.sender_id,
                    'sender_name', public.sender_name(c.sender_id), 'body', c.body, 'created_at', c.created_at)
                    order by c.created_at, c.id), '[]'::jsonb)
                  from (
                    (select * from public.messages m where m.group_id = x.group_id and m.state = 'visible'
                       and g.kind <> 'dm' and (m.created_at, m.id) < (x.created_at, x.id)
                     order by m.created_at desc, m.id desc limit 5)
                    union all
                    (select * from public.messages m where m.group_id = x.group_id and m.state = 'visible'
                       and g.kind <> 'dm' and (m.created_at, m.id) > (x.created_at, x.id)
                     order by m.created_at, m.id limit 5)
                    union all
                    (select * from public.messages m where m.group_id = x.group_id and m.state <> 'deleted'
                       and g.kind = 'dm'
                     order by m.created_at desc, m.id desc limit 50)
                  ) c));
  elsif p_type = 'book' then
    select * into b from public.books where id = p_id;
    if b.id is null or (b.status <> 'live' and b.author_id <> p_viewer) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select b.author_id, null::uuid, b.id, jsonb_build_object(
      'title', b.title, 'author_name', public.sender_name(b.author_id), 'status', b.status,
      'revision_id', b.current_revision_id);
  elsif p_type = 'profile' then
    select * into p from public.profiles where id = p_id and deleted_at is null;
    if p.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select p.id, null::uuid, null::uuid, jsonb_build_object(
      'full_name', p.full_name, 'username', p.username, 'bio', p.bio, 'avatar_url', p.avatar_url);
  elsif p_type = 'post_comment' then
    -- As the reporter sees it: a visible comment on a published post, neither side blocked.
    select * into pc from public.post_comments where id = p_id;
    if pc.id is null or pc.state <> 'visible' then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    select * into ap from public.author_posts where id = pc.post_id;
    if ap.id is null or ap.state <> 'published' or public.has_blocked(p_viewer, ap.author_id)
       or (pc.user_id is not null and pc.user_id <> p_viewer and public.has_blocked(p_viewer, pc.user_id)) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select pc.user_id, null::uuid, null::uuid, jsonb_build_object(
      'body', pc.body, 'commenter_id', pc.user_id, 'commenter_name', public.sender_name(pc.user_id),
      'post_id', ap.id, 'post_title', ap.title, 'post_author_id', ap.author_id,
      'post_author_name', public.sender_name(ap.author_id), 'parent_id', pc.parent_id,
      'created_at', pc.created_at);
  else
    raise exception 'unsupported_content' using errcode = '0A000';
  end if;
end $$;

create or replace function public._set_content_state(p_type public.report_content_type, p_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_type in ('message', 'dm') then
    update public.messages set
      state = case p_state when 'hidden' then 'auto_hidden' when 'visible' then 'visible' else 'removed' end::public.message_state,
      state_changed_at = now()
    where id = p_id and state <> 'deleted'
      and not (p_state = 'hidden' and state = 'removed');
    if p_state = 'removed' then
      insert into public.message_retained (message_id, body)
      select id, body from public.messages where id = p_id and body is not null
      on conflict (message_id) do nothing;
    end if;
  elsif p_type = 'post_comment' then
    update public.post_comments set
      state = case p_state when 'hidden' then 'auto_hidden' when 'visible' then 'visible' else 'removed' end::public.comment_state,
      state_changed_at = now()
    where id = p_id and state <> 'deleted'
      and not (p_state = 'hidden' and state = 'removed');
  end if;
end $$;
