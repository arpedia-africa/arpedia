-- Flow 14 · support seed: macros and a few tickets as on s-support and s-ticket (local only).
insert into public.support_macros (title, body, category, variables, created_by) values
  ('Credits delayed after store purchase',
   'Hi {name}, thank you for your patience. Your store purchase was received but our system did not add the credits automatically. We have added them to your account by hand, and you should see {balance} now. Sorry for the delay. If it does not show, restart the app and tell us.',
   'billing', '{name,balance}', '00000000-0000-4000-b000-000000000006'),
  ('Book will not open after unlocking',
   'Hi {name}, sorry about that. Please pull down to refresh your Library, then open the book again. If it still does not open, tell us the book title and we will fix it straight away.',
   'book_access', '{name}', '00000000-0000-4000-b000-000000000006'),
  ('How to change your phone number',
   'Hi {name}, go to Profile, then Account, then Phone number. We will send a code to the new number to confirm it.',
   'account', '{name}', '00000000-0000-4000-b000-000000000006');

insert into public.support_tickets (id, user_id, email, channel, category, subject, status, assignee_id,
  first_reply_due_at, first_replied_at, last_message_at, created_at) values
  ('00000000-0000-4000-f140-000000000001', '00000000-0000-4000-a000-000000000001', null, 'app', 'billing',
   'I paid but my credits didn''t arrive', 'open', '00000000-0000-4000-b000-000000000006',
   now() - interval '4 hours', null, now() - interval '30 minutes', now() - interval '28 hours'),
  ('00000000-0000-4000-f140-000000000002', null, 'tolu.ade@example.com', 'email', 'account',
   'Can''t sign in with my new phone', 'open', null,
   now() + interval '18 hours', null, now() - interval '6 hours', now() - interval '6 hours'),
  ('00000000-0000-4000-f140-000000000003', '00000000-0000-4000-a000-000000000001', null, 'app', 'book_access',
   'Chapter 4 of Harmattan Letters is blank', 'waiting_on_reader', '00000000-0000-4000-b000-000000000006',
   now() - interval '2 days', now() - interval '2 days 20 hours', now() - interval '2 days', now() - interval '3 days');

insert into public.ticket_messages (ticket_id, kind, author_id, body, created_at) values
  ('00000000-0000-4000-f140-000000000001', 'reader', '00000000-0000-4000-a000-000000000001',
   'I bought the 500 credits top-up on Google Play and I was charged ₦1,500 but my balance did not change. I wanted to unlock a book tonight.',
   now() - interval '28 hours'),
  ('00000000-0000-4000-f140-000000000001', 'note', '00000000-0000-4000-b000-000000000006',
   'The store told us about the purchase, but our payment notice failed twice before it went through. Credits were not added. Safe to grant by hand.',
   now() - interval '20 hours'),
  ('00000000-0000-4000-f140-000000000001', 'reader', '00000000-0000-4000-a000-000000000001',
   'Okay. Still nothing o. Google sent me the receipt GPA.3391-8812-4402-17733.', now() - interval '16 hours'),
  ('00000000-0000-4000-f140-000000000001', 'reader', '00000000-0000-4000-a000-000000000001',
   'Please I really need this fixed today.', now() - interval '30 minutes'),
  ('00000000-0000-4000-f140-000000000002', 'reader', null,
   'I changed my phone and now the app says my number is already in use. My old phone was stolen.', now() - interval '6 hours'),
  ('00000000-0000-4000-f140-000000000003', 'reader', '00000000-0000-4000-a000-000000000001',
   'When I open chapter 4 the page is white. Other chapters are fine.', now() - interval '3 days'),
  ('00000000-0000-4000-f140-000000000003', 'staff', '00000000-0000-4000-b000-000000000006',
   'Hi Ngozi, sorry about that. Please pull down to refresh your Library, then open the book again. Does chapter 4 open now?',
   now() - interval '2 days 20 hours');

-- Safety rules: muted words as on s-automod.
insert into public.automod_words (text, is_phrase, category, scope, action, created_by) values
  ('find you', true, 'threats', 'everywhere', 'hide_and_report', '00000000-0000-4000-b000-000000000004'),
  ('send nudes', true, 'sexual', 'chat_dms', 'hide_and_report', '00000000-0000-4000-b000-000000000004'),
  ('whatsapp me', true, 'spam', 'chat_dms', 'hide', '00000000-0000-4000-b000-000000000004'),
  ('cheap data, naira exchange', true, 'spam', 'everywhere', 'hide', '00000000-0000-4000-b000-000000000004'),
  ('pdf free, free download', true, 'piracy', 'everywhere', 'hide', '00000000-0000-4000-b000-000000000004'),
  ('dies in chapter', true, 'spoilers', 'reviews', 'blur', '00000000-0000-4000-b000-000000000004'),
  ('shut up, stupid', true, 'harassment', 'chat_dms', 'warn', '00000000-0000-4000-b000-000000000004');
insert into public.automod_hits (word_id, at)
select w.id, now() - (g * interval '3 hours')
from public.automod_words w
cross join lateral generate_series(1, case w.text when 'whatsapp me' then 41 when 'shut up, stupid' then 86
  when 'find you' then 7 when 'send nudes' then 3 else 19 end) g;

-- Appeals: Emeka appeals a 30-day suspension Zainab decided; Musa a warning (in review).
insert into public.moderation_actions (id, target_user_id, action, duration_days, reason, message_to_user, decided_by, expires_at, created_at) values
  ('00000000-0000-4000-f141-000000000001', '00000000-0000-4000-a000-000000000007', 'suspend', 30,
   'Violence or threats', 'You threatened another reader. Your account is suspended for 30 days.',
   '00000000-0000-4000-b000-000000000004', now() + interval '22 days', now() - interval '8 days'),
  ('00000000-0000-4000-f141-000000000002', '00000000-0000-4000-a000-000000000006', 'warn', null,
   'Harassment or bullying', 'Please keep discussions kind.', '00000000-0000-4000-b000-000000000004', null, now() - interval '3 days');
insert into public.user_sanctions (id, user_id, kind, starts_at, ends_at, action_id, state) values
  ('00000000-0000-4000-f142-000000000001', '00000000-0000-4000-a000-000000000007', 'suspend',
   now() - interval '8 days', now() + interval '22 days', '00000000-0000-4000-f141-000000000001', 'active'),
  ('00000000-0000-4000-f142-000000000002', '00000000-0000-4000-a000-000000000006', 'warn',
   now() - interval '3 days', null, '00000000-0000-4000-f141-000000000002', 'active');
insert into public.appeals (user_id, subject_type, subject_id, original_decider, text, status, due_at, created_at) values
  ('00000000-0000-4000-a000-000000000007', 'sanction', '00000000-0000-4000-f142-000000000001',
   '00000000-0000-4000-b000-000000000004',
   'I was joking with my friends and it was taken the wrong way. I would never hurt anybody. Please reduce the suspension. I am sorry to the others.',
   'new', now() + interval '2 days', now() - interval '1 day'),
  ('00000000-0000-4000-a000-000000000006', 'sanction', '00000000-0000-4000-f142-000000000002',
   '00000000-0000-4000-b000-000000000004', 'I only disagreed with the review. I did not insult anybody.',
   'in_review', now() - interval '2 hours', now() - interval '3 days 2 hours');
