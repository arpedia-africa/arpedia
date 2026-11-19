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

-- Announcements list and editor: who last edited, for "Last edited by …".
create or replace function public.staff_list_banners() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public._can_draft_push() or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'live_state', public.banner_live_state(b),
      'shown', coalesce(s.shown, 0), 'taps', coalesce(s.taps, 0),
      'tap_rate', round(100.0 * s.taps / nullif(s.shown, 0), 1),
      'updated_by_name', (select p.full_name from public.profiles p where p.id = b.updated_by))
      order by public.banner_live_state(b) = 'live' desc, b.priority desc, b.updated_at desc)
    from public.banners b
    left join lateral (select sum(d.shown)::int shown, sum(d.taps)::int taps from public.banner_daily d
                       where d.banner_id = b.id) s on true), '[]'::jsonb);
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

-- ─── Emails (s-emails, s-email-template) ────────────────────────────────────
-- Names and triggers as staff read them on s-emails, plus the four system emails it lists that
-- the first migration missed.
update public.email_templates t set name = v.name, trigger = v.trigger
from (values
  ('welcome', 'Welcome', 'A reader finishes sign-up'),
  ('verify_email', 'Verify email', 'Sign-up with email, or email change'),
  ('receipt', 'Receipt', 'Web checkout payment succeeds'),
  ('renewal_failed', 'Subscription renewal failed', 'Card declined, day 1, 3 and 5 of grace'),
  ('author_approved', 'Application approved', 'Staff approve an author application'),
  ('book_approved', 'Book approved', 'Book published or scheduled'),
  ('changes_requested', 'Changes requested', 'Staff send a book back with a note'),
  ('payout_sent', 'Payout sent', 'Flutterwave confirms a transfer'),
  ('renewal_reminder', 'Plan renews soon', '3 days before a plan renews'),
  ('new_device', 'New sign-in', 'Sign-in on a new device'),
  ('staff_invite', 'Staff invite', 'A Super admin invites staff')) v (key, name, trigger)
where t.key = v.key;

insert into public.email_templates (key, name, trigger, can_disable, finance_review, variables, position) values
  ('application_more_info', 'Application needs more info', 'Staff ask the applicant for changes', true, false,
   '{first_name,note}', 6),
  ('payout_failed', 'Payout failed', 'Flutterwave rejects a transfer', false, true, '{first_name,amount,date,reason}', 10),
  ('data_export_ready', 'Data export ready', 'A privacy export is built (link works 7 days)', false, false,
   '{first_name,link}', 11),
  ('account_deleted', 'Account deleted', 'A deletion finishes after the 14-day wait', false, false, '{first_name}', 12);
insert into public.email_template_versions (template_key, number, subject, preheader, body)
select t.key, 1, t.name, '', 'Hi {{first_name}},' || chr(10) || chr(10) || t.name || '.' || chr(10) || chr(10) || 'The Arpedia team'
from public.email_templates t
where t.key in ('application_more_info', 'payout_failed', 'data_export_ready', 'account_deleted');
update public.email_templates t set position = v.pos
from (values ('welcome', 1), ('verify_email', 2), ('receipt', 3), ('renewal_failed', 4), ('author_approved', 5),
             ('application_more_info', 6), ('book_approved', 7), ('changes_requested', 8), ('payout_sent', 9),
             ('payout_failed', 10), ('data_export_ready', 11), ('account_deleted', 12), ('renewal_reminder', 13),
             ('new_device', 14), ('staff_invite', 15)) v (key, pos)
where t.key = v.key;

-- Sender settings: one row, read by the email-sender Worker.
create table public.email_sender (
  id boolean primary key default true check (id),
  from_address text not null default 'Arpedia <hello@arpedia.africa>'
    check (from_address ~ '^[^<>]*<[^@\s<>]+@arpedia\.africa>$'),
  reply_to text not null default 'support@arpedia.africa' check (reply_to ~ '^[^@\s]+@arpedia\.africa$'),
  footer text not null default 'Arpedia, Yaba, Lagos, Nigeria' check (char_length(footer) between 1 and 200),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.email_sender default values;
alter table public.email_sender enable row level security;
create policy email_sender_staff on public.email_sender for select to authenticated using (public.is_staff());
revoke all on public.email_sender from anon, authenticated;
grant select on public.email_sender to authenticated;

create function public.staff_save_email_sender(p_from text, p_reply_to text, p_footer text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.email_sender;
begin
  perform public.require_permission('send_push');
  select * into s from public.email_sender;
  if trim(p_from) !~ '^[^<>]*<[^@\s<>]+@arpedia\.africa>$' then
    raise exception 'From must look like Arpedia <hello@arpedia.africa>' using errcode = '22023';
  end if;
  if trim(p_reply_to) !~ '^[^@\s]+@arpedia\.africa$' then
    raise exception 'Reply-to must be an @arpedia.africa address' using errcode = '22023';
  end if;
  update public.email_sender set from_address = trim(p_from), reply_to = trim(p_reply_to), footer = trim(p_footer),
    updated_by = auth.uid(), updated_at = now();
  perform public.write_audit('engage', 'email_sender.save', 'email_sender', 'sender', 'Sender settings', null,
    to_jsonb(s), jsonb_build_object('from', p_from, 'reply_to', p_reply_to, 'footer', p_footer));
end $$;

-- Domain health (bounces and complaints from Resend events, 30 days) and version history.
create function public.staff_email_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('send_push') or public.has_permission('manage_settings')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return (select jsonb_build_object('sent', count(*),
      'bounce_pct', round(100.0 * count(*) filter (where bounced_at is not null) / nullif(count(*), 0), 1))
    from public.email_sends where sent_at > now() - interval '30 days');
end $$;

create function public.staff_email_versions(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('send_push') or public.has_permission('manage_settings')
          or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('number', v.number, 'subject', v.subject,
      'preheader', v.preheader, 'body', v.body, 'created_at', v.created_at,
      'edited_by', (select p.full_name from public.profiles p where p.id = v.edited_by)) order by v.number desc)
    from public.email_template_versions v where v.template_key = p_key), '[]'::jsonb);
end $$;

revoke execute on function public.staff_save_email_sender(text, text, text), public.staff_email_health(),
  public.staff_email_versions(text) from public, anon;
grant execute on function public.staff_save_email_sender(text, text, text), public.staff_email_health(),
  public.staff_email_versions(text) to authenticated;

-- The email-sender Worker takes From, Reply-to and the footer from the sender settings.
create or replace function public.email_template_latest(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('key', t.key, 'enabled', t.enabled, 'version_id', v.id, 'subject', v.subject,
                            'preheader', v.preheader, 'body', v.body, 'variables', t.variables,
                            'from', s.from_address, 'reply_to', s.reply_to, 'footer', s.footer)
  from public.email_templates t
  join lateral (select * from public.email_template_versions v where v.template_key = t.key
                order by v.number desc limit 1) v on true
  cross join public.email_sender s
  where t.key = p_key
$$;

-- Payout emails name the month, the masked bank and the transfer reference (s-email-template).
update public.email_templates set variables = '{first_name,amount,date,month,bank_masked,reference}'
where key = 'payout_sent';
