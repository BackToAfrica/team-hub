-- Organization foundation: additive, legacy-safe transition.
-- Existing team_id ownership remains unchanged. Each legacy team receives its own
-- organization; no teams or player records are merged or reassigned.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  slug text,
  created_by uuid references public.profiles(id) on delete set null,
  legacy_team_id bigint unique references public.teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organizations_slug_unique
  on public.organizations (lower(slug)) where slug is not null;

create table if not exists public.organization_members (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player'
    check (role in ('owner','org_admin','general_manager','head_coach','coach','analyst','player','guest')),
  status text not null default 'active'
    check (status in ('invited','active','suspended')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.teams
  add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;

create index if not exists teams_organization_id_idx
  on public.teams (organization_id);
create index if not exists organization_members_user_org_idx
  on public.organization_members (user_id, organization_id);
create index if not exists organization_members_org_role_idx
  on public.organization_members (organization_id, role)
  where status = 'active';

-- One organization per existing team. Keep every original team id and team_id
-- foreign key intact. Existing team owners become organization owners.
insert into public.organizations (name, created_by, legacy_team_id)
select left(coalesce(nullif(trim(t.name), ''), 'Team') || ' Organization', 80),
       t.owner_id, t.id
from public.teams t
where t.organization_id is null
on conflict (legacy_team_id) do nothing;

update public.teams t
set organization_id = o.id
from public.organizations o
where o.legacy_team_id = t.id
  and t.organization_id is null;

-- Preserve existing team membership while creating the corresponding org-level
-- membership. Staff permissions remain team-scoped in the legacy app for now.
insert into public.organization_members
  (organization_id, user_id, role, status, invited_by)
select t.organization_id,
       p.id,
       case
         when t.owner_id = p.id then 'owner'
         when coalesce(p.is_admin, false) then 'org_admin'
         when coalesce(p.is_coach, false) then 'head_coach'
         when p.staff_role ilike '%analyst%' then 'analyst'
         when p.staff_role is not null then 'coach'
         else 'player'
       end,
       case when p.approved then 'active' else 'suspended' end,
       t.owner_id
from public.profiles p
join public.teams t on t.id = p.team_id
where t.organization_id is not null
on conflict (organization_id, user_id) do nothing;

-- New teams receive a dedicated organization automatically. This preserves the
-- existing create_team() RPC and does not require a browser-side service key.
create or replace function public.create_organization_for_new_team()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare new_org_id uuid;
begin
  if new.organization_id is not null then
    return new;
  end if;

  insert into public.organizations (name, created_by, legacy_team_id)
  values (left(coalesce(nullif(trim(new.name), ''), 'Team') || ' Organization', 80),
          new.owner_id, new.id)
  on conflict (legacy_team_id) do update
    set name = excluded.name
  returning id into new_org_id;

  update public.teams
     set organization_id = new_org_id
   where id = new.id and organization_id is null;

  if new.owner_id is not null then
    insert into public.organization_members (organization_id, user_id, role, status)
    values (new_org_id, new.owner_id, 'owner', 'active')
    on conflict (organization_id, user_id) do nothing;
  end if;

  return new;
end
$function$;

drop trigger if exists teams_create_organization on public.teams;
create trigger teams_create_organization
after insert on public.teams
for each row execute function public.create_organization_for_new_team();

-- Keep membership checks inside trusted database functions; never authorize from
-- user-editable profile metadata or client-supplied role values.
create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
$function$;

create or replace function public.has_organization_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(coalesce(p_roles, array[]::text[]))
  )
$function$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

revoke all on table public.organizations from anon, authenticated;
grant select on table public.organizations to authenticated;
grant update (name, slug, updated_at) on table public.organizations to authenticated;

revoke all on table public.organization_members from anon, authenticated;
grant select on table public.organization_members to authenticated;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read
on public.organizations for select to authenticated
using (public.is_organization_member(id));

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
on public.organizations for update to authenticated
using (public.has_organization_role(id, array['owner','org_admin']))
with check (public.has_organization_role(id, array['owner','org_admin']));

drop policy if exists organization_members_read on public.organization_members;
create policy organization_members_read
on public.organization_members for select to authenticated
using (
  user_id = auth.uid()
  or public.has_organization_role(organization_id, array['owner','org_admin','general_manager'])
);

revoke all on function public.create_organization_for_new_team() from public, anon, authenticated;
revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.has_organization_role(uuid, text[]) from public, anon;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;

commit;
