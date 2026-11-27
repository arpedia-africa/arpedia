-- Flow 12 · spec check 12-3 (rules 24, 25). The verify Worker now runs the plagiarism and
-- content-policy checks through provider adapters (20 s timeout). Their flags go in with the other
-- verify flags; how each check went is kept on the revision so Quick review can say "skipped", and
-- a check that timed out or failed (not one with no provider set up) alerts Operations admin once
-- per upload.

alter table public.book_revisions add column screening jsonb not null default '{}';

-- p_checks: {plagiarism: {status: ok|skipped, reason?}, policy: {...}}. Ignored for an old generation.
create function public.record_screening(p_rev uuid, p_generation int, p_checks jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_failed text[];
begin
  perform public._require_service('record_screening');
  v_rev := public._lock_revision(p_rev);
  if v_rev.generation <> p_generation or v_rev.status <> 'processing' then
    return false;
  end if;
  if jsonb_typeof(p_checks) <> 'object' then
    raise exception 'record_screening: checks must be an object' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_failed
  from jsonb_each(p_checks) c(k, v)
  where k in ('plagiarism', 'policy') and v ->> 'status' = 'skipped'
    and v ->> 'reason' in ('timeout', 'provider_error');
  update public.book_revisions set screening = jsonb_build_object(
      'plagiarism', p_checks -> 'plagiarism', 'policy', p_checks -> 'policy', 'at', now(), 'generation', p_generation)
  where id = p_rev;
  if cardinality(v_failed) > 0 then
    perform public._notify('screening_skipped', jsonb_build_object('revision_id', p_rev, 'book_id', v_rev.book_id,
      'role', 'operations_admin', 'checks', to_jsonb(v_failed)));
  end if;
  return true;
end $$;

revoke execute on function public.record_screening(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.record_screening(uuid, int, jsonb) to service_role;
