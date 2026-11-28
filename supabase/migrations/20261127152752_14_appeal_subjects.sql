-- Flow 14 · spec check 14-22 (rules 26, 28): a rejected author applicant can appeal, and overturning
-- an application or book rejection puts it back in the review queue (approval still goes through the
-- normal reviewer). Book-rejection appeals now record the original decider from audit_log, so the
-- publisher who rejected the book cannot decide the appeal.

create or replace function public.create_appeal(p_subject_type public.appeal_subject, p_subject_id uuid, p_text text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_at timestamptz;
  v_decider uuid;
  v_id uuid;
begin
  if uid is null then
    raise exception 'create_appeal: sign in' using errcode = 'insufficient_privilege';
  end if;
  if p_subject_type = 'sanction' then
    select s.created_at, a.decided_by into v_at, v_decider
    from public.user_sanctions s left join public.moderation_actions a on a.id = s.action_id
    where s.id = p_subject_id and s.user_id = uid and s.state in ('active', 'ended');
  elsif p_subject_type = 'content_removal' then
    select a.created_at, a.decided_by into v_at, v_decider from public.moderation_actions a
    where a.id = p_subject_id and a.target_user_id = uid and a.undone_at is null
      and a.action in ('remove', 'mark_spoiler', 'warn', 'mute', 'suspend', 'ban');
  elsif p_subject_type = 'book_rejection' then
    select rv.updated_at,
           (select l.actor_id from public.audit_log l
            where l.action = 'book.reject' and l.object_type = 'book_revision' and l.object_id = rv.id::text
            order by l.at desc limit 1)
      into v_at, v_decider
    from public.book_revisions rv join public.books b on b.id = rv.book_id
    where rv.id = p_subject_id and b.author_id = uid and rv.status = 'rejected';
  elsif p_subject_type = 'application' then
    -- A rejected author applicant (rule 26).
    select ap.decided_at, ap.decided_by into v_at, v_decider from public.author_applications ap
    where ap.id = p_subject_id and ap.user_id = uid and ap.status = 'rejected';
  else
    raise exception 'unsupported_subject' using errcode = '0A000';
  end if;
  if v_at is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_at < now() - interval '14 days' then
    raise exception 'appeal_window_closed' using errcode = '22023';
  end if;
  begin
    insert into public.appeals (user_id, subject_type, subject_id, original_decider, text)
    values (uid, p_subject_type, p_subject_id, v_decider, btrim(p_text)) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_appealed' using errcode = '23505';
  end;
  return v_id;
end $$;

create or replace function public.admin_list_appeals(p_status text default 'open')
returns table (id uuid, user_id uuid, user_name text, subject_type public.appeal_subject, subject_id uuid,
               summary text, original_decision text, original_decider_name text, created_at timestamptz,
               due_at timestamptz, late boolean, status public.appeal_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._trust_staff(array['moderator', 'operations_admin', 'publisher']::public.staff_role[]) then
    raise exception 'admin_list_appeals: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select a.id, a.user_id, public.sender_name(a.user_id), a.subject_type, a.subject_id, left(a.text, 160),
         coalesce((select coalesce(ma.action::text, '') || coalesce(' ' || ma.duration_days || ' days', '')
                   from public.user_sanctions s join public.moderation_actions ma on ma.id = s.action_id
                   where a.subject_type = 'sanction' and s.id = a.subject_id),
                  (select ma.action::text from public.moderation_actions ma
                   where a.subject_type = 'content_removal' and ma.id = a.subject_id),
                  case a.subject_type when 'book_rejection' then 'book rejected' when 'application' then 'application rejected' end),
         case when a.original_decider is not null then public._staff_name(a.original_decider) end,
         a.created_at, a.due_at, a.status in ('new', 'in_review') and a.due_at < now(), a.status
  from public.appeals a
  where case when p_status = 'decided' then a.status not in ('new', 'in_review') else a.status in ('new', 'in_review') end
  order by a.created_at;
end $$;

create or replace function public.decide_appeal(p_appeal uuid, p_outcome public.appeal_status, p_reduce_to_days int default null,
                                     p_reply text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['moderator', 'operations_admin', 'publisher']::public.staff_role[], 'decide_appeal');
  a public.appeals;
  v_action public.moderation_actions;
  s public.user_sanctions;
begin
  if p_outcome not in ('upheld', 'reduced', 'overturned') then
    raise exception 'bad_outcome' using errcode = '22023';
  end if;
  select * into a from public.appeals where id = p_appeal for update;
  if a.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.status not in ('new', 'in_review') then
    raise exception 'already_decided:%', public._staff_name(a.decided_by) using errcode = '40001';
  end if;
  if a.original_decider = v_me then
    raise exception 'original_decider' using errcode = 'insufficient_privilege';
  end if;
  select ma.* into v_action from public.moderation_actions ma
  where (a.subject_type = 'content_removal' and ma.id = a.subject_id)
     or (a.subject_type = 'sanction' and ma.id = (select x.action_id from public.user_sanctions x where x.id = a.subject_id));
  select * into s from public.user_sanctions x
  where (a.subject_type = 'sanction' and x.id = a.subject_id)
     or (a.subject_type = 'content_removal' and v_action.id is not null and x.action_id = v_action.id)
  order by x.created_at desc limit 1;

  if p_outcome = 'reduced' then
    if s.id is null or s.kind not in ('mute', 'suspend', 'ban') or coalesce(p_reduce_to_days, 0) < 1 then
      raise exception 'nothing_to_reduce' using errcode = '22023';
    end if;
    update public.user_sanctions set
      kind = case when kind = 'ban' then 'suspend' else kind end,
      ends_at = starts_at + make_interval(days => p_reduce_to_days),
      state = case when starts_at + make_interval(days => p_reduce_to_days) <= now() then 'ended' else state end
    where id = s.id;
    perform public._sync_auth_ban(s.user_id);
  elsif p_outcome = 'overturned' then
    if s.id is not null then
      update public.user_sanctions set state = 'overturned' where id = s.id;
      perform public._sync_auth_ban(s.user_id);
    end if;
    if v_action.id is not null then
      update public.moderation_actions set undone_at = now() where id = v_action.id;
      if v_action.content_ref ? 'type' then
        perform public._set_content_state((v_action.content_ref ->> 'type')::public.report_content_type,
          (v_action.content_ref ->> 'id')::uuid, 'visible');
        if v_action.content_ref ->> 'group_id' is not null then
          perform public._trust_notify('live', jsonb_build_object('group_id', v_action.content_ref ->> 'group_id',
            'message_id', v_action.content_ref ->> 'id', 'op', 'restore'));
        end if;
      end if;
    end if;
  end if;
  -- Overturning a rejection puts it back in front of a reviewer (rule 28: restores access). Approval
  -- itself stays with the Publisher / application reviewer, so the normal checks still run.
  if p_outcome = 'overturned' and a.subject_type = 'book_rejection' then
    if exists (select 1 from public.book_revisions o
               where o.book_id = (select r.book_id from public.book_revisions r where r.id = a.subject_id)
                 and o.id <> a.subject_id
                 and o.status in ('draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'scheduled')) then
      raise exception 'book_has_open_revision' using errcode = '23505';
    end if;
    update public.book_revisions set status = 'ready_for_review', status_reason = null, routed_at = now(),
      review_opened_at = null, assigned_to = null,
      due_at = now() + make_interval(days => public._threshold('review_days')::int)
    where id = a.subject_id and status = 'rejected';
    update public.books b set status = 'draft'
    from public.book_revisions r
    where r.id = a.subject_id and b.id = r.book_id and b.status = 'rejected' and b.current_revision_id is null;
  elsif p_outcome = 'overturned' and a.subject_type = 'application' then
    if exists (select 1 from public.author_applications o
               where o.user_id = a.user_id and o.id <> a.subject_id and o.status in ('draft', 'new', 'needs_info')) then
      raise exception 'application_open' using errcode = '23505';
    end if;
    update public.author_applications set status = 'new', decided_by = null, decided_at = null,
      decision_reason = null, reapply_after = null, assigned_to = null, sla_alerted_at = null
    where id = a.subject_id and status = 'rejected';
    perform public._app_event(a.subject_id, v_me, 'submitted', 'Reopened on appeal');
  end if;

  if s.id is not null then
    perform public._trust_notify('live', jsonb_build_object('user_id', s.user_id, 'op', 'refresh_user'));
  end if;

  update public.appeals set status = p_outcome, decided_by = v_me, decided_at = now(), decision_note = nullif(btrim(p_reply), ''),
    reduce_to_days = case when p_outcome = 'reduced' then p_reduce_to_days end
  where id = a.id;
  perform public._trust_notify('appeal_decided', jsonb_build_object('user_id', a.user_id, 'appeal_id', a.id,
    'outcome', p_outcome, 'message', p_reply, 'email', true));
  perform public.write_audit('trust', 'appeal.decide', 'appeal', a.id::text, public.sender_name(a.user_id),
    'Appeal ' || p_outcome::text, jsonb_build_object('status', a.status),
    jsonb_build_object('status', p_outcome, 'reduce_to_days', p_reduce_to_days), p_reply);
end $$;
