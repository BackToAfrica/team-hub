# Team Hub — Initial Security Review

Review basis: repository snapshot on main and read-only checks against the configured live Supabase project. This is a source-level review, not a penetration test.

## Critical architecture issue to resolve before multi-organization launch

### Cross-team staff read policies are broader than the current team boundary

Five live SELECT policies were confirmed in `pg_policies`:
- `comp_notes_other_coaches`
- `matches_other_coaches`
- `player_stats_other_coaches`
- `reviews_other_coaches`
- `utility_usage_other_coaches`

Each has a predicate equivalent to `is_staff() AND team_id IS NOT NULL`. The live `is_staff()` helper checks whether the caller is approved staff on some team; it does not validate the target row's team. Staff access can therefore extend to other teams' rows for those five data areas.

Before multi-tenant public onboarding, decide whether existing cross-team coach visibility is intentional. If retained, replace it with an explicit organization-level permission after organizations and team assignments exist. The safe default for new platform access is current-team-only. Do not remove existing access blindly if workflows rely on it; add regression tests and communicate any behavior change.

## Supabase advisor snapshot — 2026-11-15

The configured project is `tmqkwretrtrqzofiovoi` (`team-hub`), active and healthy in us-east-1. Live advisor results:
- 3 tables have RLS enabled with no policies: `private.cron_token`, `private.policy_backup_20261115`, and `public.team_discord`.
- `public.public_team(text)` is SECURITY DEFINER and executable by `anon`. This may be intentional for the public team profile route; verify its output is strictly allowlisted and does not disclose private team data.
- 26 SECURITY DEFINER functions are executable by `authenticated`. This is not automatically a vulnerability: some are intentional RPCs. Review each function's internal authorization and grant scope; avoid broad EXECUTE grants for internal helpers.
- Performance advisor reports 145 multiple-permissive-policy findings and 22 unused indexes. Multiple policies are a performance/maintainability concern, not proof of a security bypass. Index usage may be low because the project is new; do not drop indexes solely on this snapshot.
- Health advisor returned no findings.

Remediation links:
- [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Public SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Multiple permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

## Edge Function observations

- `youtube-vod-ingest`: JWT verification enabled; handler also validates the bearer token and uses the caller's own RLS-scoped client for writes.
- `discord-announce`: JWT verification enabled; handler validates the user and checks coach/team context before using the service-role client for the team-specific webhook lookup.
- `riot-sync`: gateway JWT verification disabled to support a separate cron-token path, but the handler validates either a stored cron token or a bearer user token with `auth.getUser()`. User-triggered team-wide actions check staff status and derive the team from `my_team()`. Keep this custom authentication logic covered by tests; never accept arbitrary unauthenticated requests merely because gateway JWT verification is disabled.

## Additional review points

1. `profiles` contains both `is_admin` and team-scoped fields. Platform operator privileges must be separated from organization owner/admin roles.
2. `teams` currently has `owner_id` but no `organization_id`. This is the primary migration point for multi-organization support.
3. `profiles.team_id` implies one active team per profile. A scalable platform needs explicit organization membership and team staff assignments.
4. Existing helpers `is_coach()`, `is_staff()`, `is_member()`, `can_see()` and `my_team()` encode a single-team model and need a compatibility layer during migration.
5. Review all SECURITY DEFINER RPCs for authorization, fixed search_path, and EXECUTE grants. The advisor warning is a review signal, not proof that every RPC is unsafe.
6. Public team profile RPCs should remain allowlisted and must not expose private rosters, player information, scouting, or internal notes.
7. Check storage policies and Edge Functions for organization/team scope enforcement.
8. Check user-centric unique constraints such as `checkins(user_id, day)` and `skill_progress(user_id, skill)`; multi-team membership may require team-aware keys.
9. Document globally shared reference data such as agent counters and patch notes separately from tenant-owned records.
10. Redesign first-user bootstrap behavior before offering public multi-tenant signups; a first-user administrator must not imply platform-wide support access.

## Required test matrix

| Actor | Target data | Expected |
|---|---|---|
| Player in Org A / Team A | Own allowed Team A data | Allow |
| Player in Org A / Team A | Private Team A staff data | Deny |
| Coach in Org A / Team A | Team A coaching data | Allow |
| Coach in Org A / Team A | Org A Team B data, not assigned | Deny by default |
| Assigned analyst in Org A / Team B | Explicitly assigned Team B data | Allow |
| Coach in Org A | Any private Org B data | Deny |
| Org owner A | Organization A administration | Allow |
| Org owner A | Organization B administration | Deny |
| Platform support operator | Customer data | Deny by default; audited break-glass only |

## Release gate

Do not enable organization creation for general users until cross-tenant RLS tests pass, broad cross-team policies are replaced or formally scoped to organization permissions, RPC and Edge Function authorization paths are reviewed, existing teams have a validated organization mapping, and backup/rollback procedures are confirmed.

## Operational decision

No production database changes were made during this review. Repository changes on this branch are documentation only. Live Supabase checks were read-only. The checked-in `supabase/schema.sql` is a clean-install snapshot, not a safe migration to replay on the existing production database.
