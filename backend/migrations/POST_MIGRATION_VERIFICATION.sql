-- POST-MIGRATION VERIFICATION
-- Run this AFTER executing migration 029
-- This script verifies the migration completed successfully

-- =============================================================================
-- 1. Column Type Verification
-- =============================================================================
SELECT 'COLUMN TYPE VERIFICATION' as check_type;
SELECT
    table_name,
    column_name,
    data_type,
    CASE
        WHEN data_type = 'timestamp with time zone' THEN '✓ Migrated successfully'
        WHEN data_type = 'timestamp without time zone' THEN '✗ NOT migrated - ERROR!'
        ELSE '? Unexpected type'
    END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('loot', 'appraisal', 'consumableuse', 'identify', 'gold', 'users', 'fame', 'fame_history', 'invites', 'session_messages', 'golarion_weather', 'ships', 'crew', 'outposts')
  AND column_name IN ('lastupdate', 'session_date', 'created_at', 'updated_at', 'joined', 'appraised_on', 'consumed_on', 'identified_at', 'session_time', 'locked_until', 'used_at', 'expires_at')
ORDER BY table_name, column_name;

-- =============================================================================
-- 2. Data Integrity Check
-- =============================================================================
SELECT 'DATA INTEGRITY CHECK' as check_type;

-- Count rows before and after (should be identical)
SELECT
    'loot' as table_name,
    COUNT(*) as total_rows,
    COUNT(lastupdate) as non_null_timestamps,
    COUNT(*) FILTER (WHERE lastupdate IS NOT NULL AND EXTRACT(timezone FROM lastupdate) = 0) as utc_timestamps
FROM loot
UNION ALL
SELECT
    'gold',
    COUNT(*),
    COUNT(session_date),
    COUNT(*) FILTER (WHERE session_date IS NOT NULL AND EXTRACT(timezone FROM session_date) = 0)
FROM gold
UNION ALL
SELECT
    'users',
    COUNT(*),
    COUNT(joined),
    COUNT(*) FILTER (WHERE joined IS NOT NULL AND EXTRACT(timezone FROM joined) = 0)
FROM users;

-- =============================================================================
-- 3. Sample Timestamp Verification
-- =============================================================================
SELECT 'SAMPLE TIMESTAMP VERIFICATION' as check_type;
SELECT
    id,
    name,
    lastupdate as timestamp_utc,
    EXTRACT(timezone FROM lastupdate) / 3600 as timezone_offset_hours,
    lastupdate AT TIME ZONE 'America/New_York' as displayed_eastern,
    lastupdate AT TIME ZONE 'America/Los_Angeles' as displayed_pacific
FROM loot
WHERE lastupdate IS NOT NULL
ORDER BY lastupdate DESC
LIMIT 5;

-- =============================================================================
-- 4. Timezone Display Examples
-- =============================================================================
SELECT 'TIMEZONE DISPLAY EXAMPLES' as check_type;
SELECT
    'Current Server Time' as description,
    NOW() as timestamp_with_tz,
    EXTRACT(timezone FROM NOW()) / 3600 as timezone_offset_hours,
    NOW() AT TIME ZONE 'America/New_York' as eastern_time,
    NOW() AT TIME ZONE 'America/Los_Angeles' as pacific_time;

-- =============================================================================
-- 5. Verify Timezone Storage
-- =============================================================================
SELECT 'TIMEZONE STORAGE VERIFICATION' as check_type;

-- All timestamps should show +00 (UTC) offset
SELECT
    table_name,
    column_name,
    pg_typeof(lastupdate) as column_type,
    lastupdate::text as sample_value
FROM (
    SELECT 'loot' as table_name, 'lastupdate' as column_name, lastupdate
    FROM loot
    WHERE lastupdate IS NOT NULL
    LIMIT 1
) sub
UNION ALL
SELECT
    'users',
    'joined',
    pg_typeof(joined),
    joined::text
FROM users
WHERE joined IS NOT NULL
LIMIT 1;

-- =============================================================================
-- 6. Index and Constraint Check
-- =============================================================================
SELECT 'INDEX AND CONSTRAINT CHECK' as check_type;
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('loot', 'gold', 'users', 'fame_history', 'consumableuse')
  AND (indexdef LIKE '%lastupdate%'
     OR indexdef LIKE '%created_at%'
     OR indexdef LIKE '%joined%'
     OR indexdef LIKE '%consumed_on%'
     OR indexdef LIKE '%session_date%')
ORDER BY tablename, indexname;

-- =============================================================================
-- 7. Functional Test - Campaign Timezone Display
-- =============================================================================
SELECT 'CAMPAIGN TIMEZONE DISPLAY TEST' as check_type;

-- Simulate displaying timestamps in different campaign timezones
WITH sample_data AS (
    SELECT
        id,
        name,
        lastupdate
    FROM loot
    WHERE lastupdate IS NOT NULL
    ORDER BY lastupdate DESC
    LIMIT 3
)
SELECT
    id,
    name,
    lastupdate as utc_timestamp,
    to_char(lastupdate AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI:SS TZ') as eastern_display,
    to_char(lastupdate AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI:SS TZ') as central_display,
    to_char(lastupdate AT TIME ZONE 'America/Denver', 'YYYY-MM-DD HH24:MI:SS TZ') as mountain_display,
    to_char(lastupdate AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS TZ') as pacific_display
FROM sample_data;

-- =============================================================================
-- 8. Migration Metadata Check
-- =============================================================================
SELECT 'MIGRATION METADATA CHECK' as check_type;
SELECT
    migration_id,
    filename,
    applied_at,
    execution_time_ms,
    applied_by,
    checksum
FROM schema_migrations_v2
WHERE filename LIKE '%029%timestamp%'
ORDER BY applied_at DESC
LIMIT 1;

-- =============================================================================
-- SUCCESS CRITERIA
-- =============================================================================
--
-- ✓ MIGRATION SUCCESSFUL if:
--   - All columns show 'timestamp with time zone' type
--   - Row counts match pre-migration counts
--   - Timezone offset is 0 (UTC) for all timestamps
--   - Sample timestamps include '+00' suffix
--   - Campaign timezone displays work correctly
--
-- ✗ MIGRATION FAILED if:
--   - Any columns still show 'timestamp without time zone'
--   - Row counts don't match
--   - Timezone offset is not 0
--   - Sample timestamps don't include timezone info
--
-- NEXT STEPS IF SUCCESSFUL:
--   1. Update application code to handle TIMESTAMPTZ
--   2. Update frontend to display in campaign timezone
--   3. Test thoroughly in development
--   4. Deploy to production
--
-- ROLLBACK IF FAILED:
--   1. ROLLBACK; (if still in transaction)
--   2. Or restore from backup
--   3. Investigate why migration failed
--   4. Fix issues and retry
--
-- =============================================================================
