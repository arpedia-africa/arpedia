-- Flow 11 author seed: approved authors and the application queue for the admin Authors and Applications
-- screens. Loaded after seed.sql (supabase/config.toml); seeds load in file order, so this does not depend on
-- 12_pipeline.sql. Plain inserts: run with `pnpm db:reset` only.
-- Ids: applicants 00000000-0000-4000-a000-000000000100…, applications 00000000-0000-4000-e100-….

-- Authors from seed.sql who have an author profile: Ifeoma Nwachukwu and Chioma Okafor (their books are seeded there).
insert into public.author_profiles (user_id, pen_name, bio, location, visibility, status, approved_at, legal_name)
values
  ('00000000-0000-4000-a000-000000000002', 'Ifeoma Nwachukwu',
   'I write Christian fiction and devotionals about faith, family and the harmattan season.',
   'Enugu', 'public', 'active', now() - interval '680 days', 'Ifeoma Chinwe Nwachukwu'),
  ('00000000-0000-4000-a000-000000000005', 'Chioma Okafor',
   'Stories from Onitsha markets and the people who run them.',
   'Onitsha', 'public', 'active', now() - interval '610 days', 'Chioma Grace Okafor');

-- Ifeoma's club is flow 06's seeded author group.
update public.author_profiles set club_group_id = '00000000-0000-4000-d000-000000000002'
 where user_id = '00000000-0000-4000-a000-000000000002';

