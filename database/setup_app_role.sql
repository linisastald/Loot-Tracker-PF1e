-- ============================================================================
-- setup_app_role.sql - create the non-owner application role for RLS
-- ============================================================================
--
-- WHAT THIS IS
--   Multi-campaign refactor Phase 2a ships RLS tenant policies (migration
--   045_enable_rls.sql), but PostgreSQL table OWNERS bypass non-FORCE RLS.
--   Enforcement only begins when the application connects as a NON-OWNER
--   role. This script creates that role and grants it the DML privileges the
--   app needs - nothing more (no DDL, no ownership, no BYPASSRLS).
--
-- THIS IS NOT A MIGRATION
--   Run it MANUALLY, ONCE per database (per campaign instance), as the
--   database owner (the role in the DB_USER env var, e.g. postgres or the
--   role that ran init.sql/migrations). It is NOT in backend/migrations/ on
--   purpose: it contains a password and the timing of the role switch is a
--   deployment decision, not a schema change.
--
--   Example:
--     psql -U <owner> -d <database> -f database/setup_app_role.sql
--
-- WHEN TO RUN IT
--   Any time after migration 045 has been applied and BEFORE setting the
--   DB_APP_USER / DB_APP_PASSWORD environment variables on the app container.
--   Backend support for those variables ships in the same release as this
--   script: when they are set, the application's query pool connects as this
--   role (and RLS is enforced); when they are absent, the app keeps using the
--   owner credentials (DB_USER / DB_PASSWORD) and RLS remains dormant. The
--   MIGRATION RUNNER always keeps using the owner credentials (DB_USER) -
--   migrations need DDL rights and must bypass RLS.
--
-- IMPORTANT - ALTER DEFAULT PRIVILEGES below applies to objects created by
--   the role executing this script. Run it as the SAME role that runs
--   migrations (DB_USER), otherwise tables created by future migrations will
--   not be granted to the app role automatically.
--
-- SECURITY
--   *** Replace CHANGE_ME with a strong generated password before running.***
--   Never commit a real credential to this file. Then set the same value in
--   the deployment environment as DB_APP_PASSWORD.
--
-- Re-runnable: the CREATE ROLE is skipped if the role already exists, and
--   GRANT / ALTER DEFAULT PRIVILEGES statements are idempotent.
-- ============================================================================

-- 1. Create the application role (skipped if it already exists).
--    NOTE: if the role already exists, its password is NOT changed here; use
--    ALTER ROLE loot_app PASSWORD '...' to rotate it.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loot_app') THEN
        CREATE ROLE loot_app LOGIN PASSWORD 'CHANGE_ME';  -- CHANGE_ME: replace before running
    END IF;
END $$;

-- 2. Connection and schema access. (CONNECT is granted to PUBLIC by default
--    on most databases; granting it explicitly keeps this script valid even
--    if PUBLIC's CONNECT has been revoked. GRANT ... ON DATABASE needs an
--    identifier, so it is built dynamically for whatever database this runs in.)
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO loot_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO loot_app;

-- 3. DML on every existing table. RLS policies (migration 045) constrain what
--    rows this role can actually see/write on tenant tables. Deliberately no
--    TRUNCATE, no REFERENCES, no TRIGGER, and no DDL.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loot_app;

-- 4. Sequences (SERIAL/BIGSERIAL columns call nextval on insert).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loot_app;

-- 5. Functions - the app invokes DB functions such as
--    check_session_auto_cancel() and the session status triggers' helpers.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO loot_app;

-- 6. Default privileges for FUTURE objects created by the owner role running
--    this script (i.e. by future migrations), so new tables/sequences/
--    functions work without re-running grants after every migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loot_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO loot_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO loot_app;

-- ============================================================================
-- After running:
--   1. Set DB_APP_USER=loot_app and DB_APP_PASSWORD=<the password> on the app
--      container and restart it.
--   2. Verify RLS is active: connect as loot_app, run
--        SELECT count(*) FROM loot;
--      without setting app.current_campaign - it must return 0 (fail closed).
--   3. Keep DB_USER / DB_PASSWORD pointing at the owner role; the migration
--      runner still needs them at startup.
-- ============================================================================
