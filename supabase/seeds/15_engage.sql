-- Flow 15 demo data, mirroring s-campaigns: phones with push tokens, two sent pushes with
-- delivery and opens, two scheduled, one draft, automatic notifications that went out, and
-- Credits low switched off by Femi. Local and CI only.

-- Readers' phones (one turned push off in Android settings).
insert into public.user_devices (user_id, device_key, model, os, app_version, push_token, push_token_at,
                                 push_disabled_at, last_seen_at)
select id, 'seed-device-' || right(id::text, 12), 'Redmi Note 13', 'Android 15', '1.0.0',
  'ExponentPushToken[seed-' || right(id::text, 12) || ']', now() - interval '20 days',
  case when right(id::text, 1) = '9' then now() - interval '3 days' end, now() - interval '2 hours'
from public.profiles where id::text like '00000000-0000-4000-a000-%'
on conflict (user_id, device_key) do nothing;

create temporary table seed_campaigns (n int, title text, body text, audience jsonb, target jsonb,
  status public.campaign_status, at timestamptz, reach int, conversions int);
insert into seed_campaigns values
  (1, 'Harmattan Letters is now in Trending',
   'Ifeoma Nwachukwu''s letters are the most read book this week. Read the free preview tonight.',
   '{"kind": "all"}', '{"kind": "book", "id": "00000000-0000-4000-c000-000000000001"}', 'sent',
   (date_trunc('day', now() at time zone 'Africa/Lagos') - interval '9 days' + interval '18 hours') at time zone 'Africa/Lagos',
   8, 3),
  (2, 'Author spotlight: Chioma Okafor', 'Meet the author behind Still Waters, Lagos, and read her new post.',
   '{"kind": "all"}', '{"kind": "author", "id": "00000000-0000-4000-a000-000000000005"}', 'sent',
   (date_trunc('day', now() at time zone 'Africa/Lagos') - interval '17 days' + interval '12 hours') at time zone 'Africa/Lagos',
   8, 2),
  (3, 'Yearly is ₦7,500 on the web this week', 'Save on a full year of reading. The offer ends Sunday.',
   '{"kind": "lapsed_30"}', '{"kind": "screen", "screen": "plans"}', 'scheduled',
   (date_trunc('day', now() at time zone 'Africa/Lagos') + interval '2 days' + interval '10 hours') at time zone 'Africa/Lagos',
   3, 0),
  (4, 'Sunday reading: five devotionals for the week', 'Short reads for every morning, picked by the team.',
   '{"kind": "subscribers"}', '{"kind": "screen", "screen": "discover"}', 'scheduled',
   (date_trunc('day', now() at time zone 'Africa/Lagos') + interval '4 days' + interval '7 hours 30 minutes') at time zone 'Africa/Lagos',
   2, 0),
  (5, 'New arrivals this month', 'Eight new books from Nigerian authors are waiting in Discover.',
   '{"kind": "all"}', '{"kind": "screen", "screen": "discover"}', 'draft', null, null, 0);

insert into public.campaigns (id, title, body, audience, open_target, status, send_at, sent_at, reach, counts,
                              created_by, created_at, updated_at)
select ('00000000-0000-4000-f150-' || lpad(n::text, 12, '0'))::uuid, title, body, audience, target, status,
  at, case when status = 'sent' then at end, reach,
  jsonb_build_object('queued', 0, 'sent', coalesce(reach, 0), 'delivered', 0, 'opened', 0,
                     'conversions', conversions, 'skipped_cap', 0, 'failed', 0),
  '00000000-0000-4000-b000-000000000002', coalesce(at, now()) - interval '2 days', now() - interval '20 minutes'
from seed_campaigns;

-- One row per reader for the sent pushes: most delivered, a few opened.
insert into public.push_log (user_id, type, category, campaign_id, status, data, created_at, sent_at, delivered_at,
                             opened_at)
select p.id, 'campaign', 'marketing', c.id,
  (case when right(p.id::text, 1) in ('1', '3', '5') then 'opened'
        when right(p.id::text, 1) = '9' then 'sent' else 'delivered' end)::public.push_status,
  '{}', c.sent_at, c.sent_at, c.sent_at + interval '1 minute',
  case when right(p.id::text, 1) in ('1', '3', '5') then c.sent_at + interval '25 minutes' end
from public.campaigns c
cross join public.profiles p
where c.status = 'sent' and p.id::text like '00000000-0000-4000-a000-%' and p.id::text not like '%000000000002';

-- Automatic notifications that went out in the last 30 days.
insert into public.push_log (user_id, type, category, status, data, created_at, sent_at, delivered_at, opened_at)
select p.id, t.key, t.category, 'opened', '{}', now() - make_interval(days => g), now() - make_interval(days => g),
  now() - make_interval(days => g), now() - make_interval(days => g)
from (values ('author_approved', 1), ('book_approved', 2), ('changes_requested', 1), ('author_new_book', 6),
             ('room_starting', 4), ('renewal_failed', 1)) v (key, times)
join public.push_types t on t.key = v.key
cross join generate_series(1, 6) g
join public.profiles p on p.id = '00000000-0000-4000-a000-000000000001'
where g <= v.times;

update public.push_types set enabled = false, switched_at = now() - interval '8 days',
  switched_by = '00000000-0000-4000-b000-000000000002'
where key = 'credits_low';

-- Announcements, as on s-banners: two live, one scheduled, one draft, one ended.
insert into public.banners (id, placement, headline, body, button_label, target, audience, starts_at, ends_at,
                            priority, dismissible, state, created_by, updated_by, updated_at)
