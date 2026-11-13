-- =====================================================================
--  Team Hub — database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run again: it only creates what's missing.
-- =====================================================================

-- ---------- Members ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  ign           text,               -- in-game name; must match the name used in stats rows
  role          text default 'Flex', -- Duelist / Initiator / Controller / Sentinel / Flex
  is_igl        boolean default false,
  is_coach      boolean default false,
  is_trial      boolean default false,
  approved      boolean default false,
  visibility    jsonb not null default
    '{"checkin":true,"my_stats":true,"team_stats":true,"playbook":true,"comms":true,"reviews":true,"scouting":true,"comp_checker":true,"patch_notes":true}'::jsonb,
  created_at    timestamptz default now()
);

-- The FIRST account ever created becomes the coach automatically.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, display_name, ign, role, is_coach, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'ign',
    coalesce(new.raw_user_meta_data->>'role', 'Flex'),
    first_user,
    first_user
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Permission helpers ----------
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select approved from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_coach and approved from public.profiles where id = auth.uid()), false)
$$;

-- Can the signed-in person see a section? Coach sees everything.
create or replace function public.can_see(sec text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select approved and (is_coach or coalesce((visibility->>sec)::boolean, true))
    from public.profiles where id = auth.uid()
  ), false)
$$;

-- Normalised in-game name of the signed-in person ("Kairo *Trial" -> "kairo").
create or replace function public.norm_name(n text) returns text
language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(n, ''), '\s*\*\s*trial\s*$', '', 'i')))
$$;

create or replace function public.my_ign() returns text
language sql stable security definer set search_path = public as $$
  select public.norm_name(ign) from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_coach() or public.is_member());
drop policy if exists profiles_coach_update on public.profiles;
create policy profiles_coach_update on public.profiles for update
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists profiles_coach_delete on public.profiles;
create policy profiles_coach_delete on public.profiles for delete
  using (public.is_coach() and id <> auth.uid());

-- ---------- Content tables ----------
create table if not exists public.announcements (
  id bigserial primary key, created_at timestamptz default now(),
  title text, body text, pinned boolean default false
);

create table if not exists public.drills (
  id bigserial primary key, created_at timestamptz default now(),
  role text, block text, minutes text, drill text, how text, success text, sort int default 0
);

