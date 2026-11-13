-- Team Hub security hardening
-- Apply after the current multi-team schema and Discord roster migrations.
-- This migration is safe to re-run.

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (
  display_name, ign, role, is_igl, is_trial, visibility, discord, discord_id,
  avatar_url, riot_id, rank, rank_rr, peak_rank, rank_updated, is_coach,
  staff_role, approved
) ON TABLE public.profiles TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.teams FROM anon, authenticated;
GRANT SELECT ON TABLE public.teams TO authenticated;
GRANT UPDATE (
  name, tag, active_maps, public_enabled, public_slug, public_bio, public_links
) ON TABLE public.teams TO authenticated;

-- Keep administrative and state-changing RPCs authenticated-only.
REVOKE EXECUTE ON FUNCTION public.admin_delete_team(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_open_team(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_open_team(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_teams() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_teams() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_claim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_claim() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_roster(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_roster(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_team(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_invites() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.new_join_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.new_join_code() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_my_rank(text,text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_rank(text,text,integer,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_work_status(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_status(bigint,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.team_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_directory() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.team_public_roster(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_public_roster(bigint) TO authenticated;

-- Trigger-only functions must never be called directly over the Data API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_roster_slot() FROM PUBLIC, anon, authenticated;

-- Only the explicitly public team profile endpoint remains callable anonymously.
REVOKE EXECUTE ON FUNCTION public.public_team(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_team(text) TO anon, authenticated;

-- Policy helpers are needed by authenticated row-level security policies.
REVOKE EXECUTE ON FUNCTION public.can_see(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_coach() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_coach() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_ign() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ign() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team() TO authenticated;

ALTER FUNCTION public.norm_name(text) SET search_path = pg_catalog, public, pg_temp;
