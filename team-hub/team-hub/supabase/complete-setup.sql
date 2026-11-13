-- Team Hub complete database setup snapshot
-- Generated from the connected live project on 2026-11-13.
-- Schema-only: no player accounts, team records, scrims, VODs, stats, or other user data.
--
-- Prerequisites: a fresh Supabase project with the standard auth schema and roles.
-- Run this file in the Supabase SQL Editor as the postgres role.
-- This is a clean-install snapshot, not an incremental migration for an existing database.
--
-- The app's public team profile is intentionally exposed only through public.public_team(text).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role;

-- Profiles must exist before the temporary my_team() stub used by tenant-scoped defaults.


CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  ign text,
  role text DEFAULT 'Flex'::text,
  is_igl boolean DEFAULT false,
  is_coach boolean DEFAULT false,
  is_trial boolean DEFAULT false,
  approved boolean DEFAULT false,
  visibility jsonb DEFAULT '{"comms": true, "checkin": true, "reviews": true, "my_stats": true, "playbook": true, "scouting": true, "team_stats": true, "patch_notes": true, "comp_checker": true}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  discord text,
  discord_id text,
  avatar_url text,
  team_id bigint,
  is_admin boolean DEFAULT false NOT NULL,
  staff_role text,
  riot_id text,
  rank text,
  rank_rr integer,
  peak_rank text,
  rank_updated date
);

CREATE OR REPLACE FUNCTION public.my_team() RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT NULL::bigint $$;

CREATE TABLE public.agent_counters (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  agent text,
  role text,
  brings text,
  weaknesses text,
  beat_attack text,
  beat_defense text,
  counters text,
  smokes text,
  flash text,
  recon text,
  stall text,
  entry text,
  heal text,
  seen text,
  updated text
);

CREATE TABLE public.aim_logs (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  user_id uuid DEFAULT auth.uid(),
  date date DEFAULT CURRENT_DATE NOT NULL,
  kind text,
  scenario text,
  score numeric,
  accuracy numeric,
  notes text
);

