-- Wrap auth.uid() in a scalar SELECT so PostgreSQL can evaluate it once
-- per statement instead of repeatedly for every row considered by RLS.
DO $$
DECLARE
  p record;
  role_list text;
  using_expr text;
  check_expr text;
  statement text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') LIKE '%auth.uid()%'
        OR coalesce(with_check, '') LIKE '%auth.uid()%'
      )
  LOOP
    SELECT string_agg(
      CASE WHEN r = 'public' THEN 'public' ELSE quote_ident(r) END,
      ', '
    )
    INTO role_list
    FROM unnest(p.roles) AS x(r);

    using_expr := p.qual;
    check_expr := p.with_check;

    IF using_expr IS NOT NULL THEN
      using_expr := replace(using_expr, '(select auth.uid())', '__AUTH_UID_WRAPPED__');
      using_expr := replace(using_expr, 'auth.uid()', '(select auth.uid())');
      using_expr := replace(using_expr, '__AUTH_UID_WRAPPED__', '(select auth.uid())');
    END IF;

    IF check_expr IS NOT NULL THEN
      check_expr := replace(check_expr, '(select auth.uid())', '__AUTH_UID_WRAPPED__');
      check_expr := replace(check_expr, 'auth.uid()', '(select auth.uid())');
      check_expr := replace(check_expr, '__AUTH_UID_WRAPPED__', '(select auth.uid())');
    END IF;

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);

    statement := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, role_list
    );

    IF using_expr IS NOT NULL THEN
      statement := statement || ' USING (' || using_expr || ')';
    END IF;
    IF check_expr IS NOT NULL THEN
      statement := statement || ' WITH CHECK (' || check_expr || ')';
    END IF;

    EXECUTE statement;
  END LOOP;
END $$;
