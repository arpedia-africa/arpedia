-- Flow 14 · spec check 14-4 and 08-2: create_report refused reviews, discussion comments, post
-- comments and author posts (unsupported_content), and _set_content_state only acted on messages,
-- so Remove, auto-hide and Mark as spoiler did nothing for them. Both now cover every content type
-- (the message, dm, book and profile branches are unchanged).

create or replace function public._report_target(p_type public.report_content_type, p_id uuid, p_viewer uuid)
returns table (reported_user uuid, group_id uuid, book_id uuid, snapshot jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  x public.messages;
  g public.groups;
  b public.books;
  p public.profiles;
  rv public.reviews;
  pc public.passage_comments;
  co public.post_comments;
  po public.author_posts;
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
  elsif p_type = 'review' then
    select * into rv from public.reviews where id = p_id and status = 'visible';
    if rv.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select rv.user_id, null::uuid, rv.book_id, jsonb_build_object(
      'body', rv.body, 'stars', rv.stars, 'spoiler', rv.spoiler, 'sender_id', rv.user_id,
      'sender_name', public.sender_name(rv.user_id), 'book_title', (select title from public.books where id = rv.book_id),
      'created_at', rv.created_at);
  elsif p_type = 'discussion_comment' then
    select * into pc from public.passage_comments where id = p_id and status = 'visible';
    if pc.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select pc.user_id, null::uuid, pc.book_id, jsonb_build_object(
      'body', pc.body, 'quote', pc.quote, 'sender_id', pc.user_id, 'sender_name', public.sender_name(pc.user_id),
      'book_title', (select title from public.books where id = pc.book_id), 'created_at', pc.created_at);
  elsif p_type = 'post_comment' then
    select * into co from public.post_comments where id = p_id and state = 'visible';
    select * into po from public.author_posts where id = co.post_id;
    if co.id is null or po.state <> 'published' then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select co.user_id, null::uuid, null::uuid, jsonb_build_object(
      'body', co.body, 'sender_id', co.user_id, 'sender_name', public.sender_name(co.user_id),
      'post_id', po.id, 'post_title', po.title, 'author_name', public.sender_name(po.author_id),
      'created_at', co.created_at);
  elsif p_type = 'author_post' then
    select * into po from public.author_posts where id = p_id and state = 'published';
    if po.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select po.author_id, null::uuid, null::uuid, jsonb_build_object(
      'title', po.title, 'body', po.body, 'sender_id', po.author_id, 'sender_name', public.sender_name(po.author_id),
      'created_at', po.published_at);
  else
    raise exception 'unsupported_content' using errcode = '0A000';
  end if;
end $$;

-- Hide (auto-hide), restore, remove or mark as spoiler. Spoiler keeps a review visible, blurred;
-- a discussion comment has no blur, so there it stays visible.
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
  elsif p_type = 'review' then
    update public.reviews set
      status = case when p_state in ('visible', 'spoiler') then 'visible' else 'hidden_by_mod' end,
      spoiler = spoiler or p_state = 'spoiler'
    where id = p_id;
  elsif p_type = 'discussion_comment' then
    update public.passage_comments set status = case when p_state in ('visible', 'spoiler') then 'visible' else 'removed' end
    where id = p_id;
  elsif p_type = 'post_comment' then
    update public.post_comments set
      state = case p_state when 'hidden' then 'auto_hidden' when 'visible' then 'visible' else 'removed' end::public.comment_state,
      state_changed_at = now()
    where id = p_id and state <> 'deleted'
      and not (p_state = 'hidden' and state = 'removed');
  elsif p_type = 'author_post' then
    -- Posts have no hidden state: auto-hide and remove both take the post down; keep republishes it
    -- only if staff had taken it down.
    update public.author_posts set state = case when p_state = 'visible' then 'published' else 'removed' end::public.post_state
    where id = p_id and state <> 'draft' and not (p_state = 'visible' and state = 'published');
  end if;
end $$;
