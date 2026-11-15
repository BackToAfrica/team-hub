-- Security: functions that only signed-in users (or nobody) should call were callable without signing in.
revoke execute on function public.admin_health() from public, anon;
revoke execute on function public.my_calendar_token() from public, anon;
revoke execute on function public.rotate_calendar_token() from public, anon;
grant execute on function public.admin_health(), public.my_calendar_token(), public.rotate_calendar_token() to authenticated;
alter function public.staff_full(text) set search_path = pg_catalog, public;

-- Performance: one permissive policy per table and action (Postgres evaluates every permissive policy on every row).
-- Access is unchanged: same conditions, just combined with OR.
create table if not exists private.policy_backup_20261115b as
  select * from pg_policies where schemaname = 'public'
  and tablename in ('matches', 'player_stats', 'utility_usage', 'comp_notes', 'checkins', 'skill_progress');

do $$
declare t text; rd text; oth text; st text;
begin
  foreach t in array array['matches', 'player_stats', 'utility_usage', 'comp_notes'] loop
    select qual into rd  from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read';
    select qual into oth from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_other_coaches';
    select qual into st  from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_staff';
    if rd is null or oth is null or st is null then raise notice 'skip %', t; continue; end if;
    execute format('drop policy %I on public.%I', t || '_read', t);
    execute format('drop policy %I on public.%I', t || '_other_coaches', t);
    execute format('drop policy %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for select to authenticated using ((%s) or (%s))', t || '_select', t, rd, oth);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_staff_insert', t, st);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_staff_update', t, st, st);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_staff_delete', t, st);
  end loop;
end $$;

-- check-ins: own rows, or the whole team for staff (head coaches are staff too)
drop policy if exists checkins_read on public.checkins;
drop policy if exists checkins_staff_read on public.checkins;
create policy checkins_select on public.checkins for select to authenticated
  using ((user_id = (select auth.uid())) or ((team_id = (select public.my_team())) and (select public.is_staff())));

-- skill progress: own rows (write), team members (read), staff (write)
drop policy if exists skill_progress_own on public.skill_progress;
drop policy if exists skill_progress_read on public.skill_progress;
drop policy if exists skill_progress_staff on public.skill_progress;
create policy skill_progress_select on public.skill_progress for select to authenticated
  using ((user_id = (select auth.uid())) or ((team_id = (select public.my_team())) and (select public.is_member())));
create policy skill_progress_insert on public.skill_progress for insert to authenticated
  with check (((user_id = (select auth.uid())) and (team_id = (select public.my_team())) and (select public.is_member()))
           or ((team_id = (select public.my_team())) and (select public.is_staff())));
create policy skill_progress_update on public.skill_progress for update to authenticated
  using ((user_id = (select auth.uid())) or ((team_id = (select public.my_team())) and (select public.is_staff())))
  with check (((user_id = (select auth.uid())) and (team_id = (select public.my_team())) and (select public.is_member()))
           or ((team_id = (select public.my_team())) and (select public.is_staff())));
create policy skill_progress_delete on public.skill_progress for delete to authenticated
  using ((user_id = (select auth.uid())) or ((team_id = (select public.my_team())) and (select public.is_staff())));
