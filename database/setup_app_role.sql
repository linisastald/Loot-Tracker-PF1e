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
--   Example (psql 13 or newer; the password is passed as a variable so it is
--   not stored in this file or in the shell history of a typed literal):
--     psql -U <owner> -d <database> -v ON_ERROR_STOP=1 \
--          -v app_password="$LOOT_APP_PASSWORD" -f database/setup_app_role.sql
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
--   The password comes from the psql variable app_password (see the example
--   above). The script stops without changing anything if the variable is not
--   set, is empty, or is the placeholder CHANGE_ME. Use a strong generated
--   value and set the same value in the deployment environment as
--   DB_APP_PASSWORD. Never commit a real credential to this file. (With
--   log_statement = 'all' the CREATE ROLE statement, including the password,
--   reaches the server log; turn that off or rotate the password afterwards.)
--
-- Re-runnable: the CREATE ROLE is skipped if the role already exists, and
--   GRANT / REVOKE / ALTER DEFAULT PRIVILEGES statements are idempotent.
-- ============================================================================

-- 0. Refuse to run without a real password (psql meta-commands, so this must
--    stay outside any DO block). On a psql older than 13 the :{?...} test is
--    not understood and the script also stops here.
\if :{?app_password}
\else
  \echo 'ERROR: pass the password with -v app_password=... (see the header of this file). Nothing was changed.'
  \quit
\endif
SELECT (:'app_password' = '' OR upper(:'app_password') = 'CHANGE_ME') AS bad_password \gset
\if :bad_password
  \echo 'ERROR: app_password must be a real, non-empty password (not CHANGE_ME). Nothing was changed.'
  \quit
\endif

-- 1. Create the application role (skipped if it already exists).
--    NOTE: if the role already exists, its password is NOT changed here; use
--    ALTER ROLE loot_app PASSWORD '...' to rotate it.
SELECT format('CREATE ROLE loot_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loot_app') \gexec

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

-- 3b. The migration bookkeeping tables belong to the owner-privileged runner
--     only (it uses the admin pool); the application never reads or writes
--     them. Without this a query bug or injection in the app role could
--     rewrite migration state that the runner trusts at the next start. The
--     DO block skips tables that do not exist (e.g. no legacy
--     schema_migrations on a fresh install).
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['schema_migrations', 'schema_migrations_v2', 'migration_history',
                             'migration_locks', 'migration_config']
    LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM loot_app', t);
        END IF;
    END LOOP;
END $$;

-- 3c. Rights the application never uses on the account tables (same statements
--     as migration 079; they are repeated here because step 3 hands the rights
--     back on every run). The app never deletes a user or a campaign, and it
--     writes only these columns of users, so it cannot change is_superadmin.
--     When the app starts writing another users column, add it here AND in a
--     new migration, or that write fails with "permission denied".
REVOKE DELETE ON TABLE public.users FROM loot_app;
REVOKE DELETE ON TABLE public.campaigns FROM loot_app;
REVOKE UPDATE ON TABLE public.users FROM loot_app;
GRANT UPDATE (email, password, password_changed_at, login_attempts, locked_until, discord_id, role)
    ON TABLE public.users TO loot_app;

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
