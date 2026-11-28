-- Flow 16 · spec check 16-27 (place half): the audit log shows where a staff action came from, as
-- the prototype's "IP and place" (list: "105.112.34.18 · Lagos"; entry: "· Lagos, Nigeria").
-- The console forwards the staff browser's city and country from its host's geolocation headers as
-- x-client-city and x-client-country (apps/admin/lib/supabase/client-context.ts), beside the
-- address it already forwards (16_audit_client). Like the address they come from the caller: a
-- staff member could only misstate their own entries' place, never who acted. Older entries and
-- calls without the headers keep no place. list_audit adds `city`; get_audit_entry already returns
-- every column. Same signatures, so every caller and grant stays as it was.
-- Monthly partitions (the rest of 16-27) are left for later: see SPEC-CHECK.

alter table public.audit_log add column city text, add column country text
  check (country ~ '^[A-Z]{2}$');

create or replace function public.write_audit(
  p_area text,
  p_action text,
  p_object_type text default null,
  p_object_id text default null,
  p_object_label text default null,
  p_summary text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_uid uuid := auth.uid();
  h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_ip inet := coalesce(
    public._try_inet(trim(h ->> 'x-client-ip')),
    public._try_inet(trim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-forwarded-for', ''), ',', 1))));
  v_city text := nullif(left(btrim(regexp_replace(coalesce(h ->> 'x-client-city', ''), '[[:cntrl:]]', '', 'g')), 80), '');
  v_country text := case when upper(btrim(coalesce(h ->> 'x-client-country', ''))) ~ '^[A-Z]{2}$'
                         then upper(btrim(h ->> 'x-client-country')) end;
begin
  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'write_audit: not allowed' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.is_staff() then
    raise exception 'write_audit: staff only' using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (actor_id, actor_name, actor_role, area, action, object_type, object_id,
                                object_label, summary, before, after, reason, request_id, ip, device,
                                mfa_verified_at, city, country)
  select v_uid, p.full_name, s.role, p_area, p_action, p_object_type, p_object_id,
         p_object_label, p_summary, p_before, p_after, p_reason,
         left(coalesce(nullif(h ->> 'x-client-request-id', ''), h ->> 'x-request-id', h ->> 'cf-ray'), 200),
         v_ip,
         left(coalesce(nullif(h ->> 'x-client-user-agent', ''), h ->> 'user-agent'), 300),
         case when v_uid is not null then public.staff_mfa_verified_at() end,
         v_city, v_country
  from (select 1) one
  left join public.profiles p on p.id = v_uid
  left join public.staff_roles s on s.user_id = v_uid
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.list_audit(p_actor uuid default null, p_area text default null, p_action text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_q text default null,
  p_page integer default 1, p_per integer default 25)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_per integer := least(greatest(coalesce(p_per, 25), 10), 50);
  v_from timestamptz := coalesce(p_from, now() - interval '7 days');
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.has_permission('view_audit') then
    raise exception 'Not allowed: view_audit' using errcode = 'insufficient_privilege';
  end if;
  return (
    with m as (
      select a.* from public.audit_log a
      where a.at >= v_from and (p_to is null or a.at < p_to)
        and (p_actor is null or a.actor_id = p_actor)
        and (p_area is null or a.area = p_area)
        and (p_action is null or a.action like p_action || '%')
        and (v_q is null or a.summary ilike '%' || v_q || '%' or a.object_label ilike '%' || v_q || '%'
             or a.action ilike '%' || v_q || '%' or a.actor_name ilike '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'actor_id', x.actor_id,
                 'actor_name', x.actor_name, 'actor_role', x.actor_role, 'area', x.area, 'action', x.action,
                 'object_type', x.object_type, 'object_id', x.object_id, 'object_label', x.object_label,
                 'summary', x.summary, 'ip', host(x.ip), 'city', x.city) order by x.at desc, x.id desc)
               from (select * from m order by at desc, id desc
                     limit v_per offset (greatest(coalesce(p_page, 1), 1) - 1) * v_per) x), '[]'),
      'actors', coalesce((select jsonb_agg(distinct jsonb_build_object('id', a.actor_id, 'name', a.actor_name))
                 from public.audit_log a where a.actor_id is not null and a.at >= now() - interval '90 days'), '[]'))
  );
end $$;
