-- Flow 15 · Engage console additions: the Push notifications list reads delivered and opened per
-- push straight from push_log, the four KPIs (rule 14), Undo for Pause and Cancel, and
-- "Send test to my device". Never edit this file after merge.

-- campaigns list (rule 14): tab all | sent | scheduled | drafts.
create or replace function public.staff_list_campaigns(p_tab text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
  v_prev timestamptz := (date_trunc('month', now() at time zone 'Africa/Lagos') - interval '1 month') at time zone 'Africa/Lagos';
begin
  if not (public._can_draft_push() or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'stats', (select jsonb_build_object(
        'sent_month', (select count(*) from public.campaigns c where c.status = 'sent' and c.sent_at >= v_month),
        'delivered_pct', round(100.0 * count(*) filter (where l.created_at >= v_month and l.status in ('delivered', 'opened'))
          / nullif(count(*) filter (where l.created_at >= v_month and l.status in ('sent', 'delivered', 'opened')), 0), 1),
        'delivered_prev_pct', round(100.0 * count(*) filter (where l.created_at < v_month and l.status in ('delivered', 'opened'))
          / nullif(count(*) filter (where l.created_at < v_month and l.status in ('sent', 'delivered', 'opened')), 0), 1),
        'opened_pct', round(100.0 * count(*) filter (where l.created_at >= v_month and l.status = 'opened')
          / nullif(count(*) filter (where l.created_at >= v_month and l.status in ('delivered', 'opened')), 0), 1),
        'best', (select jsonb_build_object('key', t.key, 'label', t.label, 'pct', round(100.0 * b.opened / b.delivered)) from (
            select l2.type, count(*) filter (where l2.status = 'opened') opened,
                   count(*) filter (where l2.status in ('delivered', 'opened')) delivered
            from public.push_log l2 where l2.created_at >= v_month group by l2.type
            having count(*) filter (where l2.status in ('delivered', 'opened')) >= 5) b
          join public.push_types t on t.key = b.type
          order by b.opened::numeric / b.delivered desc limit 1))
      from public.push_log l where l.created_at >= v_prev),
    -- Readers whose phones have a token but every one is switched off (Android setting or FCM).
    'push_off', (select jsonb_build_object('readers', count(*) filter (where d.off),
        'pct', round(100.0 * count(*) filter (where d.off) / nullif(count(*), 0), 1))
      from (select bool_and(u.push_disabled_at is not null) off from public.user_devices u
            join public.profiles p on p.id = u.user_id and p.deleted_at is null and p.is_reader
            where u.push_token is not null and u.revoked_at is null group by u.user_id) d),
    'counts', (select jsonb_build_object(
        'all', count(*), 'sent', count(*) filter (where status = 'sent'),
        'scheduled', count(*) filter (where status in ('scheduled', 'paused', 'sending')),
        'drafts', count(*) filter (where status in ('draft', 'in_review')))
      from public.campaigns),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'body', c.body, 'audience', c.audience, 'open_target', c.open_target,
        'status', c.status, 'send_at', c.send_at, 'sent_at', c.sent_at, 'reach', c.reach,
        'is_service', c.is_service, 'created_by', (select p.full_name from public.profiles p where p.id = c.created_by),
        'reviewed', c.reviewed_by is not null, 'moved_from', c.moved_from, 'updated_at', c.updated_at,
        'sent', coalesce(s.sent, 0), 'delivered', coalesce(s.delivered, 0), 'opened', coalesce(s.opened, 0),
        'conversions', coalesce((c.counts ->> 'conversions')::int, 0), 'skipped_cap', coalesce(s.skipped_cap, 0))
        order by coalesce(c.sent_at, c.send_at, c.updated_at) desc)
      from public.campaigns c
      left join lateral (select count(*) filter (where l.status in ('sent', 'delivered', 'opened')) sent,
          count(*) filter (where l.status in ('delivered', 'opened')) delivered,
          count(*) filter (where l.status = 'opened') opened,
          count(*) filter (where l.status = 'skipped_cap') skipped_cap
        from public.push_log l where l.campaign_id = c.id) s on true
      where (c.status <> 'cancelled' or c.updated_at > now() - interval '30 days')
        and case p_tab when 'sent' then c.status = 'sent'
                       when 'scheduled' then c.status in ('scheduled', 'paused', 'sending')
                       when 'drafts' then c.status in ('draft', 'in_review')
                       else true end), '[]'::jsonb),
    'automatic', coalesce((select jsonb_agg(jsonb_build_object(
        'key', t.key, 'label', t.label, 'enabled', t.enabled, 'can_switch_off', t.can_switch_off,
        'title_template', t.title_template, 'body_template', t.body_template, 'switched_at', t.switched_at,
        'switched_by', (select p.full_name from public.profiles p where p.id = t.switched_by),
        'sent_30d', (select count(*) from public.push_log l where l.type = t.key
                     and l.status in ('sent', 'delivered', 'opened') and l.created_at > now() - interval '30 days'))
        order by t.category desc, t.key)
      from public.push_types t where t.automatic), '[]'::jsonb));
end $$;

-- Undo for Pause and Cancel (the list's toasts): back to scheduled while the time is still ahead.
create function public.staff_restore_campaign(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('send_push');
  update public.campaigns set status = 'scheduled'
  where id = p_id and status in ('paused', 'cancelled') and send_at > now();
  if not found then raise exception 'This push can''t go back on the schedule' using errcode = '22023'; end if;
  perform public.write_audit('engage', 'campaign.restore', 'campaign', p_id::text);
end $$;

-- "Send test to my device": the draft as a service push to the signed-in staff member only.
-- Returns false when they have no phone with push on.
create function public.staff_test_push(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
begin
  if not public._can_draft_push() then
    raise exception 'Not allowed: send_push' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.campaigns where id = p_id;
  if not found then raise exception 'Push not found' using errcode = 'P0002'; end if;
  if not public.has_push_token(auth.uid()) then return false; end if;
  -- An Account type, so the staff member's own preferences and the marketing cap don't hide it;
  -- no campaign_id, so it never counts in the list's numbers.
  perform public.enqueue_push('ticket_reply', array[auth.uid()],
    jsonb_build_object('title', c.title, 'body', c.body, 'target', c.open_target, 'test', true));
  return true;
end $$;

revoke execute on function public.staff_restore_campaign(uuid), public.staff_test_push(uuid) from public, anon;
grant execute on function public.staff_restore_campaign(uuid), public.staff_test_push(uuid) to authenticated;
