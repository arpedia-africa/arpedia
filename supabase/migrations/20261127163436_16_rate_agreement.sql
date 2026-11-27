-- Flow 16 · spec check 16-20 (open question 3, default yes): changing the author rate creates a
-- new Author agreement version that authors must accept again.
-- When a pricing rules version comes into effect (apply_pricing_rules sets applied_at) with an
-- author rate different from the rules it replaces, the latest published Author agreement is
-- published again as the next version, with the rate in its text and subtitle updated, a
-- "what changed" summary and Accept again on. Authors then see the full-screen notice on next app
-- open (get_pending_policies). The Super admin who saved the rules is the publisher in the audit.
-- A scheduled change that is undone never comes into effect, so it publishes nothing.

create or replace function public._naira(p_kobo numeric) returns text
language sql immutable set search_path = '' as $$
  select '₦' || to_char(p_kobo / 100.0, 'FM999,999,990.00')
$$;
revoke all on function public._naira(numeric) from public, anon, authenticated;

create or replace function public._author_rate_agreement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_old_rate numeric;
  v_new_rate numeric := (new.rules ->> 'author_rate_kobo')::numeric;
  p public.policies;
  l public.policy_versions;
  v_summary text;
  v_id uuid;
begin
  select r.rules into v_old from public.pricing_rule_versions r
    where r.id <> new.id and r.applied_at is not null and r.cancelled_at is null
      and (r.effective_at, r.created_at) < (new.effective_at, new.created_at)
    order by r.effective_at desc, r.created_at desc limit 1;
  v_old_rate := (v_old ->> 'author_rate_kobo')::numeric;
  if v_old_rate is null or v_new_rate is null or v_old_rate = v_new_rate then
    return null;
  end if;
  select * into p from public.policies where slug = 'author-agreement';
  if p.id is null then
    return null;
  end if;
  l := public._policy_latest(p.id);
  v_summary := format('The author rate changes from %s to %s per credit spent, from %s.',
    public._naira(v_old_rate), public._naira(v_new_rate),
    to_char(new.effective_at at time zone 'Africa/Lagos', 'FMDD Mon YYYY'));
  insert into public.policy_versions (policy_id, version, body, change_summary, accept_again, status,
                                      edited_by, published_at, published_by)
  values (p.id, coalesce(l.version, 0) + 1,
          replace(coalesce(l.body, p.title), public._naira(v_old_rate), public._naira(v_new_rate)),
          v_summary, true, 'published', new.changed_by, now(), new.changed_by)
  returning id into v_id;
  update public.policies set subtitle = replace(subtitle, public._naira(v_old_rate), public._naira(v_new_rate))
    where id = p.id;
  perform public._audit_as(new.changed_by, 'settings', 'policy.publish', 'policy', p.slug, p.title,
    format('%s v%s published (author rate change)', p.title, coalesce(l.version, 0) + 1),
    jsonb_build_object('version', l.version),
    jsonb_build_object('version', coalesce(l.version, 0) + 1, 'change_summary', v_summary, 'accept_again', true,
                       'pricing_rules_version', new.version),
    null);
  return null;
end $$;
revoke all on function public._author_rate_agreement() from public, anon, authenticated;

create trigger pricing_rules_author_agreement
  after update of applied_at on public.pricing_rule_versions
  for each row when (old.applied_at is null and new.applied_at is not null and new.cancelled_at is null)
  execute function public._author_rate_agreement();
