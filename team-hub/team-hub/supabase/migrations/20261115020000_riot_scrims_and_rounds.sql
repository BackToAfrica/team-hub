-- Scrims imported from Riot custom games + round-by-round results
alter table public.matches add column if not exists riot_match_id text;
alter table public.matches add column if not exists rounds jsonb;          -- [{n, w, side:'A'|'D', end:'elim'|'det'|'defuse'|'time'|null}]
alter table public.matches add column if not exists source text;           -- 'riot' when imported
create unique index if not exists matches_riot_match_id_key on public.matches(riot_match_id);
alter table public.player_stats add column if not exists riot_match_id text;
alter table public.player_stats add column if not exists match_id bigint references public.matches(id) on delete cascade;
create index if not exists player_stats_riot_match_idx on public.player_stats(riot_match_id);
create index if not exists player_stats_match_idx on public.player_stats(match_id);
