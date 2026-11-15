-- Kill maps, opponent scouting from Riot IDs, Discord reminders.

-- 1) Kill positions on Riot-imported games (compact rows, see riot-sync killEvents()).
alter table public.matches add column if not exists kills jsonb;

-- 2) Scouting runs: what we found about an opponent's players from their Riot IDs. Staff only.
create table if not exists public.opponent_scouts (
  id         bigint generated always as identity primary key,
  team_id    bigint not null references public.teams(id) on delete cascade,
  opponent   text not null,
  riot_ids   text[] not null default '{}',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists opponent_scouts_team_idx on public.opponent_scouts (team_id, created_at desc);
alter table public.opponent_scouts enable row level security;
drop policy if exists opponent_scouts_read on public.opponent_scouts;
create policy opponent_scouts_read on public.opponent_scouts for select to authenticated
  using (team_id = (select public.my_team()) and (select public.is_staff()));
drop policy if exists opponent_scouts_delete on public.opponent_scouts;
create policy opponent_scouts_delete on public.opponent_scouts for delete to authenticated
  using (team_id = (select public.my_team()) and (select public.is_staff()));
revoke insert, update on public.opponent_scouts from anon, authenticated;
grant select, delete on public.opponent_scouts to authenticated;

-- 3) Reminders posted to the team's Discord webhook by the 20-minute cron.
alter table public.scrims add column if not exists reminded_day_at timestamptz;
alter table public.scrims add column if not exists reminded_hour_at timestamptz;
alter table public.team_discord add column if not exists remind_day boolean not null default true;
alter table public.team_discord add column if not exists remind_hour boolean not null default true;
alter table public.team_discord add column if not exists remind_avail boolean not null default false;
alter table public.team_discord add column if not exists avail_nudged_on date;

create or replace function public.set_discord_reminders(p_day boolean, p_hour boolean, p_avail boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can change Discord settings.'; end if;
  update public.team_discord set remind_day = coalesce(p_day, remind_day), remind_hour = coalesce(p_hour, remind_hour),
    remind_avail = coalesce(p_avail, remind_avail), updated_at = now(), updated_by = auth.uid()
  where team_id = public.my_team();
end $$;
revoke execute on function public.set_discord_reminders(boolean, boolean, boolean) from public, anon;
grant execute on function public.set_discord_reminders(boolean, boolean, boolean) to authenticated;

create or replace function public.discord_status()
returns json language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when public.is_coach() then coalesce(
    (select json_build_object('connected', true, 'mention', d.mention, 'hint', right(d.webhook_url, 4), 'updated_at', d.updated_at,
       'remind_day', d.remind_day, 'remind_hour', d.remind_hour, 'remind_avail', d.remind_avail) from public.team_discord d where d.team_id = public.my_team()),
    json_build_object('connected', false)) end;
$$;
