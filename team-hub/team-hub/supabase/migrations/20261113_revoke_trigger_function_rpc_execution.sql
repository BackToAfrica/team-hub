-- Trigger functions are invoked by PostgreSQL triggers, not by browser RPC calls.
-- Remove direct Data API execution while leaving their installed triggers intact.
REVOKE EXECUTE ON FUNCTION public.ensure_roster_slot() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.protect_profile() FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.protect_skill() FROM authenticated, service_role;
