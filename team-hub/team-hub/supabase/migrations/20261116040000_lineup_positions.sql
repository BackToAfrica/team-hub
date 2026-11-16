-- Where you stand and where the lineup lands, on the minimap (0–1000 square), for the in-app "show me how" view.
alter table public.lineups add column if not exists pos jsonb;
