-- Team Hub database security smoke tests.
-- Safe/read-only: validates grants, RLS coverage, protected columns, RPC exposure,
-- SECURITY DEFINER search paths, and the auth.uid() RLS performance rewrite.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE table_schema='public' AND grantee='anon') THEN
    RAISE EXCEPTION 'Anonymous table grants remain in public schema';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.usage_privileges WHERE object_schema='public' AND grantee='anon') THEN
    RAISE EXCEPTION 'Anonymous sequence usage remains in public schema';
  END IF;
  IF NOT has_function_privilege('anon','public.public_team(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous public team endpoint is not executable';
  END IF;
  IF has_function_privilege('anon','public.create_team(text,text)','EXECUTE')
     OR has_function_privilege('anon','public.my_team()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous user can execute a private RPC/helper';
  END IF;
  IF has_column_privilege('authenticated','public.profiles','is_admin','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','team_id','UPDATE')
     OR has_column_privilege('authenticated','public.teams','owner_id','UPDATE')
     OR has_column_privilege('authenticated','public.teams','join_code','UPDATE') THEN
    RAISE EXCEPTION 'Protected account or team ownership columns are writable';
  END IF;
  IF has_function_privilege('authenticated','public.ensure_roster_slot()','EXECUTE')
     OR has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')
     OR has_function_privilege('authenticated','public.protect_profile()','EXECUTE')
     OR has_function_privilege('authenticated','public.protect_skill()','EXECUTE') THEN
    RAISE EXCEPTION 'Trigger-only function is directly executable by authenticated users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'A public table does not have RLS enabled'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND (
        (coalesce(qual,'') LIKE '%auth.uid()%' AND coalesce(qual,'') NOT LIKE '%SELECT auth.uid()%')
        OR (coalesce(with_check,'') LIKE '%auth.uid()%' AND coalesce(with_check,'') NOT LIKE '%SELECT auth.uid()%')
      )
  ) THEN RAISE EXCEPTION 'An RLS policy has an unwrapped auth.uid() call'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND NOT coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=pg_catalog, public, pg_temp%'
  ) THEN RAISE EXCEPTION 'A SECURITY DEFINER function has no hardened search_path'; END IF;
END $$;
SELECT 'PASS: Team Hub database security checks' AS result;