CREATE TABLE public.announcements (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  title text,
  body text,
  pinned boolean DEFAULT false,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.availability (
  id bigserial NOT NULL,
  team_id bigint DEFAULT my_team(),
  user_id uuid DEFAULT auth.uid(),
  slots jsonb DEFAULT '[]'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.checkins (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid DEFAULT auth.uid() NOT NULL,
  day date DEFAULT CURRENT_DATE NOT NULL,
  drills_done jsonb DEFAULT '[]'::jsonb,
  warmup text,
  role_drills text,
  minutes integer,
  games integer,
  rating integer,
  worked_on text,
  takeaway text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.comms_recordings (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  date date,
  title text NOT NULL,
  opponent text,
  map text,
  link text,
  vod text,
  ratings jsonb DEFAULT '{}'::jsonb NOT NULL,
  notes text,
  published boolean DEFAULT true NOT NULL,
  starting_lineup jsonb DEFAULT '{}'::jsonb NOT NULL,
  agent_comps jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.comp_notes (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  a1 text,
  a2 text,
  a3 text,
  a4 text,
  a5 text,
  map text,
  team text,
  result text,
  weaknesses text,
  watch text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.drills (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  role text,
  block text,
  minutes text,
  drill text,
  how text,
  success text,
  sort integer DEFAULT 0,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.game_plans (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  opponent text NOT NULL,
  match_date date,
  scrim_id bigint,
  maps text,
  comp text,
  their_tendencies text,
  attack_plan text,
  defense_plan text,
  pistols text,
  anti_strat text,
  notes text,
  published boolean DEFAULT true NOT NULL
);

CREATE TABLE public.guides (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  section text DEFAULT 'comms'::text,
  title text,
  body text,
  sort integer DEFAULT 0,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.lineup_learned (
  lineup_id bigint NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  team_id bigint DEFAULT my_team(),
  learned_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lineups (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  created_by uuid DEFAULT auth.uid(),
  title text NOT NULL,
  agent text,
  ability text,
  map text,
  side text,
  site text,
  purpose text,
  stand text,
  aim text,
  link text,
  image text
);

CREATE TABLE public.map_pool (
  id bigserial NOT NULL,
  team_id bigint DEFAULT my_team(),
  map text NOT NULL,
  status text,
  notes text
);

CREATE TABLE public.matches (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  event text,
  opponent text,
  map text,
  rounds_won integer,
  rounds_lost integer,
  start_side text,
  vod_link text,
  notes text,
  team_id bigint DEFAULT my_team(),
  type text,
  atk_won integer,
  atk_lost integer,
  def_won integer,
  def_lost integer,
  pistols_won integer,
  scrim_id bigint
);

CREATE TABLE public.one_on_one (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  player_id uuid NOT NULL,
  author_id uuid DEFAULT auth.uid(),
  kind text DEFAULT 'Note'::text,
  body text NOT NULL,
  done boolean DEFAULT false NOT NULL
);

CREATE TABLE public.opponent_scouting (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  opponent text,
  map text,
  veto text,
  source text,
  pistol_plan text,
  fav_attack_site text,
  defense_setup text,
  after_losing text,
  first_fights text,
  star_player text,
  weakness text,
  notes text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.patch_notes (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  patch text,
  date date,
  category text,
  item text,
  effect text,
  changed text,
  coach_notes text
);

CREATE TABLE public.pistol_rounds (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  team text,
  map text,
  side text,
  round text,
  result text,
  loadouts text,
  setup text,
  utility text,
  timeline text,
  why text,
  how_we_run text,
  how_to_beat text,
  set_play text,
  valoplant text,
  watch text,
  taken_from text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.player_stats (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  map text,
  player text,
  agent text,
  rounds integer,
  kills integer,
  deaths integer,
  assists integer,
  kd numeric,
  hs_kills integer,
  hs_kill_pct numeric,
  true_hs_pct numeric,
  first_kills integer,
  first_deaths integer,
  source text,
  notes text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.rank_history (
  id bigserial NOT NULL,
  team_id bigint,
  user_id uuid,
  date date DEFAULT CURRENT_DATE NOT NULL,
  rank text,
  rr integer
);

CREATE TABLE public.reviews (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  title text,
  opponent text,
  type text,
  map text,
  vod text,
  link text,
  summary text,
  body text,
  team_id bigint DEFAULT my_team(),
  starts_at text,
  pov text,
  whose text
);

CREATE TABLE public.roster (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  name text NOT NULL,
  ign text,
  discord text,
  role text DEFAULT 'Flex'::text,
  is_igl boolean DEFAULT false,
  is_trial boolean DEFAULT false,
  visibility jsonb DEFAULT '{"comms": true, "checkin": true, "reviews": true, "my_stats": true, "playbook": true, "scouting": true, "team_stats": true, "patch_notes": true, "comp_checker": true}'::jsonb NOT NULL,
  claimed_by uuid,
  claim_status text,
  team_id bigint DEFAULT my_team(),
  status text DEFAULT 'Active'::text NOT NULL
);

CREATE TABLE public.scrims (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  starts_at timestamp with time zone NOT NULL,
  opponent text,
  maps text,
  format text,
  notes text,
  status text DEFAULT 'Planned'::text NOT NULL
);

CREATE TABLE public.set_plays (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  play_name text,
  map text,
  side text,
  type text,
  valoplant text,
  site text,
  how text,
  duelist_job text,
  initiator_job text,
  controller_job text,
  sentinel_job text,
  flex_job text,
  seen_in text,
  taken_from text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.skill_progress (
  id bigserial NOT NULL,
  team_id bigint DEFAULT my_team(),
  user_id uuid DEFAULT auth.uid(),
  skill text NOT NULL,
  status text DEFAULT 'Practising'::text NOT NULL,
  verified boolean DEFAULT false NOT NULL,
  verified_by uuid,
  note text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.teams (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  name text NOT NULL,
  tag text,
  join_code text DEFAULT upper(substr(md5(((random())::text || (clock_timestamp())::text)), 1, 6)) NOT NULL,
  owner_id uuid,
  active_maps text[],
  public_slug text,
  public_enabled boolean DEFAULT false NOT NULL,
  public_bio text,
  public_links jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.timeout_cards (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  category text,
  title text NOT NULL,
  body text,
  sort integer DEFAULT 0
);

CREATE TABLE public.utility_usage (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  date date,
  map text,
  player text,
  agent text,
  rounds integer,
  util_per_round numeric,
  q_casts integer,
  e_casts integer,
  c_casts integer,
  ults_used integer,
  ults_available integer,
  died_with_util integer,
  util_before_fight numeric,
  source text,
  notes text,
  team_id bigint DEFAULT my_team()
);

CREATE TABLE public.work_on (
  id bigserial NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  team_id bigint DEFAULT my_team(),
  date date,
  source text,
  area text,
  player text,
  issue text,
  tip text,
  priority text DEFAULT 'Medium'::text,
  status text DEFAULT 'Open'::text,
  watch text,
  drill text,
  approved boolean DEFAULT false NOT NULL,
  seen jsonb DEFAULT '[]'::jsonb NOT NULL,
  fixed_at date,
  came_back boolean DEFAULT false NOT NULL
);

ALTER TABLE public.agent_counters ADD CONSTRAINT agent_counters_agent_key UNIQUE (agent);
ALTER TABLE public.agent_counters ADD CONSTRAINT agent_counters_pkey PRIMARY KEY (id);
ALTER TABLE public.aim_logs ADD CONSTRAINT aim_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.aim_logs ADD CONSTRAINT aim_logs_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.aim_logs ADD CONSTRAINT aim_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.availability ADD CONSTRAINT availability_pkey PRIMARY KEY (id);
ALTER TABLE public.availability ADD CONSTRAINT availability_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.availability ADD CONSTRAINT availability_team_id_user_id_key UNIQUE (team_id, user_id);
ALTER TABLE public.availability ADD CONSTRAINT availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.checkins ADD CONSTRAINT checkins_pkey PRIMARY KEY (id);
ALTER TABLE public.checkins ADD CONSTRAINT checkins_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.checkins ADD CONSTRAINT checkins_user_id_day_key UNIQUE (user_id, day);
ALTER TABLE public.checkins ADD CONSTRAINT checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.comms_recordings ADD CONSTRAINT comms_recordings_pkey PRIMARY KEY (id);
ALTER TABLE public.comms_recordings ADD CONSTRAINT comms_recordings_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.comp_notes ADD CONSTRAINT comp_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.comp_notes ADD CONSTRAINT comp_notes_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.drills ADD CONSTRAINT drills_pkey PRIMARY KEY (id);
ALTER TABLE public.drills ADD CONSTRAINT drills_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.game_plans ADD CONSTRAINT game_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.game_plans ADD CONSTRAINT game_plans_scrim_id_fkey FOREIGN KEY (scrim_id) REFERENCES scrims(id) ON DELETE SET NULL;
ALTER TABLE public.game_plans ADD CONSTRAINT game_plans_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.guides ADD CONSTRAINT guides_pkey PRIMARY KEY (id);
ALTER TABLE public.guides ADD CONSTRAINT guides_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.lineup_learned ADD CONSTRAINT lineup_learned_lineup_id_fkey FOREIGN KEY (lineup_id) REFERENCES lineups(id) ON DELETE CASCADE;
ALTER TABLE public.lineup_learned ADD CONSTRAINT lineup_learned_pkey PRIMARY KEY (lineup_id, user_id);
ALTER TABLE public.lineup_learned ADD CONSTRAINT lineup_learned_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.lineup_learned ADD CONSTRAINT lineup_learned_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.lineups ADD CONSTRAINT lineups_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lineups ADD CONSTRAINT lineups_pkey PRIMARY KEY (id);
ALTER TABLE public.lineups ADD CONSTRAINT lineups_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.map_pool ADD CONSTRAINT map_pool_pkey PRIMARY KEY (id);
ALTER TABLE public.map_pool ADD CONSTRAINT map_pool_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.map_pool ADD CONSTRAINT map_pool_team_id_map_key UNIQUE (team_id, map);
ALTER TABLE public.matches ADD CONSTRAINT matches_pkey PRIMARY KEY (id);
ALTER TABLE public.matches ADD CONSTRAINT matches_scrim_id_fkey FOREIGN KEY (scrim_id) REFERENCES scrims(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD CONSTRAINT matches_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.one_on_one ADD CONSTRAINT one_on_one_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.one_on_one ADD CONSTRAINT one_on_one_pkey PRIMARY KEY (id);
ALTER TABLE public.one_on_one ADD CONSTRAINT one_on_one_player_id_fkey FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.one_on_one ADD CONSTRAINT one_on_one_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.opponent_scouting ADD CONSTRAINT opponent_scouting_pkey PRIMARY KEY (id);
ALTER TABLE public.opponent_scouting ADD CONSTRAINT opponent_scouting_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.patch_notes ADD CONSTRAINT patch_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.pistol_rounds ADD CONSTRAINT pistol_rounds_pkey PRIMARY KEY (id);
ALTER TABLE public.pistol_rounds ADD CONSTRAINT pistol_rounds_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.player_stats ADD CONSTRAINT player_stats_pkey PRIMARY KEY (id);
ALTER TABLE public.player_stats ADD CONSTRAINT player_stats_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.rank_history ADD CONSTRAINT rank_history_pkey PRIMARY KEY (id);
ALTER TABLE public.rank_history ADD CONSTRAINT rank_history_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.rank_history ADD CONSTRAINT rank_history_user_id_date_key UNIQUE (user_id, date);
ALTER TABLE public.rank_history ADD CONSTRAINT rank_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.roster ADD CONSTRAINT roster_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.roster ADD CONSTRAINT roster_claimed_by_key UNIQUE (claimed_by);
ALTER TABLE public.roster ADD CONSTRAINT roster_pkey PRIMARY KEY (id);
ALTER TABLE public.roster ADD CONSTRAINT roster_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.scrims ADD CONSTRAINT scrims_pkey PRIMARY KEY (id);
ALTER TABLE public.scrims ADD CONSTRAINT scrims_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.set_plays ADD CONSTRAINT set_plays_pkey PRIMARY KEY (id);
ALTER TABLE public.set_plays ADD CONSTRAINT set_plays_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.skill_progress ADD CONSTRAINT skill_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.skill_progress ADD CONSTRAINT skill_progress_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.skill_progress ADD CONSTRAINT skill_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.skill_progress ADD CONSTRAINT skill_progress_user_id_skill_key UNIQUE (user_id, skill);
ALTER TABLE public.skill_progress ADD CONSTRAINT skill_progress_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.teams ADD CONSTRAINT teams_join_code_key UNIQUE (join_code);
ALTER TABLE public.teams ADD CONSTRAINT teams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.timeout_cards ADD CONSTRAINT timeout_cards_pkey PRIMARY KEY (id);
ALTER TABLE public.timeout_cards ADD CONSTRAINT timeout_cards_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.utility_usage ADD CONSTRAINT utility_usage_pkey PRIMARY KEY (id);
ALTER TABLE public.utility_usage ADD CONSTRAINT utility_usage_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.work_on ADD CONSTRAINT work_on_pkey PRIMARY KEY (id);
ALTER TABLE public.work_on ADD CONSTRAINT work_on_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- Functions and RPCs
SET check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.admin_delete_team(tid bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'Owner only.'; end if;
  update public.profiles set team_id = null, approved = false, is_coach = false where team_id = tid and not is_admin;
  update public.profiles set team_id = null where team_id = tid and is_admin;
  delete from public.teams where id = tid;   -- deletes the team's data too
  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_open_team(tid bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'Owner only.'; end if;
  if not exists (select 1 from public.teams where id = tid) then raise exception 'No such team.'; end if;
  update public.profiles set team_id = tid, approved = true where id = auth.uid();
  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_teams()
 RETURNS TABLE(id bigint, name text, tag text, join_code text, created_at timestamp with time zone, owner text, coaches bigint, members bigint, waiting bigint, checkins_7d bigint, last_checkin date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Owner only.'; end if;
  return query
  select t.id, t.name, t.tag, t.join_code, t.created_at,
         coalesce(o.discord, o.display_name, o.email),
         (select count(*) from public.profiles p where p.team_id = t.id and p.is_coach and p.approved),
         (select count(*) from public.profiles p where p.team_id = t.id and p.approved),
         (select count(*) from public.profiles p where p.team_id = t.id and not p.approved),
         (select count(*) from public.checkins c where c.team_id = t.id and c.day >= current_date - 6),
         (select max(c.day) from public.checkins c where c.team_id = t.id)
    from public.teams t left join public.profiles o on o.id = t.owner_id
   order by t.created_at;
end $function$
;

CREATE OR REPLACE FUNCTION public.auto_claim()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare me public.profiles; rid bigint;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.discord is null or me.team_id is null then return 'none'; end if;
  if exists (select 1 from public.roster where claimed_by = auth.uid()) then return 'already'; end if;
  select id into rid from public.roster
   where team_id = me.team_id and claimed_by is null and discord is not null
     and lower(regexp_replace(trim(discord), '^@', '')) = lower(trim(me.discord))
   limit 1;
  if rid is null then return 'none'; end if;
  return public.claim_roster(rid);
end $function$
;

CREATE OR REPLACE FUNCTION public.can_see(sec text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select coalesce((
    select team_id is not null and (is_admin or (approved and (is_coach or staff_role is not null or coalesce((visibility->>sec)::boolean, true))))
    from public.profiles where id = auth.uid()
  ), false)
$function$
;

CREATE OR REPLACE FUNCTION public.claim_roster(rid bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  r public.roster;
  me public.profiles;
  matched boolean;
begin
  if auth.uid() is null then return 'not_signed_in'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then return 'no_profile'; end if;
  select * into r from public.roster where id = rid for update;
  if r.id is null then return 'not_found'; end if;
  matched := r.discord is not null and me.discord is not null
             and lower(regexp_replace(trim(r.discord), '^@', '')) = lower(trim(me.discord));
  if me.team_id is distinct from r.team_id then
    -- Joining a new team through an invite slot: only when not on a team and the Discord name matches.
    if me.team_id is not null or not matched then return 'not_invited'; end if;
    update public.profiles set team_id = r.team_id, is_coach = false, approved = false where id = me.id;
    me.team_id := r.team_id; me.is_coach := false;
  end if;
  if r.claimed_by is not null and r.claimed_by <> auth.uid() then return 'taken'; end if;
  if exists (select 1 from public.roster where claimed_by = auth.uid() and id <> rid and claim_status = 'approved') then
    return 'already_linked';
  end if;
  update public.roster set claimed_by = null, claim_status = null where claimed_by = auth.uid() and id <> rid;
  update public.roster
     set claimed_by = auth.uid(),
         claim_status = case when matched or me.is_coach then 'approved' else 'pending' end
   where id = rid;
  update public.profiles
     set display_name = r.name, ign = r.ign, role = r.role, is_igl = r.is_igl, is_trial = r.is_trial,
         visibility = r.visibility, approved = approved or matched
   where id = auth.uid();
  return case when matched or me.is_coach then 'approved' else 'pending' end;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_team(p_name text, p_tag text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare me public.profiles; tid bigint;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Sign in first.'; end if;
  if me.team_id is not null and not me.is_admin then raise exception 'You''re already on a team. Leave it first (Account page).'; end if;
  p_name := trim(coalesce(p_name, ''));
  if length(p_name) < 2 or length(p_name) > 40 then raise exception 'Team name must be 2–40 characters.'; end if;
  insert into public.teams (name, tag, owner_id) values (p_name, nullif(upper(trim(coalesce(p_tag, ''))), ''), me.id) returning id into tid;
  update public.profiles set team_id = tid, is_coach = true, approved = true where id = me.id;
  return tid;
end $function$
;

CREATE OR REPLACE FUNCTION public.ensure_roster_slot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if new.approved and not coalesce(new.is_coach, false) and new.staff_role is null and new.team_id is not null
     and not exists (select 1 from public.roster where claimed_by = new.id) then
    insert into public.roster (team_id, name, ign, discord, role, is_igl, is_trial, status, claimed_by, claim_status)
    values (new.team_id, coalesce(nullif(new.ign, ''), nullif(new.display_name, ''), new.discord, 'Player'),
            nullif(new.ign, ''), new.discord, coalesce(new.role, 'Flex'),
            coalesce(new.is_igl, false), coalesce(new.is_trial, false), 'Active', new.id, 'approved');
  elsif new.approved then
    update public.roster set claim_status = 'approved' where claimed_by = new.id and claim_status is distinct from 'approved';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  first_user boolean;
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  dname text;
begin
  select not exists (select 1 from public.profiles) into first_user;
  dname := regexp_replace(coalesce(m->>'user_name', m->>'name', m->>'preferred_username', ''), '#0+$', '');
  insert into public.profiles (id, email, display_name, ign, role, is_coach, approved, is_admin, discord, discord_id, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(m->'custom_claims'->>'global_name', m->>'full_name', m->>'display_name', nullif(dname, ''), split_part(new.email, '@', 1)),
    m->>'ign',
    coalesce(m->>'role', 'Flex'),
    false, false, first_user,
    nullif(dname, ''),
    coalesce(m->>'provider_id', m->>'sub'),
    coalesce(m->>'avatar_url', m->>'picture')
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$function$
;

CREATE OR REPLACE FUNCTION public.is_coach()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select coalesce((select team_id is not null and ((is_coach and approved) or is_admin)
                   from public.profiles where id = auth.uid()), false)
$function$
;

CREATE OR REPLACE FUNCTION public.is_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select coalesce((select approved and team_id is not null from public.profiles where id = auth.uid()), false)
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select coalesce((select team_id is not null and (is_admin or (approved and (is_coach or staff_role is not null)))
                   from public.profiles where id = auth.uid()), false)
$function$
;

CREATE OR REPLACE FUNCTION public.join_team(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare me public.profiles; t public.teams;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Sign in first.'; end if;
  select * into t from public.teams where join_code = upper(trim(coalesce(p_code, '')));
  if t.id is null then raise exception 'That code doesn''t match any team. Check it with your coach.'; end if;
  if me.team_id = t.id then return t.name; end if;
  if me.team_id is not null then raise exception 'You''re already on a team. Leave it first (Account page).'; end if;
  update public.profiles set team_id = t.id, approved = false, is_coach = false where id = me.id;
  return t.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.leave_team()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.team_id is null then return 'ok'; end if;
  if me.is_coach and me.approved
     and not exists (select 1 from public.profiles where team_id = me.team_id and id <> me.id and is_coach and approved)
     and exists (select 1 from public.profiles where team_id = me.team_id and id <> me.id) then
    raise exception 'You''re the only coach. Make someone else a coach first (Coach panel → Members).';
  end if;
  update public.roster set claimed_by = null, claim_status = null where claimed_by = me.id;
  update public.profiles set team_id = null, is_coach = false, approved = false where id = me.id;
  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.my_ign()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select public.norm_name(ign) from public.profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.my_invites()
 RETURNS TABLE(slot_id bigint, slot_name text, team_id bigint, team_name text, team_tag text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select r.id, r.name, t.id, t.name, t.tag
    from public.roster r join public.teams t on t.id = r.team_id
    join public.profiles me on me.id = auth.uid()
   where me.team_id is null and me.discord is not null and r.claimed_by is null and r.discord is not null
     and lower(regexp_replace(trim(r.discord), '^@', '')) = lower(trim(me.discord))
$function$
;

CREATE OR REPLACE FUNCTION public.my_team()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select team_id from public.profiles where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.new_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare c text;
begin
  if not public.is_coach() then raise exception 'Coach only.'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  update public.teams set join_code = c where id = public.my_team();
  return c;
end $function$
;

CREATE OR REPLACE FUNCTION public.norm_name(n text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  select lower(trim(regexp_replace(coalesce(n, ''), '\s*\*\s*trial\s*$', '', 'i')))
$function$
;

CREATE OR REPLACE FUNCTION public.protect_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then return new; end if;
  if old.is_admin then raise exception 'Only the app owner can change the owner''s account.'; end if;
  new.is_admin := old.is_admin;
  new.team_id  := old.team_id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.protect_skill()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('authenticated', 'anon') and not public.is_staff() then
    if tg_op = 'INSERT' then new.verified := false; new.verified_by := null;
    else new.verified := old.verified; new.verified_by := old.verified_by; end if;
  end if;
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.public_team(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare t public.teams; res jsonb;
begin
  select * into t from public.teams where lower(public_slug) = lower(p_slug) and public_enabled;
  if t.id is null then return null; end if;
  select jsonb_build_object(
    'name', t.name, 'tag', t.tag, 'bio', t.public_bio, 'links', t.public_links,
    'roster', coalesce((select jsonb_agg(jsonb_build_object('ign', coalesce(nullif(r.ign, ''), r.name), 'role', r.role, 'igl', r.is_igl,
                         'rank', p.rank, 'peak', p.peak_rank, 'riot_id', case when coalesce((t.public_links->>'show_riot_ids')::boolean, false) then p.riot_id end)
                         order by r.is_igl desc, r.role, r.name)
                         from public.roster r left join public.profiles p on p.id = r.claimed_by
                        where r.team_id = t.id and coalesce(r.status, 'Active') = 'Active' and coalesce(r.is_trial, false) = false
                          and (p.id is null or (not p.is_coach and p.staff_role is null))), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(nullif(p.ign, ''), p.discord), 'role', case when p.is_coach then 'Head coach' else p.staff_role end))
                         from public.profiles p where p.team_id = t.id and p.approved and (p.is_coach or p.staff_role is not null) and not p.is_admin), '[]'::jsonb),
    'results', case when coalesce((t.public_links->>'show_results')::boolean, true) then
                 coalesce((select jsonb_agg(x) from (select m.date, m.event, m.opponent, m.map, m.rounds_won, m.rounds_lost
                             from public.matches m where m.team_id = t.id and coalesce(m.type, '') <> 'Scrim' and coalesce(m.event, '') !~* 'scrim'
                             order by m.date desc nulls last limit 15) x), '[]'::jsonb) else '[]'::jsonb end
  ) into res;
  return res;
end $function$
;

CREATE OR REPLACE FUNCTION public.remove_member(uid uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare target public.profiles;
begin
  if not public.is_coach() then raise exception 'Coach only.'; end if;
  select * into target from public.profiles where id = uid;
  if target.id is null or target.team_id is distinct from public.my_team() then raise exception 'Not on your team.'; end if;
  if uid = auth.uid() then raise exception 'Use Leave team on the Account page instead.'; end if;
  if target.is_admin and not public.is_admin() then raise exception 'You can''t remove the app owner.'; end if;
  update public.roster set claimed_by = null, claim_status = null where claimed_by = uid;
  update public.profiles set team_id = null, is_coach = false, approved = false where id = uid;
  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.set_my_rank(p_riot_id text, p_rank text, p_rr integer, p_peak text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Not signed in.'; end if;
  update public.profiles set riot_id = nullif(trim(p_riot_id), ''), rank = nullif(p_rank, ''), rank_rr = p_rr,
         peak_rank = nullif(p_peak, ''), rank_updated = current_date where id = me.id;
  if nullif(p_rank, '') is not null then
    insert into public.rank_history (team_id, user_id, date, rank, rr) values (me.team_id, me.id, current_date, p_rank, p_rr)
    on conflict (user_id, date) do update set rank = excluded.rank, rr = excluded.rr, team_id = excluded.team_id;
  end if;
  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.set_work_status(wid bigint, new_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare w public.work_on;
begin
  if new_status not in ('Open', 'Working on it', 'Fixed') then raise exception 'Unknown status.'; end if;
  select * into w from public.work_on where id = wid;
  if w.id is null or w.team_id is distinct from public.my_team() then raise exception 'Not found.'; end if;
  if not (public.is_coach() or (w.approved and public.norm_name(w.player) = public.my_ign())) then
    raise exception 'Only the player it''s for (or the coach) can change this.';
  end if;
  update public.work_on
     set status = new_status,
         fixed_at = case when new_status = 'Fixed' then coalesce(case when w.status = 'Fixed' then w.fixed_at end, current_date) else fixed_at end,
         came_back = case when new_status = 'Fixed' then false else came_back end
   where id = wid;
  return 'ok';
end $function$
;

CREATE OR REPLACE FUNCTION public.team_directory()
 RETURNS TABLE(id bigint, name text, tag text, players bigint, maps_played bigint, last_match date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if not public.is_staff() then raise exception 'Coaches only.'; end if;
  return query
  select t.id, t.name, t.tag,
         (select count(*) from public.roster r where r.team_id = t.id and coalesce(r.status, 'Active') = 'Active'),
         (select count(*) from public.matches m where m.team_id = t.id),
         (select max(m.date) from public.matches m where m.team_id = t.id)
    from public.teams t order by t.name;
end $function$
;

CREATE OR REPLACE FUNCTION public.team_public_roster(tid bigint)
 RETURNS TABLE(name text, ign text, role text, is_igl boolean, is_trial boolean, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
begin
  if not public.is_staff() then raise exception 'Coaches only.'; end if;
  return query
  select coalesce(nullif(r.ign, ''), r.name), r.ign, r.role, r.is_igl, r.is_trial, coalesce(r.status, 'Active')
    from public.roster r
   where r.team_id = tid
     and not exists (select 1 from public.profiles p where p.id = r.claimed_by and (p.is_coach or p.staff_role is not null))
   order by coalesce(r.status, 'Active'), r.name;
end $function$
;
SET check_function_bodies = on;


-- Table indexes
CREATE INDEX aim_logs_team_idx ON public.aim_logs USING btree (team_id, user_id, date);
CREATE INDEX aim_logs_user_id_idx ON public.aim_logs USING btree (user_id);
CREATE INDEX announcements_team_idx ON public.announcements USING btree (team_id);
CREATE INDEX availability_user_id_idx ON public.availability USING btree (user_id);
CREATE INDEX checkins_team_idx ON public.checkins USING btree (team_id);
CREATE INDEX comms_recordings_team_id_idx ON public.comms_recordings USING btree (team_id);
CREATE INDEX comp_notes_team_idx ON public.comp_notes USING btree (team_id);
CREATE INDEX drills_team_idx ON public.drills USING btree (team_id);
CREATE INDEX game_plans_team_idx ON public.game_plans USING btree (team_id, match_date);
CREATE INDEX game_plans_scrim_id_idx ON public.game_plans USING btree (scrim_id);
CREATE INDEX guides_team_idx ON public.guides USING btree (team_id);
CREATE INDEX lineup_learned_team_id_idx ON public.lineup_learned USING btree (team_id);
CREATE INDEX lineup_learned_user_id_idx ON public.lineup_learned USING btree (user_id);
CREATE INDEX lineups_created_by_idx ON public.lineups USING btree (created_by);
CREATE INDEX lineups_team_id_idx ON public.lineups USING btree (team_id);
CREATE INDEX matches_team_idx ON public.matches USING btree (team_id);
CREATE INDEX matches_scrim_id_idx ON public.matches USING btree (scrim_id);
CREATE INDEX one_on_one_idx ON public.one_on_one USING btree (team_id, player_id, created_at);
CREATE INDEX one_on_one_author_id_idx ON public.one_on_one USING btree (author_id);
CREATE INDEX one_on_one_player_id_idx ON public.one_on_one USING btree (player_id);
CREATE INDEX opponent_scouting_team_idx ON public.opponent_scouting USING btree (team_id);
CREATE INDEX pistol_rounds_team_idx ON public.pistol_rounds USING btree (team_id);
CREATE INDEX player_stats_team_idx ON public.player_stats USING btree (team_id);
CREATE INDEX profiles_team_id_idx ON public.profiles USING btree (team_id);
CREATE INDEX rank_history_team_id_idx ON public.rank_history USING btree (team_id);
CREATE INDEX reviews_team_idx ON public.reviews USING btree (team_id);
CREATE INDEX roster_team_idx ON public.roster USING btree (team_id);
CREATE INDEX scrims_team_idx ON public.scrims USING btree (team_id, starts_at);
CREATE INDEX set_plays_team_idx ON public.set_plays USING btree (team_id);
CREATE INDEX skill_progress_team_id_idx ON public.skill_progress USING btree (team_id);
CREATE INDEX skill_progress_verified_by_idx ON public.skill_progress USING btree (verified_by);
CREATE UNIQUE INDEX teams_public_slug_idx ON public.teams USING btree (lower(public_slug));
CREATE INDEX teams_owner_id_idx ON public.teams USING btree (owner_id);
CREATE INDEX timeout_cards_team_id_idx ON public.timeout_cards USING btree (team_id);
CREATE INDEX utility_usage_team_idx ON public.utility_usage USING btree (team_id);
CREATE INDEX work_on_team_idx ON public.work_on USING btree (team_id);


-- Triggers
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER profiles_roster_slot AFTER INSERT OR UPDATE OF approved, team_id, is_coach, staff_role ON profiles FOR EACH ROW EXECUTE FUNCTION ensure_roster_slot();
CREATE TRIGGER protect_profile BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION protect_profile();
CREATE TRIGGER protect_skill BEFORE INSERT OR UPDATE ON skill_progress FOR EACH ROW EXECUTE FUNCTION protect_skill();



-- Row-level security



-- Row-level security policies
CREATE POLICY agent_counters_coach ON public.agent_counters AS PERMISSIVE FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY agent_counters_read ON public.agent_counters AS PERMISSIVE FOR SELECT TO public USING (can_see('comp_checker'::text));
CREATE POLICY aim_logs_own ON public.aim_logs AS PERMISSIVE FOR ALL TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team()) AND is_member()));
CREATE POLICY aim_logs_read ON public.aim_logs AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY aim_logs_staff_delete ON public.aim_logs AS PERMISSIVE FOR DELETE TO public USING (((team_id = my_team()) AND is_staff()));
CREATE POLICY announcements_coach ON public.announcements AS PERMISSIVE FOR ALL TO public USING ((((team_id = my_team()) AND is_coach()) OR ((team_id IS NULL) AND is_admin()))) WITH CHECK ((((team_id = my_team()) AND is_coach()) OR ((team_id IS NULL) AND is_admin())));
CREATE POLICY announcements_read ON public.announcements AS PERMISSIVE FOR SELECT TO public USING ((((team_id IS NULL) OR (team_id = my_team())) AND is_member()));
CREATE POLICY availability_delete ON public.availability AS PERMISSIVE FOR DELETE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id = my_team()) AND is_coach())));
CREATE POLICY availability_insert ON public.availability AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team()) AND is_member()));
CREATE POLICY availability_read ON public.availability AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY availability_update ON public.availability AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team())));
CREATE POLICY checkins_delete ON public.checkins AS PERMISSIVE FOR DELETE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id = my_team()) AND is_coach())));
CREATE POLICY checkins_insert ON public.checkins AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team()) AND can_see('checkin'::text)));
CREATE POLICY checkins_read ON public.checkins AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((team_id = my_team()) AND is_coach())));
CREATE POLICY checkins_staff_read ON public.checkins AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_staff()));
CREATE POLICY checkins_update ON public.checkins AS PERMISSIVE FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) AND can_see('checkin'::text))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team())));
CREATE POLICY comms_read ON public.comms_recordings AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member() AND (published OR is_staff())));
CREATE POLICY comms_staff ON public.comms_recordings AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY comp_notes_coach ON public.comp_notes AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY comp_notes_other_coaches ON public.comp_notes AS PERMISSIVE FOR SELECT TO public USING ((is_staff() AND (team_id IS NOT NULL)));
CREATE POLICY comp_notes_read ON public.comp_notes AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('scouting'::text)));
CREATE POLICY comp_notes_staff ON public.comp_notes AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY drills_coach ON public.drills AS PERMISSIVE FOR ALL TO public USING ((((team_id = my_team()) AND is_coach()) OR ((team_id IS NULL) AND is_admin()))) WITH CHECK ((((team_id = my_team()) AND is_coach()) OR ((team_id IS NULL) AND is_admin())));
CREATE POLICY drills_read ON public.drills AS PERMISSIVE FOR SELECT TO public USING ((((team_id IS NULL) OR (team_id = my_team())) AND is_member()));
CREATE POLICY game_plans_coach ON public.game_plans AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY game_plans_read ON public.game_plans AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND (is_coach() OR (published AND can_see('scouting'::text)))));
CREATE POLICY game_plans_staff ON public.game_plans AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY guides_coach ON public.guides AS PERMISSIVE FOR ALL TO public USING ((((team_id = my_team()) AND is_coach()) OR ((team_id IS NULL) AND is_admin()))) WITH CHECK ((((team_id = my_team()) AND is_coach()) OR ((team_id IS NULL) AND is_admin())));
CREATE POLICY guides_read ON public.guides AS PERMISSIVE FOR SELECT TO public USING ((((team_id IS NULL) OR (team_id = my_team())) AND can_see(COALESCE(section, 'comms'::text))));
CREATE POLICY lineup_learned_own ON public.lineup_learned AS PERMISSIVE FOR ALL TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team()) AND is_member()));
CREATE POLICY lineup_learned_read ON public.lineup_learned AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY lineups_delete ON public.lineups AS PERMISSIVE FOR DELETE TO public USING (((team_id = my_team()) AND (is_staff() OR (created_by = ( SELECT auth.uid() AS uid)))));
CREATE POLICY lineups_edit ON public.lineups AS PERMISSIVE FOR UPDATE TO public USING (((team_id = my_team()) AND (is_staff() OR (created_by = ( SELECT auth.uid() AS uid))))) WITH CHECK ((team_id = my_team()));
CREATE POLICY lineups_insert ON public.lineups AS PERMISSIVE FOR INSERT TO public WITH CHECK (((team_id = my_team()) AND is_member() AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY lineups_read ON public.lineups AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY map_pool_coach ON public.map_pool AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY map_pool_read ON public.map_pool AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('team_stats'::text)));
CREATE POLICY matches_coach ON public.matches AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY matches_other_coaches ON public.matches AS PERMISSIVE FOR SELECT TO public USING ((is_staff() AND (team_id IS NOT NULL)));
CREATE POLICY matches_read ON public.matches AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('team_stats'::text)));
CREATE POLICY matches_staff ON public.matches AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY one_on_one_delete ON public.one_on_one AS PERMISSIVE FOR DELETE TO public USING (((team_id = my_team()) AND (author_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY one_on_one_insert ON public.one_on_one AS PERMISSIVE FOR INSERT TO public WITH CHECK (((team_id = my_team()) AND (author_id = ( SELECT auth.uid() AS uid)) AND (is_coach() OR ((player_id = ( SELECT auth.uid() AS uid)) AND is_member()))));
CREATE POLICY one_on_one_read ON public.one_on_one AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND ((player_id = ( SELECT auth.uid() AS uid)) OR is_coach())));
CREATE POLICY one_on_one_update ON public.one_on_one AS PERMISSIVE FOR UPDATE TO public USING (((team_id = my_team()) AND ((author_id = ( SELECT auth.uid() AS uid)) OR is_coach() OR (player_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((team_id = my_team()));
CREATE POLICY opponent_scouting_coach ON public.opponent_scouting AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY opponent_scouting_read ON public.opponent_scouting AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('scouting'::text)));
CREATE POLICY opponent_scouting_staff ON public.opponent_scouting AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY patch_notes_coach ON public.patch_notes AS PERMISSIVE FOR ALL TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY patch_notes_read ON public.patch_notes AS PERMISSIVE FOR SELECT TO public USING (can_see('patch_notes'::text));
CREATE POLICY pistol_rounds_coach ON public.pistol_rounds AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY pistol_rounds_read ON public.pistol_rounds AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('playbook'::text)));
CREATE POLICY pistol_rounds_staff ON public.pistol_rounds AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY player_stats_coach ON public.player_stats AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY player_stats_other_coaches ON public.player_stats AS PERMISSIVE FOR SELECT TO public USING ((is_staff() AND (team_id IS NOT NULL)));
CREATE POLICY player_stats_read ON public.player_stats AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND (can_see('team_stats'::text) OR (can_see('my_stats'::text) AND (norm_name(player) = my_ign())))));
CREATE POLICY player_stats_staff ON public.player_stats AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY profiles_coach_update ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK ((team_id = my_team()));
CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (((id = ( SELECT auth.uid() AS uid)) OR ((team_id = my_team()) AND is_member() AND ((NOT is_admin) OR (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = profiles.team_id) AND (t.owner_id = profiles.id))))))));
CREATE POLICY rank_history_read ON public.rank_history AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY reviews_coach ON public.reviews AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY reviews_other_coaches ON public.reviews AS PERMISSIVE FOR SELECT TO public USING ((is_staff() AND (team_id IS NOT NULL)));
CREATE POLICY reviews_read ON public.reviews AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('reviews'::text)));
CREATE POLICY reviews_staff ON public.reviews AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY roster_coach ON public.roster AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY roster_read ON public.roster AS PERMISSIVE FOR SELECT TO public USING ((team_id = my_team()));
CREATE POLICY scrims_coach ON public.scrims AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY scrims_read ON public.scrims AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY scrims_staff ON public.scrims AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY set_plays_coach ON public.set_plays AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY set_plays_read ON public.set_plays AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND can_see('playbook'::text)));
CREATE POLICY set_plays_staff ON public.set_plays AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY skill_progress_own ON public.skill_progress AS PERMISSIVE FOR ALL TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (team_id = my_team()) AND is_member()));
CREATE POLICY skill_progress_read ON public.skill_progress AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY skill_progress_staff ON public.skill_progress AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY teams_coach ON public.teams AS PERMISSIVE FOR UPDATE TO public USING ((((id = my_team()) AND is_coach()) OR is_admin())) WITH CHECK ((((id = my_team()) AND is_coach()) OR is_admin()));
CREATE POLICY teams_read ON public.teams AS PERMISSIVE FOR SELECT TO public USING (((id = my_team()) OR is_admin()));
CREATE POLICY timeout_cards_read ON public.timeout_cards AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND is_member()));
CREATE POLICY timeout_cards_staff ON public.timeout_cards AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY utility_usage_coach ON public.utility_usage AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY utility_usage_other_coaches ON public.utility_usage AS PERMISSIVE FOR SELECT TO public USING ((is_staff() AND (team_id IS NOT NULL)));
CREATE POLICY utility_usage_read ON public.utility_usage AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND (can_see('team_stats'::text) OR (can_see('my_stats'::text) AND (norm_name(player) = my_ign())))));
CREATE POLICY utility_usage_staff ON public.utility_usage AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));
CREATE POLICY work_on_coach ON public.work_on AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_coach())) WITH CHECK (((team_id = my_team()) AND is_coach()));
CREATE POLICY work_on_read ON public.work_on AS PERMISSIVE FOR SELECT TO public USING (((team_id = my_team()) AND (is_coach() OR (approved AND can_see('reviews'::text) AND ((COALESCE(TRIM(BOTH FROM player), ''::text) = ''::text) OR (lower(TRIM(BOTH FROM player)) = ANY (ARRAY['team'::text, 'whole team'::text, 'everyone'::text, 'all'::text])) OR (norm_name(player) = my_ign()))))));
CREATE POLICY work_on_staff ON public.work_on AS PERMISSIVE FOR ALL TO public USING (((team_id = my_team()) AND is_staff())) WITH CHECK (((team_id = my_team()) AND is_staff()));


-- Data API privileges. RLS policies below enforce row-level access.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, ign, role, is_igl, is_trial, visibility, discord, discord_id, avatar_url, riot_id, rank, rank_rr, peak_rank, rank_updated, is_coach, staff_role, approved) ON TABLE public.profiles TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.teams FROM anon, authenticated;
GRANT SELECT ON TABLE public.teams TO authenticated;
GRANT UPDATE (name, tag, active_maps, public_enabled, public_slug, public_bio, public_links) ON TABLE public.teams TO authenticated;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_team(text) TO anon;
REVOKE EXECUTE ON FUNCTION public.ensure_roster_slot() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.protect_profile() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.protect_skill() FROM authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

