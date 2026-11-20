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

-- Copyright claims as on s-claims / s-claim: one new (Kano Nights, with a passage check), one waiting on the
-- author (Ruth of Ibadan, held), one rejected.
insert into public.copyright_claims (id, book_id, claimant_name, claimant_contact, type, details, evidence, similarity,
  status, author_due_at, due_at, decided_by, decision_note, decided_at, created_at) values
  ('00000000-0000-4000-f143-000000000001', '00000000-0000-4000-c100-000000000004', 'Paramount Books Ltd',
   'Barr. Yetunde Coker', 'copyright',
   'Kano Nights reuses our client''s 2019 novel almost line by line from chapter 3 on. We request removal and a written undertaking. Legal contact: legal@paramountbooks.ng',
   '[{"name":"The-Night-Train-to-Kano-2019-edition.pdf","kind":"PDF","size":"3.8 MB","note":"uploaded 12 Nov"},
     {"name":"Paramount-copyright-registration-NCC-2019-0873.pdf","kind":"PDF","size":"640 KB","note":"Nigerian Copyright Commission certificate"}]',
   '{"score":74,"flagged":6,"chapter":"Chapter 3","source_title":"\"The Night Train to Kano\" (2019)","source_label":"Paramount, \"The Night Train to Kano\", p. 41",
     "passages":[{"source":"[[The harmattan dust sat on the windowsill like a debt nobody wanted to name.]] Musa counted the coins twice, then a third time, as if the numbers might change their mind.",
                  "book":"[[The harmattan dust sat on the windowsill like a debt nobody wanted to name.]] Garba counted the coins twice, then a third time, as if the numbers might change their mind."},
                 {"source":"[[\"You will not leave this city with my brother''s name in your mouth,\" she said.]]",
                  "book":"[[\"You will not leave this city with my brother''s name in your mouth,\" she told him.]]"}]}',
   'new', null, now() + interval '6 days', null, null, null, now() - interval '1 day'),
  ('00000000-0000-4000-f143-000000000002', '00000000-0000-4000-c000-000000000002', 'Ada Nwosu (author)',
   'ada.nwosu@example.com', 'plagiarism',
   'Two chapters of Ruth of Ibadan follow my short story "The Village Schoolteacher" scene by scene.',
   '[{"name":"The-Village-Schoolteacher.docx","kind":"Word","size":"88 KB","note":"published on her blog in 2021"}]',
   null, 'waiting_on_author', now() + interval '4 days', now() + interval '4 days', null, null, null, now() - interval '3 days'),
  ('00000000-0000-4000-f143-000000000003', '00000000-0000-4000-c100-000000000010', 'Rotimi Press',
   'rights@rotimipress.example', 'copyright', 'Okada Diaries uses the title of our 2015 memoir.', '[]', null,
   'rejected', null, now() - interval '20 days', '00000000-0000-4000-b000-000000000002',
   'Titles are not protected by copyright and the text does not match.', now() - interval '22 days', now() - interval '28 days');

update public.books set claim_hold_at = now() - interval '3 days' where id = '00000000-0000-4000-c000-000000000002';