-- Applicants: readers who applied. Daniel Okeke was approved, so he is an author too.
create temporary table seed_applicants (n int, id uuid, email text, full_name text, username text, is_author boolean);
insert into seed_applicants values
  (1, '00000000-0000-4000-a000-000000000101', 'blessing.udo@example.com', 'Blessing Ekaette Udo',  'blessing.udo', false),
  (2, '00000000-0000-4000-a000-000000000102', 'yemi.coker@example.com',   'Yemi Coker',            'yemi.coker',   false),
  (3, '00000000-0000-4000-a000-000000000103', 'aisha.bello@example.com',  'Aisha Bello',           'aisha.bello',  false),
  (4, '00000000-0000-4000-a000-000000000104', 'daniel.okeke@example.com', 'Daniel Okeke',          'daniel.okeke', true),
  (5, '00000000-0000-4000-a000-000000000105', 'precious.etim@example.com','Precious Etim',         'precious.etim',false),
  (6, '00000000-0000-4000-a000-000000000106', 'grace.nnamdi@example.com', 'Grace Nnamdi',          'grace.nnamdi', false);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('arpedia-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(), '', '', '', ''
from seed_applicants;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from seed_applicants;
insert into public.profiles (id, username, full_name, is_author)
select id, username, full_name, is_author from seed_applicants
on conflict (id) do update set username = excluded.username, full_name = excluded.full_name,
  is_author = excluded.is_author;

-- Applications. Blessing waited 6 days (late), Yemi was asked for more info by Tunde, Daniel was approved,
-- Precious was rejected.
insert into public.author_applications (id, user_id, status, step_reached, legal_name, email, phone, pen_name,
  social_handle, date_of_birth, state, categories, bio, experience, sample_file_name, sample_text, sample_pages,
  sample_excerpt, agreement_version, agreement_accepted_at, submitted_at, assigned_to, decided_by, decided_at,
  decision_reason, reapply_after, info_request, info_step, checks)
values
  ('00000000-0000-4000-e100-000000000001', '00000000-0000-4000-a000-000000000101', 'new', 4,
   'Blessing Ekaette Udo', 'blessing.udo@example.com', '+2347061234548', 'Blessing Udo', 'facebook.com/blessingudowrites',
   '1996-02-03', 'Rivers', array['Clean romance', 'African stories'],
   'I am a primary school teacher in Port Harcourt who has loved romance stories since my aunt lent me her old Mills and Boon books at fourteen. I write clean love stories set in Rivers and Lagos where faith, family and ambition shape the characters as much as the romance does.',
   'Self-published on Facebook and Wattpad. Four novels finished, two still in draft.',
   'Blessing_Udo_sample.docx', null, 10,
   E'The generator coughed twice and died, and the whole of Aba Road went dark at once. Ifeyinwa did not move from her stall. She had counted fabric yards by feel since she was nine, and she could finish the customer''s order in the dark if she had to.\n\n"Mama Ifey, you are still here?" The voice was young and a little out of breath. She knew it before she turned. Tonye, who sold phone credit three stalls down and had been finding reasons to walk past her for a month.',
   1, now() - interval '6 days 1 hour', now() - interval '6 days 1 hour 2 minutes', null, null, null, null, null, null, null,
   '{"email_verified":true,"phone_verified":true,"duplicate":false,"duplicate_count":0,"similarity_pct":3,"age":30,"age_ok":true}'),
  ('00000000-0000-4000-e100-000000000002', '00000000-0000-4000-a000-000000000102', 'needs_info', 3,
   'Yemi Coker', 'yemi.coker@example.com', '+2348031112233', null, null,
   '1990-07-21', 'Lagos', array['Thriller', 'Fiction'],
   'Lagos-based thriller writer. I write short, fast chapters about ferries, traffic and the people who work nights.',
   'Two short stories in an online magazine.',
   null, E'The last ferry to Mile 2 leaves at 11:40 and nobody has ever been late for it twice.\n\nSegun was late. He ran down the jetty with his bag against his chest, and the engine was already turning over when the boatman saw him and, against every rule on the wall, threw him a rope.',
   null, null, 1, now() - interval '6 days 2 hours', now() - interval '6 days 3 hours',
   '00000000-0000-4000-b000-000000000003', null, null, null, null,
   'Hi Yemi, thank you for applying. Could you send a longer writing sample, about 3,000 words from one story? Reply in the app and we will look at it straight away.', 3,
   '{"email_verified":true,"phone_verified":true,"duplicate":false,"duplicate_count":0,"similarity_pct":41,"age":36,"age_ok":true}'),
  ('00000000-0000-4000-e100-000000000003', '00000000-0000-4000-a000-000000000103', 'new', 4,
   'Aisha Bello', 'aisha.bello@example.com', '+2348055550199', 'Aisha Bello', null,
   '1999-11-02', 'Kano', array['Young adult'],
   'Final year student in Kano. I write stories for teenagers about school, friendship and the pressure to be perfect.',
   'Write for my school magazine.',
   'Aisha_Bello_ch1-3.docx', null, 9,
   E'On the first day of term, Hauwa learned that her desk had a name carved into it, and the name was not hers.',
   1, now() - interval '4 days 2 hours', now() - interval '4 days 3 hours', null, null, null, null, null, null, null,
   '{"email_verified":true,"phone_verified":false,"duplicate":false,"duplicate_count":0,"similarity_pct":6,"age":27,"age_ok":true}'),
  ('00000000-0000-4000-e100-000000000004', '00000000-0000-4000-a000-000000000104', 'approved', 4,
   'Daniel Okeke', 'daniel.okeke@example.com', '+2348023334444', 'Daniel Okeke', null,
   '1985-04-18', 'Enugu', array['Christian & Faith', 'Devotionals'],
   'Pastor and devotional writer in Enugu. I write short daily reflections for families.',
   'Weekly devotional in my church bulletin for six years.',
   null, E'Morning one. Before the phone, before the news, say thank you for the breath you did not earn.\n\nGratitude is not a feeling you wait for. It is a place you walk to.',
   null, null, 1, now() - interval '9 days 4 hours', now() - interval '9 days 5 hours',
   '00000000-0000-4000-b000-000000000008', '00000000-0000-4000-b000-000000000008', now() - interval '7 days', null, null, null, null,
   '{"email_verified":true,"phone_verified":true,"duplicate":false,"duplicate_count":0,"similarity_pct":2,"age":41,"age_ok":true}'),
  ('00000000-0000-4000-e100-000000000005', '00000000-0000-4000-a000-000000000105', 'rejected', 4,
   'Precious Etim', 'precious.etim@example.com', null, 'Precious Etim', null,
   '2001-01-15', 'Akwa Ibom', array['Poetry'],
   'I write poems about home and the sea.',
   'Poems on Instagram.',
   null, E'The tide keeps its own time and so do I.\n\nI am not late. I am waiting for the water.',
   null, null, 1, now() - interval '12 days 1 hour', now() - interval '12 days 2 hours',
   '00000000-0000-4000-b000-000000000003', '00000000-0000-4000-b000-000000000003', now() - interval '9 days',
   'Hi Precious, thank you for applying. We are not able to accept your application this time because the writing sample matches work published elsewhere. You are welcome to apply again with your own original poems.',
   (current_date - 9 + 30), null, null,
   '{"email_verified":true,"phone_verified":false,"duplicate":false,"duplicate_count":0,"similarity_pct":62,"age":25,"age_ok":true}'),
  ('00000000-0000-4000-e100-000000000006', '00000000-0000-4000-a000-000000000106', 'new', 4,
   'Grace Nnamdi', 'grace.nnamdi@example.com', '+2348099887766', 'Grace Nnamdi', 'instagram.com/gracenwrites',
   '1993-09-09', 'Anambra', array['Short stories'],
   'Short story writer from Onitsha. I write about market women, weddings and small town gossip.',
   'Stories shared on a WhatsApp reading group of 200 readers.',
   null, E'Nobody at the wedding could agree on who had invited the goat.',
   null, null, 1, now() - interval '2 hours', now() - interval '3 hours', null, null, null, null, null, null, null,
   '{"email_verified":true,"phone_verified":true,"duplicate":true,"duplicate_count":1,"similarity_pct":8,"age":33,"age_ok":true}');

-- Daniel became an author when he was approved.
insert into public.author_profiles (user_id, pen_name, bio, location, status, approved_at, legal_name, application_id)
values ('00000000-0000-4000-a000-000000000104', 'Daniel Okeke',
        'Pastor and devotional writer in Enugu. I write short daily reflections for families.',
        'Enugu', 'active', now() - interval '7 days', 'Daniel Okeke', '00000000-0000-4000-e100-000000000004');

-- Events: who did what, with the notes the applicant was sent.
insert into public.author_application_events (application_id, actor_id, kind, note, created_at)
values
  ('00000000-0000-4000-e100-000000000001', '00000000-0000-4000-a000-000000000101', 'submitted', null, now() - interval '6 days 1 hour 2 minutes'),
  ('00000000-0000-4000-e100-000000000002', '00000000-0000-4000-a000-000000000102', 'submitted', null, now() - interval '6 days 3 hours'),
  ('00000000-0000-4000-e100-000000000002', '00000000-0000-4000-b000-000000000003', 'assigned', 'Tunde Bakare', now() - interval '5 days 20 hours'),
  ('00000000-0000-4000-e100-000000000002', '00000000-0000-4000-b000-000000000003', 'info_asked',
   'Hi Yemi, thank you for applying. Could you send a longer writing sample, about 3,000 words from one story? Reply in the app and we will look at it straight away.',
   now() - interval '5 days 19 hours'),
  ('00000000-0000-4000-e100-000000000003', '00000000-0000-4000-a000-000000000103', 'submitted', null, now() - interval '4 days 3 hours'),
  ('00000000-0000-4000-e100-000000000004', '00000000-0000-4000-a000-000000000104', 'submitted', null, now() - interval '9 days 5 hours'),
  ('00000000-0000-4000-e100-000000000004', '00000000-0000-4000-b000-000000000008', 'approved',
   'Warm voice and a clear audience. Welcome to Arpedia.', now() - interval '7 days'),
  ('00000000-0000-4000-e100-000000000005', '00000000-0000-4000-a000-000000000105', 'submitted', null, now() - interval '12 days 2 hours'),
  ('00000000-0000-4000-e100-000000000005', '00000000-0000-4000-b000-000000000003', 'rejected',
   'Hi Precious, thank you for applying. We are not able to accept your application this time because the writing sample matches work published elsewhere. You are welcome to apply again with your own original poems.',
   now() - interval '9 days'),
  ('00000000-0000-4000-e100-000000000006', '00000000-0000-4000-a000-000000000106', 'submitted', null, now() - interval '3 hours');
