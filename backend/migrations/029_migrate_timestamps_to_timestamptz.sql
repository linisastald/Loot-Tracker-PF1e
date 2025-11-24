-- Migration: Convert TIMESTAMP columns to TIMESTAMP WITH TIME ZONE
--
-- Diagnosis confirmed all timestamps are stored in UTC (server timezone is Etc/UTC)
-- This migration interprets existing timestamps as UTC and converts them to TIMESTAMPTZ
--
-- SAFETY: This migration is wrapped in a transaction and can be rolled back if needed
-- BACKUP: Ensure you have a database backup before running this migration

BEGIN;

-- =============================================================================
-- LOOT TABLE
-- =============================================================================
-- Primary timestamp tracking for loot items

ALTER TABLE loot
    ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
    USING lastupdate AT TIME ZONE 'UTC';

ALTER TABLE loot
    ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
    USING session_date AT TIME ZONE 'UTC';

ALTER TABLE loot
    ALTER COLUMN appraised_on TYPE TIMESTAMP WITH TIME ZONE
    USING appraised_on AT TIME ZONE 'UTC';

ALTER TABLE loot
    ALTER COLUMN consumed_on TYPE TIMESTAMP WITH TIME ZONE
    USING consumed_on AT TIME ZONE 'UTC';

ALTER TABLE loot
    ALTER COLUMN identified_at TYPE TIMESTAMP WITH TIME ZONE
    USING identified_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN loot.lastupdate IS 'Last update timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN loot.session_date IS 'Session date (UTC, timezone-aware)';

-- =============================================================================
-- GOLD_TRANSACTIONS TABLE
-- =============================================================================
-- Gold transaction timestamps

ALTER TABLE gold_transactions
    ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
    USING session_date AT TIME ZONE 'UTC';

ALTER TABLE gold_transactions
    ALTER COLUMN session_time TYPE TIMESTAMP WITH TIME ZONE
    USING session_time AT TIME ZONE 'UTC';

ALTER TABLE gold_transactions
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN gold_transactions.session_date IS 'Session date (UTC, timezone-aware)';
COMMENT ON COLUMN gold_transactions.session_time IS 'Session time (UTC, timezone-aware)';

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- User account timestamps

ALTER TABLE users
    ALTER COLUMN joined TYPE TIMESTAMP WITH TIME ZONE
    USING joined AT TIME ZONE 'UTC';

ALTER TABLE users
    ALTER COLUMN locked_until TYPE TIMESTAMP WITH TIME ZONE
    USING locked_until AT TIME ZONE 'UTC';

COMMENT ON COLUMN users.joined IS 'User registration timestamp (UTC, timezone-aware)';

-- =============================================================================
-- CHARACTERS TABLE
-- =============================================================================
-- Character creation and update timestamps

ALTER TABLE characters
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE characters
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN characters.created_at IS 'Character creation timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN characters.updated_at IS 'Character last update timestamp (UTC, timezone-aware)';

-- =============================================================================
-- FAME_HISTORY TABLE
-- =============================================================================
-- Fame/Infamy tracking timestamps

ALTER TABLE fame_history
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE fame_history
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

-- =============================================================================
-- INVITE_CODES TABLE
-- =============================================================================
-- Invitation code timestamps

ALTER TABLE invite_codes
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE invite_codes
    ALTER COLUMN used_at TYPE TIMESTAMP WITH TIME ZONE
    USING used_at AT TIME ZONE 'UTC';

ALTER TABLE invite_codes
    ALTER COLUMN expires_at TYPE TIMESTAMP WITH TIME ZONE
    USING expires_at AT TIME ZONE 'UTC';

-- =============================================================================
-- GOLD_HISTORY TABLE
-- =============================================================================
-- Gold history tracking

ALTER TABLE gold_history
    ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
    USING session_date AT TIME ZONE 'UTC';

ALTER TABLE gold_history
    ALTER COLUMN session_time TYPE TIMESTAMP WITH TIME ZONE
    USING session_time AT TIME ZONE 'UTC';

ALTER TABLE gold_history
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

-- =============================================================================
-- NOTES: Ships, Crew, Outposts, Weather already use TIMESTAMP WITH TIME ZONE
-- =============================================================================
-- These tables were created after the timezone best practices were established:
-- - ships.updated_at
-- - crew.created_at
-- - outposts.created_at
-- - weather.created_at
-- No migration needed for these tables.

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these after migration to verify data integrity

-- Verify loot timestamps
DO $$
DECLARE
    loot_count INTEGER;
    loot_null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO loot_count FROM loot;
    SELECT COUNT(*) INTO loot_null_count FROM loot WHERE lastupdate IS NULL;

    RAISE NOTICE 'Loot table verification:';
    RAISE NOTICE '  Total rows: %', loot_count;
    RAISE NOTICE '  Null lastupdate: %', loot_null_count;
    RAISE NOTICE '  Valid timestamps: %', loot_count - loot_null_count;
END $$;

-- Verify users timestamps
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;

    RAISE NOTICE 'Users table verification:';
    RAISE NOTICE '  Total users: %', user_count;
END $$;

-- Sample verification: Show some converted timestamps
DO $$
DECLARE
    sample_time TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT lastupdate INTO sample_time
    FROM loot
    WHERE lastupdate IS NOT NULL
    ORDER BY lastupdate DESC
    LIMIT 1;

    RAISE NOTICE 'Sample loot timestamp (most recent):';
    RAISE NOTICE '  UTC: %', sample_time AT TIME ZONE 'UTC';
    RAISE NOTICE '  Eastern: %', sample_time AT TIME ZONE 'America/New_York';
    RAISE NOTICE '  Pacific: %', sample_time AT TIME ZONE 'America/Los_Angeles';
END $$;

-- =============================================================================
-- SUCCESS!
-- =============================================================================
COMMIT;

-- After successful commit, you should see:
-- - NOTICE messages showing verification results
-- - All timestamps now include timezone information (+00 for UTC)
-- - Timestamps can be displayed in any timezone using AT TIME ZONE

-- Example query to display timestamps in campaign timezone:
-- SELECT id, name,
--        lastupdate AT TIME ZONE 'America/New_York' as eastern_time,
--        lastupdate AT TIME ZONE 'America/Los_Angeles' as pacific_time
-- FROM loot
-- ORDER BY lastupdate DESC
-- LIMIT 5;
