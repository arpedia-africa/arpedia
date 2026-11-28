-- Flow 14 · spec check 14-15 (rule 33): flow 03's `report_book` goes through `create_report`, so
-- every app build (also ones still calling the old RPC) gets the daily limit, reporter-age
-- eligibility, automod severity, auto-hide, the own-book refusal and, for copyright, a claim.
-- Old reasons map onto rule 3's book list (copyright, sexual, other); the old reason stays in the
-- snapshot. Same signature and return (the report id).

create or replace function public.report_book(p_book uuid, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ref text;
  v_id uuid;
begin
  if p_reason not in ('wrong_content', 'copyright', 'abuse') then
    perform public._raise('bad_reason');
  end if;
  v_ref := public.create_report('book', p_book,
    case p_reason when 'copyright' then 'copyright' else 'other' end::public.report_reason,
    coalesce(nullif(btrim(p_note), ''), case p_reason when 'wrong_content' then 'Wrong content'
                                                      when 'abuse' then 'Abuse' end));
  update public.reports set snapshot = coalesce(snapshot, '{}') || jsonb_build_object('reason', p_reason)
  where ref = v_ref returning id into v_id;
  return v_id;
end $$;
