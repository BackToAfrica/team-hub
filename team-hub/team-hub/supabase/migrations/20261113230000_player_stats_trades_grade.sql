-- Trades, a performance grade and a link to the VOD review on each player_stats row.
alter table public.player_stats add column if not exists trades integer;          -- kills that avenged a teammate within ~3 s
alter table public.player_stats add column if not exists traded_deaths integer;   -- this player's deaths that a teammate traded within ~3 s
alter table public.player_stats add column if not exists grade text;              -- optional reviewer grade (A+..F); the app computes one if empty
alter table public.player_stats add column if not exists review_id bigint references public.reviews(id) on delete set null;
create index if not exists player_stats_review_id_idx on public.player_stats(review_id);
