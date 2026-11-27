-- Spec check 16-29: pending approval requests past their 7 days are moved to expired by a job.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email)
select ('16290000-0000-4000-a000-00000000000' || n)::uuid, 'ap' || n || '@t1629.local' from generate_series(1, 2) n;
insert into public.approval_requests (id, kind, requested_by, created_at, expires_at) values
  ('16290000-0000-4000-b000-000000000001', 'pii_export', '16290000-0000-4000-a000-000000000001',
   now() - interval '8 days', now() - interval '1 day'),
  ('16290000-0000-4000-b000-000000000002', 'pii_export', '16290000-0000-4000-a000-000000000001',
   now() - interval '1 day', now() + interval '6 days');
insert into public.approval_requests (id, kind, requested_by, approver_id, status, decided_at, created_at, expires_at)
values ('16290000-0000-4000-b000-000000000003', 'pii_export', '16290000-0000-4000-a000-000000000001',
        '16290000-0000-4000-a000-000000000002', 'approved', now() - interval '7 days', now() - interval '9 days',
        now() - interval '2 days');

select ok(public.job_expire_approvals() >= 1, 'the job expires something');
select is((select status from public.approval_requests where id = '16290000-0000-4000-b000-000000000001'), 'expired',
  'a request past its 7 days is expired');
select is((select status from public.approval_requests where id = '16290000-0000-4000-b000-000000000002'), 'pending',
  'a fresh request stays pending');
select is((select status from public.approval_requests where id = '16290000-0000-4000-b000-000000000003'), 'approved',
  'a decided request is left alone');
select ok(exists (select 1 from cron.job where jobname = 'expire_approvals' and schedule = '*/15 * * * *'),
  'it runs every 15 minutes');

select * from finish();
rollback;
