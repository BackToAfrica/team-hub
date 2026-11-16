-- Weekly Monday report to Discord (results, attendance, check-ins, work on, upcoming scrims). On by default; coaches can turn it off.
alter table public.team_discord add column if not exists digest boolean not null default true;
alter table public.team_discord add column if not exists digest_sent_on text;

create or replace function public.set_discord_digest(p_on boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can change Discord settings.'; end if;
  update public.team_discord set digest = coalesce(p_on, true), updated_at = now(), updated_by = auth.uid() where team_id = public.my_team();
end $$;
revoke execute on function public.set_discord_digest(boolean) from public, anon;
grant execute on function public.set_discord_digest(boolean) to authenticated;

create or replace function public.discord_status()
returns json language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when public.is_coach() then coalesce(
    (select json_build_object('connected', true, 'mention', d.mention, 'hint', right(d.webhook_url, 4), 'updated_at', d.updated_at,
       'remind_day', d.remind_day, 'remind_hour', d.remind_hour, 'remind_avail', d.remind_avail, 'post_scrims', d.post_scrims, 'digest', d.digest)
     from public.team_discord d where d.team_id = public.my_team()),
    json_build_object('connected', false)) end;
$$;
