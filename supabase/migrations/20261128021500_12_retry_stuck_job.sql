-- Flow 12 · spec check 12-14 (Admin: Operations admin, "retry a stuck job"). A revision that has
-- been processing with no new step for 10 minutes (usually 1 to 3) can be retried from Books ·
-- Processing by an Operations admin (or Super admin). The retry sends its current stage again
-- (verify while checking, seal after submit) for the same generation, so a run still going is
-- harmless: complete_verify and complete_seal ignore a result that is no longer wanted.

create function public.staff_retry_revision(p_rev uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(null, array['operations_admin']::public.staff_role[], 'staff_retry_revision');
  v_rev public.book_revisions;
  v_stage text;
  v_since timestamptz;
begin
  v_rev := public._lock_revision(p_rev);
  if v_rev.status <> 'processing' then
    perform public._raise('not_processing', jsonb_build_object('status', v_rev.status));
  end if;
  -- When it last moved: its newest step, else when it was created.
  v_since := coalesce((select max(v.value::timestamptz) from jsonb_each_text(v_rev.steps) v), v_rev.created_at);
  if v_since > now() - interval '10 minutes' then
    perform public._raise('not_stuck', jsonb_build_object('since', v_since));
  end if;
  v_stage := case when v_rev.draft_step = 'checking' then 'verify'
                  when v_rev.draft_step is null and v_rev.sealed_generation is distinct from v_rev.generation
                    then 'seal' end;
  if v_stage is null then
    perform public._raise('nothing_to_retry');
  end if;
  perform pgmq.send('book_verify', jsonb_build_object('revision_id', p_rev, 'stage', v_stage,
                                                      'generation', v_rev.generation));
  perform public._audit(v_actor, 'books', 'book.retry_job', 'book_revision', p_rev::text,
    (select b.title from public.books b where b.id = v_rev.book_id),
    format('Retried the %s step (no progress since %s)', v_stage, to_char(v_since at time zone 'Africa/Lagos', 'HH24:MI')),
    null, jsonb_build_object('stage', v_stage, 'generation', v_rev.generation, 'since', v_since));
  return jsonb_build_object('stage', v_stage, 'generation', v_rev.generation);
end $$;

revoke execute on function public.staff_retry_revision(uuid) from public, anon, service_role;
grant execute on function public.staff_retry_revision(uuid) to authenticated;
