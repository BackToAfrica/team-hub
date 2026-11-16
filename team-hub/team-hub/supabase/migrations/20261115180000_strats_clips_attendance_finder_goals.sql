-- Strat board, clip library, attendance, scrim finder, personal goals, personal kill maps, Discord scrim summaries.

-- Strat board: drawn setups (players, utility, arrows) step by step on a minimap. Team reads, staff edits.
create table if not exists public.strats (
  id bigint generated always as identity primary key,
  team_id bigint not null default public.my_team() references public.teams(id) on delete cascade,
  map text, side text, title text not null, notes text,
  steps jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists strats_team_idx on public.strats (team_id, map);
alter table public.strats enable row level security;
create policy strats_select on public.strats for select to authenticated using (team_id = (select public.my_team()) and (select public.is_member()));
create policy strats_insert on public.strats for insert to authenticated with check (team_id = (select public.my_team()) and (select public.is_staff()));
create policy strats_update on public.strats for update to authenticated using (team_id = (select public.my_team()) and (select public.is_staff())) with check (team_id = (select public.my_team()));
create policy strats_delete on public.strats for delete to authenticated using (team_id = (select public.my_team()) and (select public.is_staff()));

-- Clip library: tagged moments in VOD reviews. Staff see all; a player sees clips tagged with their name.
create table if not exists public.clips (
  id bigint generated always as identity primary key,
  team_id bigint not null default public.my_team() references public.teams(id) on delete cascade,
  review_id bigint not null references public.reviews(id) on delete cascade,
  t integer not null default 0, tags text[] not null default '{}', player text, note text, vod text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists clips_team_idx on public.clips (team_id, created_at desc);
create index if not exists clips_review_idx on public.clips (review_id);
alter table public.clips enable row level security;
create policy clips_select on public.clips for select to authenticated using (team_id = (select public.my_team()) and ((select public.is_staff()) or ((select public.is_member()) and public.norm_name(player) = (select public.my_ign()))));
create policy clips_insert on public.clips for insert to authenticated with check (team_id = (select public.my_team()) and (select public.is_staff()));
create policy clips_update on public.clips for update to authenticated using (team_id = (select public.my_team()) and (select public.is_staff())) with check (team_id = (select public.my_team()));
create policy clips_delete on public.clips for delete to authenticated using (team_id = (select public.my_team()) and (select public.is_staff()));

-- Attendance: who showed up (on time / late / absent / excused) for scrims, practice and matches.
create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  team_id bigint not null default public.my_team() references public.teams(id) on delete cascade,
  day date not null, kind text not null default 'Scrim', scrim_id bigint references public.scrims(id) on delete set null,
  player text not null, status text not null check (status in ('On time', 'Late', 'Absent', 'Excused')),
  minutes_late integer, note text, created_at timestamptz not null default now()
);
create unique index if not exists attendance_unique on public.attendance (team_id, day, kind, player);
alter table public.attendance enable row level security;
create policy attendance_select on public.attendance for select to authenticated using (team_id = (select public.my_team()) and ((select public.is_staff()) or ((select public.is_member()) and public.norm_name(player) = (select public.my_ign()))));
create policy attendance_insert on public.attendance for insert to authenticated with check (team_id = (select public.my_team()) and (select public.is_staff()));
create policy attendance_update on public.attendance for update to authenticated using (team_id = (select public.my_team()) and (select public.is_staff())) with check (team_id = (select public.my_team()));
create policy attendance_delete on public.attendance for delete to authenticated using (team_id = (select public.my_team()) and (select public.is_staff()));

-- Scrim finder: teams post open scrim times; any team's staff can see open posts and book one.
create table if not exists public.scrim_posts (
  id bigint generated always as identity primary key,
  team_id bigint not null default public.my_team() references public.teams(id) on delete cascade,
  starts_at timestamptz not null, maps text, format text, region text, level text, note text,
  status text not null default 'open' check (status in ('open', 'booked', 'cancelled')),
  booked_team_id bigint references public.teams(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists scrim_posts_open_idx on public.scrim_posts (status, starts_at);
alter table public.scrim_posts enable row level security;
create policy scrim_posts_select on public.scrim_posts for select to authenticated
  using ((select public.is_staff()) and (status = 'open' or team_id = (select public.my_team()) or booked_team_id = (select public.my_team())));
create policy scrim_posts_insert on public.scrim_posts for insert to authenticated with check (team_id = (select public.my_team()) and (select public.is_staff()) and status = 'open' and booked_team_id is null);
create policy scrim_posts_update on public.scrim_posts for update to authenticated using (team_id = (select public.my_team()) and (select public.is_staff())) with check (team_id = (select public.my_team()));
create policy scrim_posts_delete on public.scrim_posts for delete to authenticated using (team_id = (select public.my_team()) and (select public.is_staff()));

-- names of the teams behind visible posts (staff only)
create or replace function public.scrim_post_teams()
returns table (id bigint, name text, tag text) language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select t.id, t.name, t.tag from public.teams t
  where public.is_staff() and t.id in (select p.team_id from public.scrim_posts p where p.status = 'open' or p.booked_team_id = public.my_team()
                                       union select p.booked_team_id from public.scrim_posts p where p.team_id = public.my_team() and p.booked_team_id is not null);
$$;

-- book an open post: both teams get the scrim on their schedule
create or replace function public.book_scrim_post(p_id bigint)
returns text language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare p public.scrim_posts; me bigint := public.my_team(); host text; guest text;
begin
  if me is null or not public.is_staff() then raise exception 'Only coaches and staff can book scrims.'; end if;
  select * into p from public.scrim_posts where id = p_id for update;
  if p.id is null or p.status <> 'open' then raise exception 'That scrim is no longer open.'; end if;
  if p.team_id = me then raise exception 'That''s your own post.'; end if;
  if p.starts_at < now() then raise exception 'That time has already passed.'; end if;
  select name into host from public.teams where id = p.team_id;
  select name into guest from public.teams where id = me;
  update public.scrim_posts set status = 'booked', booked_team_id = me where id = p.id;
  insert into public.scrims (team_id, starts_at, opponent, maps, format, notes, status) values
    (p.team_id, p.starts_at, guest, p.maps, p.format, 'Booked through the scrim finder.' || coalesce(' ' || p.note, ''), 'Planned'),
    (me, p.starts_at, host, p.maps, p.format, 'Booked through the scrim finder.' || coalesce(' ' || p.note, ''), 'Planned');
  return host;
end $$;
revoke execute on function public.scrim_post_teams(), public.book_scrim_post(bigint) from public, anon;
grant execute on function public.scrim_post_teams(), public.book_scrim_post(bigint) to authenticated;

-- Personal goals (streak page): each player's own targets; staff can read their team's.
create table if not exists public.player_goals (
  id bigint generated always as identity primary key,
  team_id bigint default public.my_team() references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  title text not null, metric text, target numeric, deadline date, done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists player_goals_user_idx on public.player_goals (user_id);
alter table public.player_goals enable row level security;
create policy player_goals_select on public.player_goals for select to authenticated using (user_id = (select auth.uid()) or (team_id = (select public.my_team()) and (select public.is_staff())));
create policy player_goals_insert on public.player_goals for insert to authenticated with check (user_id = (select auth.uid()) and team_id = (select public.my_team()));
create policy player_goals_update on public.player_goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy player_goals_delete on public.player_goals for delete to authenticated using (user_id = (select auth.uid()));

-- Personal kill maps: positions from each player's own games (owner-only like the rest of riot_matches).
alter table public.riot_matches add column if not exists events jsonb;
-- Discord scrim summaries: post once per imported scrim.
alter table public.matches add column if not exists discord_posted_at timestamptz;
alter table public.team_discord add column if not exists post_scrims boolean not null default true;

create or replace function public.set_discord_scrim_posts(p_on boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can change Discord settings.'; end if;
  update public.team_discord set post_scrims = coalesce(p_on, true), updated_at = now(), updated_by = auth.uid() where team_id = public.my_team();
end $$;
revoke execute on function public.set_discord_scrim_posts(boolean) from public, anon;
grant execute on function public.set_discord_scrim_posts(boolean) to authenticated;

create or replace function public.discord_status()
returns json language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when public.is_coach() then coalesce(
    (select json_build_object('connected', true, 'mention', d.mention, 'hint', right(d.webhook_url, 4), 'updated_at', d.updated_at,
       'remind_day', d.remind_day, 'remind_hour', d.remind_hour, 'remind_avail', d.remind_avail, 'post_scrims', d.post_scrims)
     from public.team_discord d where d.team_id = public.my_team()),
    json_build_object('connected', false)) end;
$$;
