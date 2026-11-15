# Team Hub Platform — Product & Architecture Blueprint

Status: Approved product direction; organization foundation implemented on the development branch; broader rollout remains in progress
Branch: platform/organization-foundation
Scope: Multi-tenant esports management platform
Audience: Players, coaches, analysts, managers, and organization owners
Priority: Product quality across the full platform

## Product vision

Team Hub is a multi-organization esports operating system. It should support an organization with multiple games, competitive teams, academy/development rosters, staff, players, and trusted external collaborators. Each organization owns its data and controls its members, teams, integrations, branding, and permissions.

The current Valorant-focused Team Hub remains the first-class experience. The data model should allow other games later without making Valorant workflows generic or less useful.

## Product principles

1. Preserve existing working Team Hub workflows and data.
2. Organization isolation is a security boundary enforced by PostgreSQL RLS, not merely by frontend filters.
3. Team membership and organization membership are distinct. A user can belong to an organization and have access to one or more of its teams.
4. Role permissions are explicit, least-privilege, and configurable per organization.
5. Player-facing experiences are simple; staff tools can be deep and data-rich.
6. Every important action should have a clear owner, timestamp, and audit trail.
7. Metrics must show their source and confidence. Never fabricate Riot/API-derived metrics that are unavailable.
8. Integrations must be resilient, rate-limited, observable, and safe to disconnect.
9. Build incrementally behind tests and migrations; do not replace the live application in one risky rewrite.
10. Responsive desktop-first staff workspace plus excellent mobile player experience.

## Target information architecture

### Global / organization layer
- Organization switcher and organization home
- Organization profile, branding, game programs
- Organization members, invitations, role templates, access reviews
- Organization-wide announcements and calendar
- Organization integrations and audit log
- Billing/plan entitlements only when a real billing system is introduced

### Game program / team layer
- Games and competitive programs
- Teams: main, academy, development, collegiate, content/creator where relevant
- Rosters, substitutes, trials, staff assignments
- Team dashboard, schedule, availability, attendance
- Scrims, official matches, tournaments and results
- Match-day command center and map veto
- Playbook, set plays, lineups, agent compositions
- Opponent database and scouting reports
- VOD library, timestamped reviews, assignments and follow-ups
- Player profiles, development plans, check-ins and evaluations
- Analytics, map intelligence, practice analytics and exports

### Personal workspace
- My schedule and availability
- My assignments and notifications
- My stats and development goals
- My reviews and feedback
- My check-ins and practice plan

### Platform administration
- Support / platform operator tools separated from organization roles
- Feature flags, integration health, background job status
- Security events and operational monitoring

## Role and permission model

Initial organization roles:
- owner: full organization control, ownership transfer, integrations and team creation
- org_admin: organization configuration, members and teams, excluding ownership transfer
- general_manager: roster/staff operations and team administration
- head_coach: team tactical, practice, roster and review control
- coach: assigned team coaching workflows
- analyst: scouting, match analysis, stats and VOD workflows
- player: own profile, schedule, assigned content, own development and approved team content
- guest: explicitly shared, read-only content

Important: role names are defaults, not the entire permission system. Use permission keys and team scopes so an analyst can be assigned to one team and a coach to two teams without granting organization-wide access. Never trust user-editable profile metadata for authorization. Database policies must check trusted membership records.

## Core data model direction

Existing tables use team_id as their primary tenant boundary. Preserve that boundary during the first transition.

Introduce:
- organizations
- organization_members (user, organization, role, status, invited_by, timestamps)
- organization_invitations (hashed token, expiry, accepted/revoked state)
- organization_settings (branding, defaults, policy settings)
- games (canonical game catalog)
- organization_games (games enabled by an organization)
- team_staff (explicit staff-to-team assignments and team-scoped role)
- permission_templates (optional later)
- audit_events (actor, organization, team, action, target, safe metadata, timestamp)
- integration_connections (provider, scoped owner, status, encrypted secret reference; never store plaintext secrets)
- notification_preferences and notifications (later)
- feature_flags / entitlements (later)

Add organization_id to teams. Backfill one organization for each existing team, preserving all existing team IDs, team_id foreign keys, records, profiles, and owner relationships. Existing teams become a default organization for that team. Do not merge teams automatically: owners can consolidate them later through an explicit workflow.

Keep team_id on existing gameplay tables for the initial release. Derive organization access through teams.organization_id. Avoid a risky mass rewrite of every table in one migration.

## Security and migration requirements