create table if not exists public.checkins (
  id bigserial primary key, created_at timestamptz default now(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null default current_date,
  drills_done jsonb default '[]'::jsonb,
  warmup text, role_drills text,
  minutes int, games int, rating int,
  worked_on text, takeaway text,
  unique (user_id, day)
);

create table if not exists public.matches (
  id bigserial primary key, created_at timestamptz default now(),
  date date, event text, opponent text, map text,
  rounds_won int, rounds_lost int, start_side text, vod_link text, notes text
);

create table if not exists public.player_stats (
  id bigserial primary key, created_at timestamptz default now(),
  date date, map text, player text, agent text, rounds int,
  kills int, deaths int, assists int, kd numeric,
  hs_kills int, hs_kill_pct numeric, true_hs_pct numeric,
  first_kills int, first_deaths int, source text, notes text
);

create table if not exists public.utility_usage (
  id bigserial primary key, created_at timestamptz default now(),
  date date, map text, player text, agent text, rounds int,
  util_per_round numeric, q_casts int, e_casts int, c_casts int,
  ults_used int, ults_available int, died_with_util int,
  util_before_fight numeric, source text, notes text
);

create table if not exists public.set_plays (
  id bigserial primary key, created_at timestamptz default now(),
  play_name text, map text, side text, type text, valoplant text, site text, how text,
  duelist_job text, initiator_job text, controller_job text, sentinel_job text, flex_job text,
  seen_in text, taken_from text
);

create table if not exists public.pistol_rounds (
  id bigserial primary key, created_at timestamptz default now(),
  date date, team text, map text, side text, round text, result text,
  loadouts text, setup text, utility text, timeline text, why text,
  how_we_run text, how_to_beat text, set_play text, valoplant text, watch text, taken_from text
);

create table if not exists public.guides (
  id bigserial primary key, created_at timestamptz default now(),
  section text default 'comms', title text, body text, sort int default 0
);

create table if not exists public.reviews (
  id bigserial primary key, created_at timestamptz default now(),
  date date, title text, opponent text, type text, map text, vod text, link text, summary text, body text
);

create table if not exists public.opponent_scouting (
  id bigserial primary key, created_at timestamptz default now(),
  date date, opponent text, map text, veto text, source text, pistol_plan text,
  fav_attack_site text, defense_setup text, after_losing text, first_fights text,
  star_player text, weakness text, notes text
);

create table if not exists public.comp_notes (
  id bigserial primary key, created_at timestamptz default now(),
  date date, a1 text, a2 text, a3 text, a4 text, a5 text, map text,
  team text, result text, weaknesses text, watch text
);

create table if not exists public.agent_counters (
  id bigserial primary key, created_at timestamptz default now(),
  agent text unique, role text, brings text, weaknesses text,
  beat_attack text, beat_defense text, counters text,
  smokes text, flash text, recon text, stall text, entry text, heal text,
  seen text, updated text
);

create table if not exists public.patch_notes (
  id bigserial primary key, created_at timestamptz default now(),
  patch text, date date, category text, item text, effect text, changed text, coach_notes text
);

-- ---------- Row-level security for content ----------
-- Everyone who is approved can read a table if the coach lets them see its section.
-- Only the coach can add, change or delete rows.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('announcements', null),
    ('drills',        null),
    ('matches',       'team_stats'),
    ('set_plays',     'playbook'),
    ('pistol_rounds', 'playbook'),
    ('reviews',       'reviews'),
    ('opponent_scouting','scouting'),
    ('comp_notes',    'scouting'),
    ('agent_counters','comp_checker'),
    ('patch_notes',   'patch_notes')
  ) as v(tbl, sec)
  loop
    execute format('alter table public.%I enable row level security', t.tbl);
    execute format('drop policy if exists %I on public.%I', t.tbl || '_read', t.tbl);
    if t.sec is null then
      execute format('create policy %I on public.%I for select using (public.is_member())', t.tbl || '_read', t.tbl);
    else
      execute format('create policy %I on public.%I for select using (public.can_see(%L))', t.tbl || '_read', t.tbl, t.sec);
    end if;
    execute format('drop policy if exists %I on public.%I', t.tbl || '_coach', t.tbl);
    execute format('create policy %I on public.%I for all using (public.is_coach()) with check (public.is_coach())', t.tbl || '_coach', t.tbl);
  end loop;
end $$;

-- Guides: each guide's own section decides who sees it.
alter table public.guides enable row level security;
drop policy if exists guides_read on public.guides;
create policy guides_read on public.guides for select using (public.can_see(coalesce(section, 'comms')));
drop policy if exists guides_coach on public.guides;
create policy guides_coach on public.guides for all using (public.is_coach()) with check (public.is_coach());

-- Stats: a player sees their own rows (if "My stats" is on) or everyone's (if "Team stats" is on).
alter table public.player_stats enable row level security;
drop policy if exists player_stats_read on public.player_stats;
create policy player_stats_read on public.player_stats for select using (
  public.can_see('team_stats')
  or (public.can_see('my_stats') and public.norm_name(player) = public.my_ign())
);
drop policy if exists player_stats_coach on public.player_stats;
create policy player_stats_coach on public.player_stats for all using (public.is_coach()) with check (public.is_coach());

alter table public.utility_usage enable row level security;
drop policy if exists utility_usage_read on public.utility_usage;
create policy utility_usage_read on public.utility_usage for select using (
  public.can_see('team_stats')
  or (public.can_see('my_stats') and public.norm_name(player) = public.my_ign())
);
drop policy if exists utility_usage_coach on public.utility_usage;
create policy utility_usage_coach on public.utility_usage for all using (public.is_coach()) with check (public.is_coach());

-- Check-ins: players read and write only their own; the coach sees everyone's.
alter table public.checkins enable row level security;
drop policy if exists checkins_read on public.checkins;
create policy checkins_read on public.checkins for select
  using (user_id = auth.uid() or public.is_coach());
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert
  with check (user_id = auth.uid() and public.can_see('checkin'));
drop policy if exists checkins_update on public.checkins;
create policy checkins_update on public.checkins for update
  using (user_id = auth.uid() and public.can_see('checkin'))
  with check (user_id = auth.uid());
drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins for delete
  using (user_id = auth.uid() or public.is_coach());
