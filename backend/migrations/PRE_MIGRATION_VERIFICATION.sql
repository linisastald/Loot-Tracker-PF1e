-- PRE-MIGRATION VERIFICATION
-- Run this BEFORE executing migration 029
-- This script checks your data and confirms it's safe to migrate

-- =============================================================================
-- 1. Server Configuration Check
-- =============================================================================
SELECT 'SERVER CONFIGURATION' as check_type;
SELECT
    'Server Timezone' as setting,
    current_setting('timezone') as value,
    CASE
        WHEN current_setting('timezone') IN ('UTC', 'Etc/UTC') THEN '✓ Safe for UTC migration'
        ELSE '⚠ WARNING: Server not in UTC - review migration script!'
    END as status;

SELECT
    'Current Server Time' as setting,
    NOW()::text as value,
    '✓ Shows timezone offset' as status;

-- =============================================================================
-- 2. Data Volume Check
-- =============================================================================
SELECT 'DATA VOLUME CHECK' as check_type;
SELECT
    'loot' as table_name,
    COUNT(*) as row_count,
    COUNT(lastupdate) as timestamps_to_migrate
FROM loot
UNION ALL
SELECT
    'gold',
    COUNT(*),
    COUNT(session_date)
FROM gold
UNION ALL
SELECT
    'users',
    COUNT(*),
    COUNT(joined)
FROM users
UNION ALL
SELECT
    'appraisal',
    COUNT(*),
    COUNT(appraised_on)
FROM appraisal
UNION ALL
SELECT
    'consumableuse',
    COUNT(*),
    COUNT(consumed_on)
FROM consumableuse
UNION ALL
SELECT
    'identify',
    COUNT(*),
    COUNT(identified_at)
FROM identify;

-- =============================================================================
-- 3. Sample Data Verification
-- =============================================================================
SELECT 'SAMPLE DATA VERIFICATION' as check_type;
SELECT
    'Most Recent Loot' as data_type,
    id,
    name,
    lastupdate as current_timestamp,
    lastupdate AT TIME ZONE 'UTC' as will_become_utc,
    lastupdate AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York' as displayed_eastern,
    lastupdate AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles' as displayed_pacific
FROM loot
WHERE lastupdate IS NOT NULL
ORDER BY lastupdate DESC
LIMIT 3;

-- =============================================================================
-- 4. Null Value Check
-- =============================================================================
SELECT 'NULL VALUES CHECK' as check_type;
SELECT
    'loot.lastupdate' as column_name,
    COUNT(*) FILTER (WHERE lastupdate IS NULL) as null_count,
    COUNT(*) as total_count,
    ROUND(100.0 * COUNT(*) FILTER (WHERE lastupdate IS NULL) / COUNT(*), 2) || '%' as null_percentage
FROM loot
UNION ALL
SELECT
    'loot.session_date',
    COUNT(*) FILTER (WHERE session_date IS NULL),
    COUNT(*),
    ROUND(100.0 * COUNT(*) FILTER (WHERE session_date IS NULL) / COUNT(*), 2) || '%'
FROM loot
UNION ALL
SELECT
    'users.joined',
    COUNT(*) FILTER (WHERE joined IS NULL),
    COUNT(*),
    ROUND(100.0 * COUNT(*) FILTER (WHERE joined IS NULL) / COUNT(*), 2) || '%'
FROM users;

-- =============================================================================
-- 5. Timestamp Column Type Check
-- =============================================================================
SELECT 'CURRENT COLUMN TYPES' as check_type;
SELECT
    table_name,
    column_name,
    data_type,
    CASE
        WHEN data_type = 'timestamp without time zone' THEN '→ Will migrate to timestamptz'
        WHEN data_type = 'timestamp with time zone' THEN '✓ Already timestamptz'
        ELSE '? Unknown type'
    END as migration_status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('lastupdate', 'session_date', 'created_at', 'updated_at', 'joined', 'appraised_on', 'consumed_on', 'identified_at', 'session_time', 'locked_until', 'used_at', 'expires_at')
ORDER BY table_name, column_name;

-- =============================================================================
-- 6. Expected Size Impact
-- =============================================================================
SELECT 'STORAGE IMPACT' as check_type;
SELECT
    'TIMESTAMP columns' as column_type,
    '8 bytes per value' as current_size,
    '8 bytes per value' as new_size,
    'No storage increase' as impact;

-- =============================================================================
-- INTERPRETATION GUIDE
-- =============================================================================
--
-- ✓ SAFE TO MIGRATE if:
--   - Server Timezone is UTC or Etc/UTC
--   - Sample timestamps match when you actually added those items
--   - No unexpected null values
--
-- ⚠ DO NOT MIGRATE if:
--   - Server Timezone is not UTC
--   - Sample timestamps don't match reality
--   - You see unexpected data patterns
--
-- NEXT STEPS:
--   1. Review all output above
--   2. Manually verify sample loot timestamps match your records
--   3. Create database backup
--   4. Run migration 029_migrate_timestamps_to_timestamptz.sql
--   5. Run POST_MIGRATION_VERIFICATION.sql
--
-- =============================================================================
