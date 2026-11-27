-- Flow 16 fix · public legal pages (rule 38). The app and the Play listing link to
-- arpedia.africa/legal/<slug>, but nothing served them. The api Worker renders the latest published
-- version of each policy; this is the one read it needs. Drafts never leave the database.
create function public.get_public_policies() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', p.slug, 'title', p.title, 'subtitle', p.subtitle, 'always_live', p.always_live,
           'version', l.version, 'published_at', l.published_at, 'body', l.body)
         order by p.sort), '[]')
  from public.policies p
  cross join lateral public._policy_latest(p.id) l
  where l.id is not null
$$;
revoke all on function public.get_public_policies() from public, anon, authenticated;
grant execute on function public.get_public_policies() to service_role;
