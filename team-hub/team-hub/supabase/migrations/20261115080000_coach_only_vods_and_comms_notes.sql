-- VOD reviews are coach/staff only (players get what matters through Work on, practice plans and 1-on-1 notes).
drop policy if exists reviews_read on public.reviews;

-- Comms recordings can be addressed to one player. Players only see published notes for the whole team or for themselves.
alter table public.comms_recordings add column if not exists for_player text;
drop policy if exists comms_read on public.comms_recordings;
create policy comms_read on public.comms_recordings for select
  using (team_id = (select public.my_team()) and (select public.is_member())
    and ((published and (for_player is null or public.norm_name(for_player) = (select public.my_ign()))) or (select public.is_staff())));
