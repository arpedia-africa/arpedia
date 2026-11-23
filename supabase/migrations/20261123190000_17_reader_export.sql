-- Flow 17 whole-app check: reader self-export (flow 10 Server table, `export_reader_data`; OPEN-QUESTIONS
-- Q4 default: from Settings, emailed). The account journey found no way for a reader to get their data.
-- Every public table with a `user_id` column, plus the profile, so a table added by a later flow is
-- included without touching this function. Columns that hold secrets or tokens are left out.
-- Service role only: the api Worker calls it for the signed-in reader and emails a link.

create function public.export_reader_data(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_rows jsonb;
  v_out jsonb;
begin
  select jsonb_build_object(
           'exported_at', now(),
           'account', jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at),
           'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user_id))
    into v_out
  from auth.users u where u.id = p_user_id;
  if v_out is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for r in
    select c.table_name,
           coalesce(array_agg(c2.column_name::text) filter (
             where c2.column_name ~* '(token|secret|key_|_key$|hash|password|otp|ciphertext)'), '{}') as hidden
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    join information_schema.columns c2
      on c2.table_schema = c.table_schema and c2.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'user_id'
    group by c.table_name
    order by c.table_name
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]'') from public.%I x where x.user_id = $1',
      r.table_name)
      into v_rows using p_user_id, r.hidden;
    if v_rows <> '[]'::jsonb then
      v_out := v_out || jsonb_build_object(r.table_name, v_rows);
    end if;
  end loop;
  return v_out;
end $$;

-- Version 1 of `data_export_ready` (flow 15 seed) never used {{link}}, so the email carried no file.
insert into public.email_template_versions (template_key, number, subject, preheader, body)
select 'data_export_ready', coalesce(max(number), 0) + 1, 'Your Arpedia data is ready',
       'A copy of everything we keep about you',
       'Hi {{first_name}},' || chr(10) || chr(10) ||
       'Here is the copy of your Arpedia data you asked for: {{link}}' || chr(10) || chr(10) ||
       'The link works for 7 days. If you didn''t ask for this, reply to this email and we''ll look into it.' ||
       chr(10) || chr(10) || 'The Arpedia team'
from public.email_template_versions where template_key = 'data_export_ready';

revoke execute on function public.export_reader_data(uuid) from public, anon, authenticated;
grant execute on function public.export_reader_data(uuid) to service_role;
