-- Store per-map starting five and five-agent composition on each game plan.
ALTER TABLE public.game_plans
  ADD COLUMN IF NOT EXISTS starting_lineup jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_comps jsonb NOT NULL DEFAULT '{}'::jsonb;
