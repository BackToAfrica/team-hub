-- 1) Work-on items made while reviewing a VOD remember which review they came from.
alter table public.work_on add column if not exists review_id bigint references public.reviews(id) on delete set null;
create index if not exists work_on_review_idx on public.work_on(review_id);

-- 2) Announcements → Discord.
alter table public.announcements add column if not exists discord_sent_at timestamptz;

-- The webhook link is a secret: nobody can read it through the API (no policies, no grants).
-- Coaches set it through set_discord_webhook(); only the discord-announce Edge Function (service role) reads it.
create table if not exists public.team_discord (
  team_id     bigint primary key references public.teams(id) on delete cascade,
  webhook_url text not null,
  mention     text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table public.team_discord enable row level security;
revoke all on public.team_discord from public, anon, authenticated;

create or replace function public.set_discord_webhook(p_url text, p_mention text default '')
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t bigint := public.my_team(); u text := btrim(coalesce(p_url, '')); m text := coalesce(p_mention, '');
begin
  if t is null or not public.is_coach() then raise exception 'Only coaches can connect Discord.'; end if;
  if m not in ('', '@everyone', '@here') then raise exception 'Mention must be none, @everyone or @here.'; end if;
  if u = '' then delete from public.team_discord where team_id = t; return; end if;
  if u !~ '^https://((ptb|canary)\.)?discord(app)?\.com/api/webhooks/[0-9]{5,25}/[A-Za-z0-9_-]{20,100}$' then
    raise exception 'That isn''t a Discord webhook link. In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.';
  end if;
  insert into public.team_discord (team_id, webhook_url, mention, updated_at, updated_by) values (t, u, m, now(), auth.uid())
  on conflict (team_id) do update set webhook_url = excluded.webhook_url, mention = excluded.mention, updated_at = now(), updated_by = auth.uid();
end $$;

-- change only the @mention, keep the link
create or replace function public.set_discord_mention(p_mention text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can change Discord settings.'; end if;
  if coalesce(p_mention, '') not in ('', '@everyone', '@here') then raise exception 'Mention must be none, @everyone or @here.'; end if;
  update public.team_discord set mention = coalesce(p_mention, ''), updated_at = now(), updated_by = auth.uid() where team_id = public.my_team();
end $$;

-- what the coach panel shows: connected or not, and the last 4 characters of the link (never the link itself)
create or replace function public.discord_status()
returns json language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when public.is_coach() then coalesce(
    (select json_build_object('connected', true, 'mention', d.mention, 'hint', right(d.webhook_url, 4), 'updated_at', d.updated_at) from public.team_discord d where d.team_id = public.my_team()),
    json_build_object('connected', false)) end;
$$;

revoke execute on function public.set_discord_webhook(text, text), public.set_discord_mention(text), public.discord_status() from public, anon;
grant execute on function public.set_discord_webhook(text, text), public.set_discord_mention(text), public.discord_status() to authenticated;
