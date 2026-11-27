-- Flow 16 · spec check 16-4 (rule 22). The console calls Supabase from its Next.js server, so the
-- PostgREST headers write_audit read were the server's: every console entry recorded a Vercel
-- address and the server's user agent. The console now forwards the staff browser's own as
-- x-client-ip, x-client-user-agent and x-client-request-id (apps/admin/lib/supabase/client-context.ts);
-- write_audit prefers them and falls back to the connection's headers (the app, the desk CLI and
-- direct calls). Like the user agent, they come from the caller: a staff member could only
-- misstate their own entries' details, never who acted (actor_id is the JWT's). Same signature.
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
                                mfa_verified_at)
  select v_uid, p.full_name, s.role, p_area, p_action, p_object_type, p_object_id,
         p_object_label, p_summary, p_before, p_after, p_reason,
         left(coalesce(nullif(h ->> 'x-client-request-id', ''), h ->> 'x-request-id', h ->> 'cf-ray'), 200),
         v_ip,
         left(coalesce(nullif(h ->> 'x-client-user-agent', ''), h ->> 'user-agent'), 300),
         case when v_uid is not null then public.staff_mfa_verified_at() end
  from (select 1) one
  left join public.profiles p on p.id = v_uid
  left join public.staff_roles s on s.user_id = v_uid
  returning id into v_id;
  return v_id;
end $$;
