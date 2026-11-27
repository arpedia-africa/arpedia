-- Spec check 16-29 · rule 17: two-person approval requests expire after 7 days. Nothing moved them:
-- decide_approval marked one expired and then raised, which rolled the mark back, so stale requests
-- stayed "pending" in every waiting list. A job now expires them every 15 minutes (pg_cron).
create function public.job_expire_approvals() returns integer
language sql security definer set search_path = '' as $$
  with expired as (
    update public.approval_requests set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning 1
  )
  select count(*)::int from expired
$$;
revoke all on function public.job_expire_approvals() from public, anon, authenticated;

select cron.schedule('expire_approvals', '*/15 * * * *', 'select public.job_expire_approvals()');
