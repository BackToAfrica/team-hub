-- Run after 20261116000000_organization_foundation.sql in the Supabase SQL Editor.
-- Read-only assertions: this script does not create users or mutate application data.
do $test$
declare
  missing_teams bigint;
  missing_memberships bigint;
  bad_owner_roles bigint;
begin
  if to_regclass('public.organizations') is null
     or to_regclass('public.organization_members') is null then
    raise exception 'Organization foundation tables are missing.';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.organization_members'::regclass) then
    raise exception 'RLS must be enabled on both organization tables.';
  end if;

  select count(*) into missing_teams
  from public.teams where organization_id is null;
  if missing_teams > 0 then
    raise exception '% teams have no organization mapping.', missing_teams;
  end if;

  select count(*) into missing_memberships
  from public.profiles p
  join public.teams t on t.id = p.team_id
  left join public.organization_members m
    on m.organization_id = t.organization_id and m.user_id = p.id
  where p.team_id is not null and m.id is null;
  if missing_memberships > 0 then
    raise exception '% team profiles have no organization membership.', missing_memberships;
  end if;

  select count(*) into bad_owner_roles
  from public.teams t
  join public.organization_members m
    on m.organization_id = t.organization_id and m.user_id = t.owner_id
  where t.owner_id is not null and m.role <> 'owner';
  if bad_owner_roles > 0 then
    raise exception '% team owners are not organization owners.', bad_owner_roles;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.teams'::regclass
      and tgname = 'teams_create_organization'
      and not tgisinternal
  ) then
    raise exception 'New-team organization trigger is missing.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_sync_organization_membership'
      and not tgisinternal
  ) then
    raise exception 'Profile membership synchronization trigger is missing.';
  end if;

  if has_table_privilege('anon', 'public.organizations', 'select')
     or has_table_privilege('anon', 'public.organization_members', 'select') then
    raise exception 'Anonymous users must not read organization data.';
  end if;

  if not has_table_privilege('authenticated', 'public.organizations', 'select')
     or not has_table_privilege('authenticated', 'public.organization_members', 'select') then
    raise exception 'Authenticated organization members need SELECT grants (RLS still scopes rows).';
  end if;

  raise notice 'Organization foundation checks passed. Teams: %, active/suspended membership rows: %.',
    (select count(*) from public.teams),
    (select count(*) from public.organization_members);
end
$test$;