Before changing tenant policies:
1. Inventory every table, view, RPC, trigger, storage bucket and Edge Function.
2. Map current grants and RLS policies; identify SECURITY DEFINER functions and verify fixed search_path, authorization checks, and execute grants.
3. Test cross-team and cross-organization access with at least two organizations and multiple roles.
4. Confirm public profile endpoints expose only explicitly public fields.
5. Ensure all new exposed tables have RLS and least-privilege grants.
6. Do not use auth user_metadata for authorization. Use database membership rows / trusted app metadata.
7. Protect invitations with hashed, expiring, single-use tokens and rate limits.
8. Ensure organization deletion is a deliberate export/archive/confirmation workflow, never a casual cascade.
9. Add audit records for role changes, invitations, roster changes, exports, and integration changes.
10. Review views for security_invoker behavior and RPCs for SECURITY DEFINER bypass risks.

Migration strategy:
- additive schema changes first
- backfill and validate organization mapping
- add membership records and scoped policies
- run security tests
- deploy application support
- only then make organization_id mandatory and remove obsolete assumptions
- preserve rollback path and take a backup before production migrations

Do not apply schema changes to the connected production database until the target project and current live schema are confirmed and a migration has been reviewed.

## Delivery roadmap

### Foundation (first release)
- Repository and production baseline audit
- Automated smoke tests for login, onboarding, roster, check-ins, stats, scrims, VOD reviews, imports, Discord and Riot sync
- Organization schema design and migration tests
- Organization switcher and creation/onboarding flow
- Organization membership and invitations
- Team-to-organization linking with legacy data preservation
- Role/permission matrix and team-scoped staff assignments
- Security tests for cross-tenant isolation
- Audit log for critical admin actions

### Operations
- Multi-team organization dashboard
- Main/academy/development rosters
- Staff directory and team assignments
- Calendar, time zones, availability, attendance and reminders
- Tryout pipeline and evaluation rubrics
- Tournament / event / season management
- Match-day command center

### Competitive intelligence
- Normalized match and round data model
- Player identity mapping and metric provenance
- Map/side/agent/composition analytics
- Opponent tendency timelines and scouting reports
- Practice and scrim review analytics
- Exportable staff reports

### Coaching workspace
- VOD library with timestamped clips and tags
- Review assignments and player acknowledgements
- Recurring issue tracking across matches
- Individual development plans and coach evaluations
- Practice plan builder and follow-up measurement

### Intelligence assistant and integrations
- Evidence-grounded AI assistant over organization-authorized data
- Draft scouting and match preparation reports
- Discord announcements, reminders and role-aware notifications
- Riot sync with clear API limitations and refresh status
- YouTube ingestion with retry queues and processing status
- Integration health dashboard and reconnect controls

### Platform scale
- Multi-game support and game-specific modules
- Organization customization and templates
- Optional paid plans only after product value and support costs are understood
- Platform operations, support tooling, monitoring and incident response

## Definition of done for each feature

- Works end-to-end for owner, staff and player roles as appropriate
- Correct team and organization scoping enforced in the database
- Loading, empty, success and error states exist
- Keyboard and mobile usability checked
- Existing data and workflows remain intact
- Automated tests cover success, denial and cross-tenant cases
- Audit events exist for sensitive changes
- No secrets or private player data appear in logs or public responses
- Documentation and migration/rollback notes are included

## Implementation status (2026-11-15)

Completed on `platform/organization-foundation`:
- Additive organization and organization-membership schema migration.
- One-to-one legacy team-to-organization backfill that preserves existing team IDs and gameplay records.
- Automatic organization creation for teams created through the existing team-creation flow.
- Organization membership synchronization for profile approval, team assignment, and team-scoped staff-role changes.
- Organization RLS policies and least-privilege table grants; platform-wide administrator status is not treated as organization ownership.
- Initial Organization workspace for organization profile, role distribution, and member directory.
- Read-only SQL verification script.

Not yet completed or activated:
- Migration has not been applied to production or a disposable Supabase test project.
- Organization invitations, multi-team membership/switching, team_staff assignments, audit events, and full role-permission administration remain future phases.
- Existing cross-team read policies still require a product decision and regression tests before broader multi-tenant onboarding.
- The Organization workspace is only available to users with an active organization membership after the migration is applied.

## First implementation sequence

1. Audit live branch, deployment settings, database schema, RLS and existing integrations.
2. Add regression tests around current workflows before refactoring.
3. Implement organization tables and migration on a preview/test database.
4. Add organization onboarding and membership UI behind a feature flag.
5. Migrate a test copy of existing team data and prove legacy workflows still work.
6. Validate cross-organization denial with automated tests.
7. Open a reviewed pull request; do not silently push untested changes to production.