-- Help articles as on s-help / s-help-article (bodies use ### headings and - lists), with views and votes.
insert into public.help_articles (id, slug, category, shows_in, state) values
  ('00000000-0000-4000-f144-000000000001', 'how-credits-work', 'credits_plans', '{app,web}', 'published'),
  ('00000000-0000-4000-f144-000000000002', 'getting-started', 'getting_started', '{app,web}', 'published'),
  ('00000000-0000-4000-f144-000000000003', 'charged-but-no-credits', 'credits_plans', '{app,web}', 'published'),
  ('00000000-0000-4000-f144-000000000004', 'free-preview', 'reading', '{app,web}', 'published'),
  ('00000000-0000-4000-f144-000000000005', 'reporting-and-blocking', 'community', '{app}', 'published'),
  ('00000000-0000-4000-f144-000000000006', 'becoming-an-author', 'authors', '{web}', 'published'),
  ('00000000-0000-4000-f144-000000000007', 'author-earnings', 'authors', '{app,web}', 'draft'),
  ('00000000-0000-4000-f144-000000000008', 'delete-account', 'account_privacy', '{app,web}', 'published');

insert into public.help_article_versions (id, article_id, number, title, body, edited_by, created_at) values
  ('00000000-0000-4000-f145-000000000011', '00000000-0000-4000-f144-000000000001', 1, 'How credits work',
   E'Credits are how you unlock books beyond the free preview, message authors and send tips. 1 credit is ₦3.',
   '00000000-0000-4000-b000-000000000001', now() - interval '30 days'),
  ('00000000-0000-4000-f145-000000000012', '00000000-0000-4000-f144-000000000001', 2, 'How credits work',
   E'Credits are how you unlock books beyond the free preview, message authors and send tips. 1 credit is ₦3.\n\n### What a book costs\n\n- Every book costs ½ credit per page, shown before you start. A 250-page book is 125 credits.\n- Pay upfront for the whole book, or pay as you read, one chapter at a time. Both add up to the same price.\n- Changed your mind? Undo a chapter within 10 minutes and get the credits back.\n- The first 10% of every book is free, and re-reading is always free.\n\n### Where credits come from\n\nYour plan gives you credits every period: 300 on Monthly, 800 on Quarterly and 3,000 on Yearly. Unused plan credits carry over one period. Subscribers can top up: 200 credits for ₦600, 500 for ₦1,500 or 1,000 for ₦3,000.\n\n### What if my credits are missing?\n\nStore purchases can take a few minutes to arrive. If nothing shows after 30 minutes, open Help and tap "Contact support" with your receipt number.',
   '00000000-0000-4000-b000-000000000006', now() - interval '10 days'),
  ('00000000-0000-4000-f145-000000000021', '00000000-0000-4000-f144-000000000002', 1, 'Getting started with Arpedia',
   E'Welcome to Arpedia. Pick a plan, choose a few genres you like, and your Discover page fills with books for you.',
   '00000000-0000-4000-b000-000000000006', now() - interval '18 days'),
  ('00000000-0000-4000-f145-000000000031', '00000000-0000-4000-f144-000000000003', 1, 'Why was I charged but have no credits?',
   E'Store purchases can take a few minutes to arrive.\n\n- Pull down on your balance to refresh it.\n- If nothing shows after 30 minutes, contact support with your receipt number.',
   '00000000-0000-4000-b000-000000000006', now() - interval '15 days'),
  ('00000000-0000-4000-f145-000000000041', '00000000-0000-4000-f144-000000000004', 1, 'Reading with the free 10% preview',
   E'The first 10% of every book is free to read, so you can try it before you spend credits.',
   '00000000-0000-4000-b000-000000000006', now() - interval '31 days'),
  ('00000000-0000-4000-f145-000000000051', '00000000-0000-4000-f144-000000000005', 1, 'Reporting and blocking',
   E'Long-press a message and tap Report. Our team looks at every report. Blocking someone hides their messages from you.',
   '00000000-0000-4000-b000-000000000006', now() - interval '8 days'),
  ('00000000-0000-4000-f145-000000000061', '00000000-0000-4000-f144-000000000006', 1, 'Becoming an Arpedia author',
   E'Apply from Profile, then Become an author. We reply within 5 working days.',
   '00000000-0000-4000-b000-000000000006', now() - interval '23 days'),
  ('00000000-0000-4000-f145-000000000071', '00000000-0000-4000-f144-000000000007', 1, 'How author earnings are paid',
   E'Authors earn ₦1.60 for every credit readers spend on their books, paid monthly to a Nigerian bank account.',
   '00000000-0000-4000-b000-000000000006', now() - interval '9 days'),
  ('00000000-0000-4000-f145-000000000081', '00000000-0000-4000-f144-000000000008', 1, 'Deleting your account and your data',
   E'Go to Profile, then Account, then Delete account. We remove your data within 30 days.',
   '00000000-0000-4000-b000-000000000006', now() - interval '19 days');

update public.help_articles a set current_version_id = (select v.id from public.help_article_versions v
  where v.article_id = a.id order by v.number desc limit 1)
where a.state = 'published';
update public.help_articles set related = '{00000000-0000-4000-f144-000000000003}'
where id = '00000000-0000-4000-f144-000000000001';

insert into public.help_views (article_id, at)
select a.id, now() - make_interval(hours => g % 700)
from (values ('00000000-0000-4000-f144-000000000001'::uuid, 482), ('00000000-0000-4000-f144-000000000002', 391),
             ('00000000-0000-4000-f144-000000000003', 264), ('00000000-0000-4000-f144-000000000004', 210),
             ('00000000-0000-4000-f144-000000000005', 98), ('00000000-0000-4000-f144-000000000006', 151),
             ('00000000-0000-4000-f144-000000000008', 64)) a(id, n)
cross join lateral generate_series(1, a.n) g;

insert into public.help_votes (article_id, user_id, helpful)
select a.id, ('00000000-0000-4000-a000-' || lpad(u::text, 12, '0'))::uuid, u <= a.yes
from (values ('00000000-0000-4000-f144-000000000001'::uuid, 7), ('00000000-0000-4000-f144-000000000002', 8),
             ('00000000-0000-4000-f144-000000000003', 6), ('00000000-0000-4000-f144-000000000004', 8),
             ('00000000-0000-4000-f144-000000000005', 7), ('00000000-0000-4000-f144-000000000006', 8),
             ('00000000-0000-4000-f144-000000000008', 7)) a(id, yes)
cross join generate_series(1, 9) u;