values
  ('00000000-0000-4000-f151-000000000001', 'home_top', 'Harmattan Letters is in Trending',
   'A story of faith, family and letters from home. Read the first 10% free.', 'Read the preview',
   '{"kind": "book", "id": "00000000-0000-4000-c000-000000000001"}', '{"kind": "all"}',
   now() - interval '9 days', now() + interval '5 days', 3, true, 'live',
   '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-b000-000000000003', now() - interval '9 days'),
  ('00000000-0000-4000-f151-000000000002', 'credits', 'Buy 600 credits, get a free chapter pass',
   'Top up this month and the next locked chapter is on us.', 'See top-ups',
   '{"kind": "screen", "screen": "credits"}', '{"kind": "subscribers"}',
   now() - interval '18 days', now() + interval '11 days', 2, true, 'live',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000002', now() - interval '18 days'),
  ('00000000-0000-4000-f151-000000000003', 'launch_modal', 'December: give a reader a month',
   'Send a month of Arpedia to someone who loves books.', 'Send a gift',
   '{"kind": "screen", "screen": "plans"}', '{"kind": "subscribers"}',
   now() + interval '12 days', now() + interval '35 days', 2, true, 'live',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000002', now() - interval '1 day'),
  ('00000000-0000-4000-f151-000000000004', 'home_top', 'Meet our November authors',
   'Eight Nigerian authors joined Arpedia this month.', 'See authors',
   '{"kind": "screen", "screen": "discover"}', '{"kind": "all"}', null, null, 3, true, 'draft',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000002', now() - interval '3 hours'),
  ('00000000-0000-4000-f151-000000000005', 'home_top', 'Independence Day reading list',
   'Twelve books about Nigeria, from Kano to Calabar.', 'Read the list',
   '{"kind": "screen", "screen": "discover"}', '{"kind": "all"}',
   now() - interval '52 days', now() - interval '47 days', 3, true, 'ended',
   '00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000002', now() - interval '47 days');

insert into public.banner_daily (banner_id, day, shown, taps)
select b.id, current_date - g, s.shown, s.taps
from (values ('00000000-0000-4000-f151-000000000001'::uuid, 2044, 246), ('00000000-0000-4000-f151-000000000002', 340, 27),
             ('00000000-0000-4000-f151-000000000005', 4376, 624)) s (id, shown, taps)
join public.banners b on b.id = s.id
cross join generate_series(1, 5) g;

-- Email wording history, as on s-email-template (Payout sent), and some sends for the 30-day numbers.
insert into public.email_template_versions (template_key, number, subject, preheader, body, edited_by, created_at)
values ('payout_sent', 2, 'Your {{month}} earnings are on the way, {{first_name}}',
  '{{amount}} sent to {{bank_masked}}. It can take up to 24 hours to show.',
  'Hi {{first_name}},' || chr(10) || chr(10) || 'Good news. Your Arpedia earnings for {{month}} have been sent.' || chr(10) || chr(10) ||
  'Amount: {{amount}}' || chr(10) || 'Paid to: {{bank_masked}}' || chr(10) || 'Reference: {{reference}}' || chr(10) || chr(10) ||
  'Most banks show it within a few hours, but it can take up to 24 hours. If you don''t see it by tomorrow evening, reply to this email and we''ll trace it with Flutterwave.' ||
  chr(10) || chr(10) || 'Thank you for writing for Arpedia.' || chr(10) || 'The Arpedia team',
  '00000000-0000-4000-b000-000000000005', now() - interval '35 days');
insert into public.email_sends (template_key, user_id, sent_at, opened_at)
select k, '00000000-0000-4000-a000-000000000001', now() - make_interval(days => g),
  case when g % 3 <> 0 then now() - make_interval(days => g) end
from (values ('welcome'), ('verify_email'), ('receipt'), ('payout_sent')) v (k)
cross join generate_series(1, 9) g;

-- Recent exports, as on s-exports (files themselves are not in local R2).
insert into public.exports (kind, params, columns, includes_pii, reason, created_by, status, row_count, file_key,
                            created_at, finished_at, expires_at)
values
  ('author_earnings', jsonb_build_object('from', (now() at time zone 'Africa/Lagos')::date - 30, 'to', (now() at time zone 'Africa/Lagos')::date), '{}', false, null,
   '00000000-0000-4000-b000-000000000005', 'ready', 64, 'exports/seed-1/author-earnings.csv',
   now() - interval '40 minutes', now() - interval '39 minutes', now() + interval '7 days'),
  ('readers', jsonb_build_object('from', (now() at time zone 'Africa/Lagos')::date - 30, 'to', (now() at time zone 'Africa/Lagos')::date), '{reader_id,joined_at,state,email}',
   true, 'Welcome-back email list', '00000000-0000-4000-b000-000000000001', 'building', null, null,
   now() - interval '2 minutes', null, now() + interval '7 days'),
  ('books', jsonb_build_object('from', current_date - 7, 'to', current_date), '{}', false, null,
   '00000000-0000-4000-b000-000000000003', 'ready', 8, 'exports/seed-3/books.csv',
   now() - interval '2 days', now() - interval '2 days', now() + interval '5 days'),
  ('transactions', jsonb_build_object('from', current_date - 14, 'to', current_date - 7), '{}', false, null,
   '00000000-0000-4000-b000-000000000001', 'ready', 3418, 'exports/seed-4/transactions.csv',
   now() - interval '6 days 20 hours', now() - interval '6 days 20 hours', now() - interval '1 hour');
