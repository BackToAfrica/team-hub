-- Riot summary: win %, most-played agents, main role and current/peak rank (team-visible, like K/D and HS%).
alter table public.riot_summary
  add column if not exists win_pct    numeric,
  add column if not exists top_agents jsonb not null default '[]'::jsonb,  -- [{agent, games, role}] top 3
  add column if not exists main_role  text,
  add column if not exists rank       text,
  add column if not exists rank_rr    integer,
  add column if not exists peak_rank  text,
  add column if not exists rank_at    timestamptz;
