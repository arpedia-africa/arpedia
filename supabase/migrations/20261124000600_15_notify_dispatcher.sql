-- Flow 15 · spec check: one notification and email dispatcher for the queues nobody read
-- (user_notify, author_notify, book_notify, trust_notify). The api Worker's cron drains them
-- (workers/api/src/routes/15/notify.ts): pushes go through push_fanout (enqueue_push, so push
-- types, preferences, quiet hours and the in-app feed apply as for every push), emails through the
-- editable templates (sendTemplateEmail). Closes 09-2, 10-3, 11-1, 12-2, 13-1, 14-1, 14-2, 15-1 to
-- 15-4 and 15-6.

-- ─── 10-3: preferences decide which feed items are created ──────────────────
-- Push type key (or feed kind) → the reader's switch in Settings → Notifications.
create or replace function public.notification_allowed(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_kind in ('club_message', 'room_starting', 'room_finished') then public.notification_pref(p_user, 'clubs')
    when p_kind in ('author_new_post', 'author_new_book', 'author_reply') then public.notification_pref(p_user, 'authors')
    when p_kind in ('note_reply', 'social_notice') then public.notification_pref(p_user, 'note_replies')
    when p_kind = 'reading_reminder' then public.notification_pref(p_user, 'reminders')
    when p_kind in ('offer', 'campaign', 'new_arrival') then public.notification_pref(p_user, 'offers')
    else true end
$$;

-- ─── Push types for notices that had none ───────────────────────────────────
-- Title and body are written by the dispatcher (plain, friendly copy per kind).
insert into public.push_types (key, label, category, can_reader_disable, automatic, can_switch_off, quiet_action,
                               capped, collapse_key, ttl_seconds, title_template, body_template, enabled) values
  ('account_notice', 'Account, money and Studio updates', 'account', false, true, false, 'deliver', false, null, 345600,
   '{{title}}', '{{body}}', true),
  ('social_notice', 'Likes, comments, gifts and messages', 'messages', true, false, true, 'hold', false, null, 86400,
   '{{title}}', '{{body}}', true)
on conflict (key) do nothing;

-- ─── Email templates for notices that had none ──────────────────────────────
insert into public.email_templates (key, name, trigger, can_disable, finance_review, variables, position) values
  ('refund_done', 'Your refund is on its way', 'Web refund approved', false, true, '{first_name,amount}', 20),
  ('refund_declined', 'About your refund request', 'Web refund declined', false, true, '{first_name,note}', 21),
  ('bank_account_changed', 'Your payout account changed', 'Payout bank account changed', false, false,
   '{first_name,bank_name,last4,resume_at}', 22),
  ('bank_document_requested', 'We need a document for your payouts', 'Payout document requested', false, false,
   '{first_name,reason}', 23),
  ('bank_account_rejected', 'We couldn''t use your payout account', 'Payout bank account rejected', false, false,
   '{first_name,reason}', 24),
  ('application_rejected', 'About your author application', 'Author application turned down', false, false,
   '{first_name}', 25),
  ('book_rejected', 'About your book', 'Book turned down', false, false, '{first_name,book_title,note}', 26),
  ('sanction_notice', 'About your account', 'Moderation decision', false, false, '{first_name,message}', 27),
  ('appeal_decided', 'We''ve looked at your appeal', 'Appeal decided', false, false, '{first_name,message}', 28),
  ('claim_notice', 'A claim about your book', 'Copyright or impersonation claim', false, false,
   '{first_name,book_title,message,due}', 29),
  ('claim_decided', 'The claim about your book', 'Claim decided', false, false, '{first_name,book_title,message}', 30),
  ('staff_alert', 'Arpedia staff alert', 'Staff alert (reports, queues, desk)', false, false,
   '{first_name,subject,message}', 31)
on conflict (key) do nothing;

insert into public.email_template_versions (template_key, number, subject, preheader, body)
select t.key, 1, t.name, '', b.body
from public.email_templates t
join (values
  ('refund_done', 'Hi {{first_name}},' || chr(10) || chr(10) || 'We''ve refunded {{amount}} to your card. It can take 5 to 10 working days to show.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('refund_declined', 'Hi {{first_name}},' || chr(10) || chr(10) || 'We looked at your refund request and can''t refund this payment.' || chr(10) || '{{note}}' || chr(10) || chr(10) || 'Reply to this email if you have questions.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('bank_account_changed', 'Hi {{first_name}},' || chr(10) || chr(10) || 'Your payout account is now {{bank_name}} ending {{last4}}. Payouts resume on {{resume_at}}.' || chr(10) || 'If you didn''t make this change, reply to this email straight away.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('bank_document_requested', 'Hi {{first_name}},' || chr(10) || chr(10) || 'To keep paying you, we need a document: {{reason}}' || chr(10) || 'Upload it in Studio → Earnings.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('bank_account_rejected', 'Hi {{first_name}},' || chr(10) || chr(10) || 'We couldn''t use the payout account you added: {{reason}}' || chr(10) || 'Add another one in Studio → Earnings.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('application_rejected', 'Hi {{first_name}},' || chr(10) || chr(10) || 'Thank you for applying to be an Arpedia author. We can''t approve your application this time. You can read why in the app.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('book_rejected', 'Hi {{first_name}},' || chr(10) || chr(10) || 'We can''t publish {{book_title}}.' || chr(10) || '{{note}}' || chr(10) || chr(10) || 'The Arpedia team'),
  ('sanction_notice', 'Hi {{first_name}},' || chr(10) || chr(10) || '{{message}}' || chr(10) || chr(10) || 'You can appeal from the app if you think we got it wrong.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('appeal_decided', 'Hi {{first_name}},' || chr(10) || chr(10) || '{{message}}' || chr(10) || chr(10) || 'The Arpedia team'),
  ('claim_notice', 'Hi {{first_name}},' || chr(10) || chr(10) || 'Someone has made a claim about {{book_title}}.' || chr(10) || '{{message}}' || chr(10) || 'Please answer in Studio by {{due}}.' || chr(10) || chr(10) || 'The Arpedia team'),
  ('claim_decided', 'Hi {{first_name}},' || chr(10) || chr(10) || 'We''ve decided the claim about {{book_title}}.' || chr(10) || '{{message}}' || chr(10) || chr(10) || 'The Arpedia team'),
  ('staff_alert', 'Hi {{first_name}},' || chr(10) || chr(10) || '{{subject}}' || chr(10) || '{{message}}' || chr(10) || chr(10) || 'Open the console to act on it.')
) as b(key, body) on b.key = t.key
where not exists (select 1 from public.email_template_versions v where v.template_key = t.key);

-- ─── Queue access for the dispatcher (service role only) ───────────────────
create function public.notify_queue_read(p_queue text, p_vt int default 60, p_qty int default 20)
returns setof pgmq.message_record
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('notify_queue_read');
  if p_queue not in ('user_notify', 'author_notify', 'book_notify', 'trust_notify') then
    raise exception 'Unknown queue' using errcode = '22023';
  end if;
  return query select * from pgmq.read(p_queue, greatest(coalesce(p_vt, 60), 10), least(greatest(coalesce(p_qty, 20), 1), 100));
end $$;

create function public.notify_queue_done(p_queue text, p_msg_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('notify_queue_done');
  if p_queue not in ('user_notify', 'author_notify', 'book_notify', 'trust_notify') then
    raise exception 'Unknown queue' using errcode = '22023';
  end if;
  return pgmq.archive(p_queue, p_msg_id);
end $$;

-- Who and what a batch of notices is about: names and email addresses, book titles and authors,
-- active staff by role (Super admins always included), followers of authors (for new books).
create function public.notify_lookup(p_users uuid[] default '{}', p_books uuid[] default '{}',
                                     p_roles text[] default '{}', p_follow_authors uuid[] default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_service('notify_lookup');
  return jsonb_build_object(
    'users', coalesce((select jsonb_object_agg(u.id, jsonb_build_object(
        'email', case when p.erased_at is null and p.deleted_at is null then u.email end,
        'first_name', coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'there'),
        'name', public.sender_name(u.id)))
      from auth.users u join public.profiles p on p.id = u.id
      where u.id = any(coalesce(p_users, '{}'))), '{}'),
    'books', coalesce((select jsonb_object_agg(b.id, jsonb_build_object('title', b.title, 'author_id', b.author_id))
      from public.books b where b.id = any(coalesce(p_books, '{}'))), '{}'),
    'staff', coalesce((select jsonb_object_agg(r.role, r.ids) from (
        select x.role, jsonb_agg(distinct s.user_id) ids
        from unnest(coalesce(p_roles, '{}')) x(role)
        join public.staff_roles s on s.active and (s.role::text = x.role or s.role = 'super_admin')
        group by x.role) r), '{}'),
    'followers', coalesce((select jsonb_object_agg(f.author, f.ids) from (
        select a.author, (select jsonb_agg(fl.follower_id) from (
            select fo.follower_id from public.follows fo where fo.followee_id = a.author limit 10000) fl) ids
        from unnest(coalesce(p_follow_authors, '{}')) a(author)) f where f.ids is not null), '{}'));
end $$;

revoke execute on function public.notify_queue_read(text, int, int), public.notify_queue_done(text, bigint),
  public.notify_lookup(uuid[], uuid[], text[], uuid[]) from public, anon, authenticated;
grant execute on function public.notify_queue_read(text, int, int), public.notify_queue_done(text, bigint),
  public.notify_lookup(uuid[], uuid[], text[], uuid[]) to service_role;
