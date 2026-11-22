-- Flow 10 seed: Ngozi's reading goal, notification preferences, two devices (s-security) and a
-- staff note from Bisi (s-user), as in the prototype. Loaded after seed.sql.

insert into public.reading_goals (user_id, year, target_books)
values ('00000000-0000-4000-a000-000000000001', public._lagos_year(), 24)
on conflict do nothing;

-- Reading reminders off, quiet hours on (s-notif-prefs sample).
insert into public.notification_preferences (user_id, reminders, quiet_enabled)
values ('00000000-0000-4000-a000-000000000001', false, true)
on conflict do nothing;

update public.profiles set bio = 'Choir alto. Reads on the BRT.' where id = '00000000-0000-4000-a000-000000000001';

insert into public.user_devices (user_id, device_key, model, os, app_version, download_enabled, last_seen_at, last_city)
values
  ('00000000-0000-4000-a000-000000000001', 'seed-device-ngozi-tablet-0001', 'Samsung Galaxy A15', 'Android 14', '1.0.0',
   true, now() - interval '16 days', 'Lagos')
on conflict do nothing;

insert into public.staff_notes (user_id, author_id, body, created_at)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000006',
  'Asked why Seven Bridges to Jos did not unlock. Told her to update to the latest app.', now() - interval '9 days');
