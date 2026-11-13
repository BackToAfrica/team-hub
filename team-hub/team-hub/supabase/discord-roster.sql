-- =====================================================================
--  Team Hub — Discord login + claimable roster
--  Run this in Supabase → SQL Editor AFTER schema.sql (safe to run again).
-- =====================================================================

-- Discord details on each account
alter table public.profiles add column if not exists discord    text;  -- Discord username, e.g. "fearval"
alter table public.profiles add column if not exists discord_id text;
alter table public.profiles add column if not exists avatar_url text;

-- Pull the Discord name/avatar in when someone signs in for the first time.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  dname text;
begin
  select not exists (select 1 from public.profiles) into first_user;
  dname := regexp_replace(coalesce(m->>'user_name', m->>'name', m->>'preferred_username', ''), '#0+$', '');
  insert into public.profiles (id, email, display_name, ign, role, is_coach, approved, discord, discord_id, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(m->'custom_claims'->>'global_name', m->>'full_name', m->>'display_name', nullif(dname, ''), split_part(new.email, '@', 1)),
    m->>'ign',
    coalesce(m->>'role', 'Flex'),
    first_user,
    first_user,
    nullif(dname, ''),
    coalesce(m->>'provider_id', m->>'sub'),
    coalesce(m->>'avatar_url', m->>'picture')
  );
  return new;
end $$;

-- ---------- Roster slots the coach creates and players claim ----------
create table if not exists public.roster (
  id           bigserial primary key,
  created_at   timestamptz default now(),
  name         text not null,          -- how the player shows in the app
  ign          text,                   -- in-game name (must match stats rows)
  discord      text,                   -- the Discord username expected to claim this slot
  role         text default 'Flex',
  is_igl       boolean default false,
  is_trial     boolean default false,
  visibility   jsonb not null default
    '{"checkin":true,"my_stats":true,"team_stats":true,"playbook":true,"comms":true,"reviews":true,"scouting":true,"comp_checker":true,"patch_notes":true}'::jsonb,
  claimed_by   uuid unique references public.profiles(id) on delete set null,
  claim_status text                    -- null = open, 'pending' = waiting for coach, 'approved'
);

alter table public.roster enable row level security;
drop policy if exists roster_read on public.roster;
-- Anyone signed in can see the roster (so they can find their name to claim).
create policy roster_read on public.roster for select using (auth.uid() is not null);
drop policy if exists roster_coach on public.roster;
create policy roster_coach on public.roster for all using (public.is_coach()) with check (public.is_coach());

-- Claim a roster slot. If the Discord name the coach put on the slot matches the
-- signed-in Discord account, it's approved instantly; otherwise the coach confirms it.
create or replace function public.claim_roster(rid bigint)
returns text language plpgsql security definer set search_path = public as $$
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
  if r.claimed_by is not null and r.claimed_by <> auth.uid() then return 'taken'; end if;
  if exists (select 1 from public.roster where claimed_by = auth.uid() and id <> rid and claim_status = 'approved') then
    return 'already_linked';
  end if;
  -- drop any other pending claim by this person
  update public.roster set claimed_by = null, claim_status = null where claimed_by = auth.uid() and id <> rid;

  matched := r.discord is not null and me.discord is not null
             and lower(regexp_replace(trim(r.discord), '^@', '')) = lower(trim(me.discord));

  update public.roster
     set claimed_by = auth.uid(),
         claim_status = case when matched or me.is_coach then 'approved' else 'pending' end
   where id = rid;

  update public.profiles
     set display_name = r.name,
         ign          = r.ign,
         role         = r.role,
         is_igl       = r.is_igl,
         is_trial     = r.is_trial,
         visibility   = r.visibility,
         approved     = approved or matched
   where id = auth.uid();

  return case when matched or me.is_coach then 'approved' else 'pending' end;
end $$;

-- On sign-in: if the coach already put this Discord name on a slot, link it automatically.
create or replace function public.auto_claim()
returns text language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  rid bigint;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.discord is null then return 'none'; end if;
  if exists (select 1 from public.roster where claimed_by = auth.uid()) then return 'already'; end if;
  select id into rid from public.roster
   where claimed_by is null and discord is not null
     and lower(regexp_replace(trim(discord), '^@', '')) = lower(trim(me.discord))
   limit 1;
  if rid is null then return 'none'; end if;
  return public.claim_roster(rid);
end $$;

grant execute on function public.claim_roster(bigint) to authenticated;
grant execute on function public.auto_claim() to authenticated;
