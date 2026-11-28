-- Flow 08 · spec check 08-6: comments and paid messages to authors now meet the flow 14 muted
-- words (sanctions came with 20261124000100_14_sanction_checks).
--   * A comment that matches a Hide or Hide-and-report word is stored auto-hidden ("This content is
--     under review" for the commenter and the post's author, nothing for others), with an
--     automatic report for moderators, and no notification goes out (rule 15). Blur and Warn have
--     no comment form, so those comments show.
--   * A paid message to an author that matches a Hide or Hide-and-report word, or, from a reader
--     under 18, any word in the Sexual content category (Minors rule), is refused with
--     rejected_by_rules before any credit is spent: nothing is charged and nothing is delivered.
-- The matcher mirrors matchMutedWords in packages/core/src/trust.ts (the moderate-text Worker):
-- same substitutions, whole words, letters may repeat more never less, phrases also match squashed.

-- Lower-case, strip accents, undo 0→o 1→i |→i 3→e 4→a @→a 5→s $→s 7→t +→t 8→b 9→g, and turn
-- everything that is not a letter into single spaces.
create function public._automod_norm(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))),
              '01|34@5$7+89', 'oiieaassttbg'),
    '[^a-z]+', ' ', 'g'))
$$;

-- A normalised word as a pattern where each run of a letter may repeat more but never less.
create function public._automod_pattern(p_needle text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  v_out text := '';
  v_n int := char_length(p_needle);
  i int := 1;
  k int;
  c text;
begin
  while i <= v_n loop
    c := substr(p_needle, i, 1);
    k := 1;
    while i + k <= v_n and substr(p_needle, i + k, 1) = c loop
      k := k + 1;
    end loop;
    v_out := v_out || case when c ~ '^[a-z]$' then c || '{' || k || ',}' else repeat(c, k) end;
    i := i + k;
  end loop;
  return v_out;
end $$;

-- The muted words a text matches on a surface (chat, dm, review, comment).
create function public._automod_hits(p_text text, p_surface text)
returns table (id uuid, category text, action text)
language sql stable security definer set search_path = '' as $$
  with b as (select ' ' || public._automod_norm(p_text) || ' ' as body)
  select w.id, w.category, w.action
  from public.automod_words w
  cross join b
  cross join lateral (select public._automod_norm(w.text) as needle) n
  where n.needle <> ''
    and (w.scope = 'everywhere'
         or (w.scope = 'chat_dms' and p_surface in ('chat', 'dm'))
         or (w.scope = 'reviews' and p_surface = 'review'))
    and (b.body ~ (' ' || public._automod_pattern(n.needle) || ' ')
         or (w.is_phrase and replace(b.body, ' ', '') ~ public._automod_pattern(replace(n.needle, ' ', ''))))
$$;

-- ─── Comments (rule 15) ─────────────────────────────────────────────────────
-- Same as flow 08's add_comment (wrapped by the sanction check), plus the muted-word hold.
create or replace function public._add_comment_base(p_post uuid, p_parent uuid, p_body text, p_client_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_body text := btrim(coalesce(p_body, ''));
  a public.author_posts;
  par public.post_comments;
  c public.post_comments;
  v_hits uuid[];
  v_hide boolean;
  v_reason public.report_reason;
begin
  if p_client_id is null then
    perform public._raise('bad_client_id');
  end if;
  select * into c from public.post_comments where user_id = v_user and client_id = p_client_id;
  if c.id is not null then
    return public._comment_row(c, v_user, (select author_id from public.author_posts where id = c.post_id))
           || jsonb_build_object('replayed', true);
  end if;
  if char_length(v_body) not between 1 and 1000 then
    perform public._raise('bad_body');
  end if;
  select * into a from public.author_posts where id = p_post and state = 'published';
  if a.id is null or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  if public.has_blocked(a.author_id, v_user) then
    perform public._raise('blocked');
  end if;
  if p_parent is not null then
    select * into par from public.post_comments where id = p_parent and post_id = p_post;
    if par.id is null or par.state in ('removed', 'deleted') then
      perform public._raise('not_found');
    end if;
    -- A reply to a reply attaches to the top-level comment, which must still be showing.
    if par.parent_id is not null and exists (select 1 from public.post_comments t
        where t.id = par.parent_id and t.state = 'removed') then
      perform public._raise('not_found');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('comment:' || v_user::text));
  if (select count(*) from public.post_comments
      where user_id = v_user and created_at > now() - interval '1 minute') >= 5 then
    perform public._raise('rate_limited');
  end if;
  if (select count(*) from public.post_comments
      where user_id = v_user and created_at > now() - interval '5 minutes' and lower(body) = lower(v_body)) >= 2 then
    perform public._raise('rejected_by_rules', '{"rule": "repeated"}');
  end if;
  if public._is_new_account(v_user) and public._has_link_or_phone(v_body) then
    perform public._raise('rejected_by_rules', '{"rule": "links_new_account"}');
  end if;

  select array_agg(h.id), coalesce(bool_or(h.action in ('hide', 'hide_and_report')), false),
         (array_agg(case when h.category = any (enum_range(null::public.report_reason)::text[])
                         then h.category::public.report_reason end)
            filter (where h.action in ('hide', 'hide_and_report')))[1]
    into v_hits, v_hide, v_reason
  from public._automod_hits(v_body, 'comment') h;
  if v_hits is not null then
    perform public.record_automod_hits(v_hits);
  end if;

  insert into public.post_comments (post_id, user_id, parent_id, client_id, body, state, state_changed_at)
  values (p_post, v_user, coalesce(par.parent_id, par.id), p_client_id, v_body,
          case when v_hide then 'auto_hidden' else 'visible' end::public.comment_state,
          case when v_hide then now() end)
  returning * into c;

  if v_hide then
    -- Held for moderators with an automatic report (as chat does); nobody is notified.
    insert into public.reports (reporter_id, content_type, content_id, reported_user_id, reason, details,
                                severity, status, due_at, snapshot)
    values (null, 'post_comment', c.id, v_user, coalesce(v_reason, 'other'),
            'Hidden automatically by a safety rule', 'low', 'auto_hidden', now() + interval '3 days',
            jsonb_build_object('body', v_body, 'sender_name', public.sender_name(v_user), 'post_id', p_post));
    return public._comment_row(c, v_user, a.author_id) || jsonb_build_object('replayed', false);
  end if;

  if a.author_id <> v_user then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'post_comment', 'user_id', a.author_id,
      'from_user_id', v_user, 'post_id', p_post, 'comment_id', c.id));
  end if;
  if par.id is not null and par.user_id is not null and par.user_id <> v_user and par.user_id <> a.author_id then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'comment_reply', 'user_id', par.user_id,
      'from_user_id', v_user, 'post_id', p_post, 'comment_id', c.id));
  end if;
  return public._comment_row(c, v_user, a.author_id) || jsonb_build_object('replayed', false);
