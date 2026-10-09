-- Migration: 079_narrow_app_role_privileges.sql
-- Description: Take away three rights the application login (loot_app) never uses
-- (owner decision of 2026-10-07, review item N12, partial tightening only).
--
--   1. DELETE on users.     Accounts are never deleted; "delete user" sets role = 'deleted'.
--   2. DELETE on campaigns. Campaigns are never deleted by the app.
--   3. UPDATE on users becomes column-level, limited to the columns the app writes:
--        email, password, password_changed_at, login_attempts, locked_until,
--        discord_id, role.
--      Not updatable any more: is_superadmin (set once, on INSERT, for the first
--      account), id, username, joined, google_id, discord_username. A query bug or
--      an injection running as loot_app can no longer promote an account to
--      superadmin.
--
-- INSERT and SELECT on both tables are unchanged. Row-level security is not involved:
-- users and campaigns have none.
--
-- The same statements are step 3c of database/setup_app_role.sql, because that
-- script's "GRANT ... ON ALL TABLES" would otherwise hand the rights back when it is
-- re-run. A Jest test (appRolePrivileges.test.js) keeps the two column lists equal
-- and checks them against every "UPDATE users" statement in the backend.
--
-- Does nothing when the loot_app role does not exist (an install that still runs as
-- the owner). REVOKE only removes rights granted by the role running it; the runner
-- connects as the role that ran setup_app_role.sql, which is the documented setup.
-- If the rights were granted by a different role this migration cannot remove them:
-- it then prints a WARNING and still succeeds, and step 3c of setup_app_role.sql has
-- to be run by that role.
--
-- Idempotent. UNTESTED against a real database. To undo:
--   GRANT DELETE ON users, campaigns TO loot_app; GRANT UPDATE ON users TO loot_app;

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loot_app') THEN
        RAISE NOTICE 'Migration 079: role loot_app does not exist; nothing to narrow';
        RETURN;
    END IF;

    REVOKE DELETE ON TABLE public.users FROM loot_app;
    REVOKE DELETE ON TABLE public.campaigns FROM loot_app;

    REVOKE UPDATE ON TABLE public.users FROM loot_app;
    GRANT UPDATE (email, password, password_changed_at, login_attempts, locked_until, discord_id, role)
        ON TABLE public.users TO loot_app;

    IF has_table_privilege('loot_app', 'public.users', 'UPDATE')
       OR has_table_privilege('loot_app', 'public.users', 'DELETE')
       OR has_table_privilege('loot_app', 'public.campaigns', 'DELETE')
       OR has_column_privilege('loot_app', 'public.users', 'is_superadmin', 'UPDATE') THEN
        RAISE WARNING 'Migration 079: loot_app still holds rights this migration tried to remove (granted by another role, or inherited). Run step 3c of database/setup_app_role.sql as the role that granted them.';
    ELSE
        RAISE NOTICE 'Migration 079: loot_app can no longer delete users or campaigns, and can update only seven columns of users';
    END IF;
END
$$;

COMMIT;
