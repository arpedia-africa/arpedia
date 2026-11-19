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