end $$;

-- ─── Paid messages to authors (Server, Minors) ──────────────────────────────
create or replace function public.send_author_message(p_author uuid, p_client_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_minor boolean := public.is_minor(auth.uid());
  v_hits uuid[];
  v_refuse boolean;
begin
  perform public._require_no_sanction(v_user);
  -- A replay returns the stored message as before (rules added later don't undo a paid send).
  if p_client_id is not null and not exists (select 1 from public.messages m
                                             where m.sender_id = v_user and m.client_id = p_client_id) then
    select array_agg(h.id),
           coalesce(bool_or(h.action in ('hide', 'hide_and_report') or (v_minor and h.category = 'sexual')), false)
      into v_hits, v_refuse
    from public._automod_hits(btrim(coalesce(p_body, '')), 'dm') h;
    if v_refuse then
      -- Raising rolls back the transaction, so the hits are not recorded for refused sends.
      perform public._raise('rejected_by_rules', '{"rule": "muted_word"}');
    end if;
    if v_hits is not null then
      perform public.record_automod_hits(v_hits);
    end if;
  end if;
  return public._send_author_message_base(p_author, p_client_id, p_body);
end $$;

-- ─── get_post_comments: the page cursor ─────────────────────────────────────
-- The flow 08 body read its `top` CTE again in later statements ("relation top does not exist"),
-- so every call failed and no post's comments loaded. Same result, one row set per step.
create or replace function public.get_post_comments(p_post uuid, p_after timestamptz default null,
                                                    p_after_id uuid default null, p_limit int default 20)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  a public.author_posts;
  v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_ids uuid[];
  v_rows jsonb;
  v_next jsonb;
begin
  select * into a from public.author_posts where id = p_post;
  if a.id is null or (a.state <> 'published' and a.author_id <> v_user)
     or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  -- One more than a page, to know whether there is more.
  select array_agg(t.id order by t.created_at, t.id) into v_ids
  from (select c.id, c.created_at from public.post_comments c
        where c.post_id = p_post and c.parent_id is null
          and (p_after is null or (c.created_at, c.id) > (p_after, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
        order by c.created_at, c.id
        limit v_lim + 1) t;
  v_ids := coalesce(v_ids, '{}');

  with page as (
    select c.* from public.post_comments c where c.id = any (v_ids[1:v_lim])
  ), shaped as (
    select t.created_at, t.id,
           public._comment_row(t, v_user, a.author_id) as row,
           coalesce((select jsonb_agg(r.j order by r.created_at, r.id) from (
             select x.created_at, x.id, public._comment_row(x, v_user, a.author_id) as j
             from public.post_comments x where x.parent_id = t.id and x.state <> 'deleted') r
             where r.j is not null), '[]'::jsonb) as replies
    from page t
  )
  select coalesce(jsonb_agg(s.row || jsonb_build_object('replies', s.replies) order by s.created_at, s.id), '[]'::jsonb)
    into v_rows
  from shaped s
  where s.row is not null and (s.row ->> 'state' <> 'deleted' or jsonb_array_length(s.replies) > 0);

  -- The cursor is the last row of the raw page, so rows hidden from this viewer never stall paging.
  select jsonb_build_object('at', c.created_at, 'id', c.id) into v_next
  from public.post_comments c
  where c.id = v_ids[least(cardinality(v_ids), v_lim)];
  return jsonb_build_object('comments', v_rows, 'has_more', cardinality(v_ids) > v_lim, 'total', a.comment_count,
    'next', v_next);
end $$;

revoke execute on function public._automod_norm(text), public._automod_pattern(text),
  public._automod_hits(text, text), public._add_comment_base(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.send_author_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_author_message(uuid, uuid, text) to authenticated;
