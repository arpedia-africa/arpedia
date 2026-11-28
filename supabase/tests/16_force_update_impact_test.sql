-- Flow 16 fix 16-11 (rule 25): force update shows how many readers it locks out, from the phones that
-- opened the app in the last 7 days, compared with each platform's saved minimum.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('16110000-0000-4000-a000-000000000001', 'sa-fu@arpedia.africa'),
  ('16110000-0000-4000-a000-000000000002', 'fin-fu@arpedia.africa'),
  ('16110000-0000-4000-a000-000000000011', 'r1-fu@test.local'),
  ('16110000-0000-4000-a000-000000000012', 'r2-fu@test.local'),
  ('16110000-0000-4000-a000-000000000013', 'r3-fu@test.local'),
  ('16110000-0000-4000-a000-000000000014', 'r4-fu@test.local'),
  ('16110000-0000-4000-a000-000000000015', 'r5-fu@test.local');
insert into public.profiles (id, full_name)
select id, 'Fu ' || right(id::text, 2) from auth.users where email like '%-fu@%'
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('16110000-0000-4000-a000-000000000001', 'super_admin'),
  ('16110000-0000-4000-a000-000000000002', 'finance');
insert into public.app_config (key, value) values ('android_min_version', '"25.4"'), ('ios_min_version', '"25.2"')
  on conflict (key) do update set value = excluded.value;

-- Every other phone is set aside so only these count.
update public.user_devices set revoked_at = now() where revoked_at is null;
insert into public.user_devices (user_id, device_key, os, app_version, last_seen_at, revoked_at) values
  -- r1: an old Android build (locked out) and an iPhone exactly at the minimum (not locked out).
  ('16110000-0000-4000-a000-000000000011', 'fu-device-r1-android', 'Android 14', '25.3.1', now(), null),
  ('16110000-0000-4000-a000-000000000011', 'fu-device-r1-iphone0', 'iOS 17.2', '25.2.0', now(), null),
  -- r2: at the Android minimum.
  ('16110000-0000-4000-a000-000000000012', 'fu-device-r2-android', 'Android 13', '25.4.0', now(), null),
  -- r3: old, but not opened in the last 7 days.
  ('16110000-0000-4000-a000-000000000013', 'fu-device-r3-android', 'Android 12', '24.9', now() - interval '8 days', null),
  -- r4: no version reported: counted, never locked out.
  ('16110000-0000-4000-a000-000000000014', 'fu-device-r4-android', 'Android 14', null, now(), null),
  -- r5: old, but signed out of that phone.
  ('16110000-0000-4000-a000-000000000015', 'fu-device-r5-android', 'Android 14', '25.1', now(), now());

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '16110000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set local role authenticated;

select pg_temp.as_user('16110000-0000-4000-a000-000000000001');
select is(public.force_update_impact() - 'android_min_version' - 'ios_min_version',
  '{"phones": 4, "phones_below": 1, "readers": 3, "readers_below": 1, "share_pct": 25.0}'::jsonb,
  'only phones opened in the last 7 days count; below the platform minimum is locked out');
select is(public.force_update_impact() ->> 'android_min_version', '25.4', 'it says which minimum it used');

select pg_temp.as_user('16110000-0000-4000-a000-000000000002');
select throws_ok($$select public.force_update_impact()$$, '42501', null, 'Finance cannot see it');
select pg_temp.as_user('16110000-0000-4000-a000-000000000011');
select throws_ok($$select public.force_update_impact()$$, '42501', null, 'readers cannot see it');

select * from finish();
rollback;
