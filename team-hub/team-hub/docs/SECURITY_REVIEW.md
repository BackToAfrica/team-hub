# Team Hub — Initial Security Review

Review basis: repository snapshot on main, including supabase/schema.sql.
This is a source-level review, not a live penetration test. Confirm behavior against the connected database before applying changes.

## Critical architecture issue to resolve before multi-organization launch

### Cross-team staff read policies are broader than the current team boundary

The following policies in the schema allow a user for whom is_staff() is true to read rows from any non-null team_id, without constraining the row to the caller's team:

- comp_notes_other_coaches
- matches_other_coaches
- player_stats_other_coaches
- reviews_other_coaches
- utility_usage_other_coaches

The helper is_staff() checks the caller's own profile and confirms they are staff on some team. It does not accept a target team ID and does not prove that the target row belongs to the same team (or organization).

Impact: an approved staff member on one team may be able to read scouting notes, match records, player statistics, reviews and utility usage from other teams. This conflicts with strict organization isolation and least-privilege access.

Required correction:
- Remove these broad policies or replace them with explicit membership checks.
- For the first secure baseline, staff should only see rows where team_id = my_team().
- When multi-team organization access is introduced, permit cross-team reads only when an explicit organization membership/permission and team assignment authorizes the target team.
- Add automated negative tests with two unrelated organizations and staff accounts in each.
- Check other tables, RPCs and Edge Functions for equivalent cross-team access paths.

Do not deploy a blanket organization-wide staff policy. Organization-wide access should be permission-specific and auditable.

## Additional review points

1. profiles currently contains both is_admin and team-scoped fields. Platform operator privileges must be separated from organization owner/admin roles.
2. teams currently has owner_id but no organization_id. This is the primary migration point for multi-organization support.
3. Existing profiles.team_id implies one active team per profile. A scalable platform needs explicit organization_members and team_staff relations rather than relying on one team_id field.
4. Existing helper functions is_coach(), is_staff(), is_member(), can_see() and my_team() encode a single-team model. They need a reviewed compatibility layer during migration.
5. Review all SECURITY DEFINER RPCs for authorization, search_path pinning, and EXECUTE grants. Do not expose privileged RPCs broadly.
6. Public team profile RPCs should remain allowlisted and must not expose private rosters, player information, scouting, or internal notes.
7. Check storage policies and Edge Functions, including Riot sync and YouTube VOD ingestion, for organization/team scope enforcement.
8. Check checkins unique constraints and skill_progress unique constraints: currently user-centric keys may need organization/team-aware semantics if users can participate in multiple teams.
9. Review RLS on patch_notes and agent_counters, which appear intentionally global/shared rather than organization-owned. Document this distinction.
10. Existing admin/first-user bootstrap behavior must be redesigned for a public multi-tenant product; no global first-user administrator should be implicitly granted platform-wide power in a production SaaS.

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

Do not enable organization creation for general users until:
- cross-tenant RLS tests pass;
- broad cross-team policies are replaced;
- all RPC and Edge Function authorization paths are reviewed;
- existing users and teams have a validated organization mapping;
- a backup and rollback plan are confirmed.
