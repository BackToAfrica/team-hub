-- Coach roles are picked when a team is created (by its creator) and when someone joins with the team code
-- (staff join requests wait for the head coach to approve them). Players are no longer promoted from the Members list.
--   Full access (is_coach): Head coach, Team owner, Manager
--   Staff access:           Assistant coach, Analyst

create or replace function public.staff_full(r text) returns boolean language sql immutable
  as $$ select coalesce(r, '') in ('Head coach', 'Team owner', 'Manager') $$;

drop function if exists public.create_team(text, text);
create or replace function public.create_team(p_name text, p_tag text default null, p_title text default 'Head coach')
returns bigint language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare me public.profiles; tid bigint; t text := coalesce(nullif(trim(p_title), ''), 'Head coach');
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Sign in first.'; end if;
  if me.team_id is not null and not me.is_admin then raise exception 'You''re already on a team. Leave it first (Account page).'; end if;
  if not public.staff_full(t) then raise exception 'Pick Head coach, Team owner or Manager.'; end if;
  p_name := trim(coalesce(p_name, ''));
  if length(p_name) < 2 or length(p_name) > 40 then raise exception 'Team name must be 2–40 characters.'; end if;
  insert into public.teams (name, tag, owner_id) values (p_name, nullif(upper(trim(coalesce(p_tag, ''))), ''), me.id) returning id into tid;
  update public.profiles set team_id = tid, is_coach = true, staff_role = t, approved = true where id = me.id;
  return tid;
end $$;

drop function if exists public.join_team(text);
create or replace function public.join_team(p_code text, p_as text default null)
returns text language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare me public.profiles; t public.teams; r text := nullif(trim(coalesce(p_as, '')), '');
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Sign in first.'; end if;
  if r is not null and r not in ('Head coach', 'Team owner', 'Manager', 'Assistant coach', 'Analyst') then raise exception 'Unknown role.'; end if;
  select * into t from public.teams where join_code = upper(trim(coalesce(p_code, '')));
  if t.id is null then raise exception 'That code doesn''t match any team. Check it with your coach.'; end if;
  if me.team_id = t.id then return t.name; end if;
  if me.team_id is not null then raise exception 'You''re already on a team. Leave it first (Account page).'; end if;
  -- everyone who joins with the code waits for the head coach; staff keep the role they asked for
  update public.profiles set team_id = t.id, approved = false, is_coach = public.staff_full(r), staff_role = r where id = me.id;
  return t.name;
end $$;

revoke execute on function public.create_team(text, text, text), public.join_team(text, text) from public, anon;
grant execute on function public.create_team(text, text, text), public.join_team(text, text) to authenticated;

-- existing head coaches get a title
update public.profiles set staff_role = 'Head coach' where is_coach and staff_role is null and team_id is not null;
