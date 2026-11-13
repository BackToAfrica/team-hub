# Team Hub — Supabase database

## Fresh installation

1. Create a new Supabase project.
2. Open **SQL Editor** and run `schema.sql` once. It is the complete, schema-only snapshot of the current Team Hub database. It creates all 30 app tables, constraints, indexes, functions, triggers, RLS policies, and grants.
3. In **Authentication → Sign In / Providers**, enable Discord and enter the Discord OAuth client ID and secret.
4. In Supabase Auth URL configuration, set the deployed Team Hub URL as the Site URL and add the deployed URL (and any development URL) to the redirect allow list.
5. Configure `config.js` with the project's URL and publishable/anon key. Never put a Supabase service-role or secret key in browser code.
6. Deploy the static app to Vercel.

The SQL snapshot contains no player accounts, team records, VODs, scrims, match stats, or other user data. It assumes a standard Supabase project with the `auth` schema and built-in roles.

## Existing installation

Do **not** run `schema.sql` against an existing populated project. Use only the timestamped files in `migrations/` that are not already present in that project's migration history. The connected `team-hub` project has already received the six migrations represented in this branch.

The migration filenames use the exact 14-digit versions recorded by Supabase. Keep those versions unchanged when applying the migrations through the Supabase CLI.

## Verification

Run `verify-security.sql` in the SQL Editor after installation or migration. It performs read-only checks and raises an error if key security invariants fail.

## Legacy file

`discord-roster.sql` is deprecated. Discord sign-in, roster claims, and multi-team support are already included in `schema.sql`. Do not run the legacy file after the current setup; it contains older function definitions.
