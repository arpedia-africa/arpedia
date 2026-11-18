-- Flow 01 · sign-up trigger, onboarding steps, genres, devices and profile privacy.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('30000000-0000-4000-a000-000000000001', 'ada@test.local',
   '{"full_name":"Ada Writer","terms_version":"3","privacy_version":"2","avatar_url":"https://evil.example/t.png"}',
   '{"provider":"email"}'),
  ('30000000-0000-4000-a000-000000000002', 'bola@test.local',
   '{"name":"Bola G","picture":"https://lh3.googleusercontent.com/a/y"}', '{"provider":"google"}');

-- ─── Trigger ────────────────────────────────────────────────────────────────
select is((select full_name from public.profiles where id = '30000000-0000-4000-a000-000000000001'), 'Ada Writer',
  'sign-up creates the profile with the name');
select ok((select username ~ '^adawriter[0-9]{4}$' from public.profiles where id = '30000000-0000-4000-a000-000000000001'),
  'username is name plus 4 digits');
select is((select terms_version * 10 + privacy_version from public.profiles where id = '30000000-0000-4000-a000-000000000001'),
  32, 'terms and privacy versions stored');
select is((select avatar_url from public.profiles where id = '30000000-0000-4000-a000-000000000002'),
  'https://lh3.googleusercontent.com/a/y', 'Google picture becomes the avatar');
select is((select avatar_url from public.profiles where id = '30000000-0000-4000-a000-000000000001'), null,
  'email sign-up metadata never sets the avatar');
select is((select onboarding_step from public.profiles where id = '30000000-0000-4000-a000-000000000001'), 'signup',
  'new account starts at signup');

update public.profiles set phone = '+2348030000000', date_of_birth = '1990-04-02'
  where id = '30000000-0000-4000-a000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

-- ─── Privacy ────────────────────────────────────────────────────────────────
select is((select count(*)::int from public.profiles where id = '30000000-0000-4000-a000-000000000002'), 0,
  'cannot read another reader''s profile row (phone, birthday)');
select is((select full_name from public.public_profiles where id = '30000000-0000-4000-a000-000000000002'), 'Bola G',
  'public_profiles shows the name');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'public_profiles' and column_name in ('phone', 'date_of_birth')), 0,
  'public_profiles has no phone or birthday');
select throws_ok($$update public.profiles set phone = '+2348000000000' where id = '30000000-0000-4000-a000-000000000001'$$,
  '42501', null, 'phone is set only through the RPC');
select throws_ok($$update public.profiles set onboarding_step = 'done', terms_version = 9
  where id = '30000000-0000-4000-a000-000000000001'$$, '42501', null, 'cannot set onboarding or terms fields directly');

-- ─── Onboarding steps ───────────────────────────────────────────────────────
select is((public.save_onboarding_step('interests', jsonb_build_object('genre_ids',
  (select jsonb_agg(id) from public.genres where slug in ('fiction', 'drama'))))).onboarding_step, 'theme',
  'interests moves to theme');
select is((select count(*)::int from public.user_genres), 2, 'genre picks saved');
select is((public.save_onboarding_step('theme', '{"theme":"palm"}')).theme, 'palm'::public.app_theme, 'theme saved');
select is((public.save_onboarding_step('role', '{"intent":"author"}')).onboarding_step, 'profile', 'role moves to profile');
select is((public.save_onboarding_step('interests', '{}')).onboarding_step, 'profile',
  'saving an earlier step does not move backwards');
select throws_ok($$select public.save_onboarding_step('profile', jsonb_build_object('date_of_birth',
  (current_date - interval '15 years')::date))$$, '22023', 'you must be at least 16', 'under 16 refused');
select throws_ok($$select public.save_onboarding_step('profile', '{"phone":"+23480300000"}')$$, '22023', null,
  'short Nigerian phone refused');
select is((public.save_onboarding_step('profile', '{"full_name":"Ada W","phone":"+2348030000000","country":"GH"}')).phone,
  '+2348030000000', 'profile saved');
select is((public.save_onboarding_step('plans')).onboarding_step, 'done', 'reaching the paywall finishes onboarding');
select is((public.save_onboarding_step('role', '{"intent":"reader"}')).signup_intent, 'author'::public.signup_intent,
  'intent is fixed after onboarding');

-- ─── Genres ─────────────────────────────────────────────────────────────────
select throws_ok($$select public.set_user_genres(array[gen_random_uuid()])$$, '22023', null, 'unknown genre refused');
select throws_ok($$insert into public.user_genres (user_id, genre_id)
  select '30000000-0000-4000-a000-000000000002', id from public.genres limit 1$$, '42501', null,
  'cannot write genre picks directly');

-- ─── Devices ────────────────────────────────────────────────────────────────
select ok(public.register_device('device-key-0000000001', 'Redmi', 'Android 15', '1.0.0')
  and public.register_device('device-key-0000000002') and public.register_device('device-key-0000000003'),
  'first 3 devices get downloads');
select ok(not public.register_device('device-key-0000000004'), '4th device does not');
select ok(public.register_device('device-key-0000000001', 'Redmi', 'Android 15', '1.0.1'),
  'signing in again on an enabled device keeps downloads');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.user_devices) + (select count(*)::int from public.user_genres), 0,
  'devices and genre picks are owner only');

select * from finish();
rollback;
