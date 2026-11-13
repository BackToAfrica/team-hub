-- Cover foreign keys used for joins and cascading deletes.
CREATE INDEX IF NOT EXISTS aim_logs_user_id_idx ON public.aim_logs(user_id);
CREATE INDEX IF NOT EXISTS availability_user_id_idx ON public.availability(user_id);
CREATE INDEX IF NOT EXISTS comms_recordings_team_id_idx ON public.comms_recordings(team_id);
CREATE INDEX IF NOT EXISTS game_plans_scrim_id_idx ON public.game_plans(scrim_id);
CREATE INDEX IF NOT EXISTS lineup_learned_team_id_idx ON public.lineup_learned(team_id);
CREATE INDEX IF NOT EXISTS lineup_learned_user_id_idx ON public.lineup_learned(user_id);
CREATE INDEX IF NOT EXISTS lineups_created_by_idx ON public.lineups(created_by);
CREATE INDEX IF NOT EXISTS lineups_team_id_idx ON public.lineups(team_id);
CREATE INDEX IF NOT EXISTS matches_scrim_id_idx ON public.matches(scrim_id);
CREATE INDEX IF NOT EXISTS one_on_one_author_id_idx ON public.one_on_one(author_id);
CREATE INDEX IF NOT EXISTS one_on_one_player_id_idx ON public.one_on_one(player_id);
CREATE INDEX IF NOT EXISTS profiles_team_id_idx ON public.profiles(team_id);
CREATE INDEX IF NOT EXISTS rank_history_team_id_idx ON public.rank_history(team_id);
CREATE INDEX IF NOT EXISTS skill_progress_team_id_idx ON public.skill_progress(team_id);
CREATE INDEX IF NOT EXISTS skill_progress_verified_by_idx ON public.skill_progress(verified_by);
CREATE INDEX IF NOT EXISTS teams_owner_id_idx ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS timeout_cards_team_id_idx ON public.timeout_cards(team_id);
