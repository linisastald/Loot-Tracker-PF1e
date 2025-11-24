-- Migration: Convert TIMESTAMP columns to TIMESTAMP WITH TIME ZONE
--
-- Diagnosis confirmed all timestamps are stored in UTC (server timezone is Etc/UTC)
-- This migration interprets existing timestamps as UTC and converts them to TIMESTAMPTZ
--
-- SAFETY: This migration is wrapped in a transaction and can be rolled back if needed
-- BACKUP: Ensure you have a database backup before running this migration

BEGIN;

-- =============================================================================
-- DROP VIEWS THAT DEPEND ON TIMESTAMP COLUMNS
-- =============================================================================
-- Views must be dropped before altering column types, then recreated
--
-- loot_view - depends on loot.lastupdate (TIMESTAMP → TIMESTAMPTZ)
-- gold_totals_view - depends on gold.session_date (TIMESTAMP → TIMESTAMPTZ)
-- index_usage_stats - no dependencies on our timestamp columns (skipped)

DROP VIEW IF EXISTS loot_view;
DROP VIEW IF EXISTS gold_totals_view;

-- =============================================================================
-- LOOT TABLE
-- =============================================================================
-- Only lastupdate column needs conversion (session_date is DATE type)

ALTER TABLE loot
    ALTER COLUMN lastupdate TYPE TIMESTAMP WITH TIME ZONE
    USING lastupdate AT TIME ZONE 'UTC';

COMMENT ON COLUMN loot.lastupdate IS 'Last update timestamp (UTC, timezone-aware)';

-- =============================================================================
-- APPRAISAL TABLE
-- =============================================================================
-- appraised_on is in this table (not loot)

ALTER TABLE appraisal
    ALTER COLUMN appraised_on TYPE TIMESTAMP WITH TIME ZONE
    USING appraised_on AT TIME ZONE 'UTC';

COMMENT ON COLUMN appraisal.appraised_on IS 'Appraisal timestamp (UTC, timezone-aware)';

-- =============================================================================
-- CONSUMABLEUSE TABLE
-- =============================================================================
-- consumed_on is in this table (not loot)

ALTER TABLE consumableuse
    ALTER COLUMN consumed_on TYPE TIMESTAMP WITH TIME ZONE
    USING consumed_on AT TIME ZONE 'UTC';

COMMENT ON COLUMN consumableuse.consumed_on IS 'Consumption timestamp (UTC, timezone-aware)';

-- =============================================================================
-- IDENTIFY TABLE
-- =============================================================================
-- identified_at is in this table (not loot)

ALTER TABLE identify
    ALTER COLUMN identified_at TYPE TIMESTAMP WITH TIME ZONE
    USING identified_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN identify.identified_at IS 'Identification timestamp (UTC, timezone-aware)';

-- =============================================================================
-- GOLD TABLE
-- =============================================================================
-- Gold transaction timestamps

ALTER TABLE gold
    ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
    USING session_date AT TIME ZONE 'UTC';

COMMENT ON COLUMN gold.session_date IS 'Session date (UTC, timezone-aware)';

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
COMMENT ON COLUMN users.locked_until IS 'Account lock expiration (UTC, timezone-aware)';

-- =============================================================================
-- FAME TABLE
-- =============================================================================
-- Fame tracking timestamp

ALTER TABLE fame
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN fame.updated_at IS 'Fame last update timestamp (UTC, timezone-aware)';

-- =============================================================================
-- FAME_HISTORY TABLE
-- =============================================================================
-- Fame history tracking

ALTER TABLE fame_history
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN fame_history.created_at IS 'Fame history entry timestamp (UTC, timezone-aware)';

-- =============================================================================
-- INVITES TABLE
-- =============================================================================
-- Invitation code timestamps

ALTER TABLE invites
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE invites
    ALTER COLUMN used_at TYPE TIMESTAMP WITH TIME ZONE
    USING used_at AT TIME ZONE 'UTC';

ALTER TABLE invites
    ALTER COLUMN expires_at TYPE TIMESTAMP WITH TIME ZONE
    USING expires_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN invites.created_at IS 'Invite creation timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN invites.used_at IS 'Invite usage timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN invites.expires_at IS 'Invite expiration timestamp (UTC, timezone-aware)';

-- =============================================================================
-- SESSION_MESSAGES TABLE
-- =============================================================================
-- Discord session message timestamps

ALTER TABLE session_messages
    ALTER COLUMN session_date TYPE TIMESTAMP WITH TIME ZONE
    USING session_date AT TIME ZONE 'UTC';

ALTER TABLE session_messages
    ALTER COLUMN session_time TYPE TIMESTAMP WITH TIME ZONE
    USING session_time AT TIME ZONE 'UTC';

ALTER TABLE session_messages
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN session_messages.session_date IS 'Session date (UTC, timezone-aware)';
COMMENT ON COLUMN session_messages.session_time IS 'Session time (UTC, timezone-aware)';
COMMENT ON COLUMN session_messages.created_at IS 'Message creation timestamp (UTC, timezone-aware)';

-- =============================================================================
-- GOLARION_WEATHER TABLE
-- =============================================================================
-- Weather tracking timestamp

ALTER TABLE golarion_weather
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN golarion_weather.created_at IS 'Weather entry creation timestamp (UTC, timezone-aware)';

-- =============================================================================
-- SHIPS TABLE
-- =============================================================================
-- Ship tracking timestamps

ALTER TABLE ships
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE ships
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN ships.created_at IS 'Ship creation timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN ships.updated_at IS 'Ship last update timestamp (UTC, timezone-aware)';

-- =============================================================================
-- CREW TABLE
-- =============================================================================
-- Crew tracking timestamps

ALTER TABLE crew
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE crew
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN crew.created_at IS 'Crew member creation timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN crew.updated_at IS 'Crew member last update timestamp (UTC, timezone-aware)';

-- =============================================================================
-- OUTPOSTS TABLE
-- =============================================================================
-- Outpost tracking timestamps

ALTER TABLE outposts
    ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE outposts
    ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
    USING updated_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN outposts.created_at IS 'Outpost creation timestamp (UTC, timezone-aware)';
COMMENT ON COLUMN outposts.updated_at IS 'Outpost last update timestamp (UTC, timezone-aware)';

-- =============================================================================
-- NOTES: Tables already using TIMESTAMP WITH TIME ZONE (no migration needed)
-- =============================================================================
-- These tables were created after timezone best practices were established:
-- - ship_infamy.updated_at
-- - infamy_history.created_at
-- - favored_ports.created_at
-- - port_visits.created_at
-- - impositions.created_at
-- - imposition_uses.created_at

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

    IF sample_time IS NOT NULL THEN
        RAISE NOTICE 'Sample loot timestamp (most recent):';
        RAISE NOTICE '  UTC: %', sample_time AT TIME ZONE 'UTC';
        RAISE NOTICE '  Eastern: %', sample_time AT TIME ZONE 'America/New_York';
        RAISE NOTICE '  Pacific: %', sample_time AT TIME ZONE 'America/Los_Angeles';
    ELSE
        RAISE NOTICE 'No loot timestamps found for sample verification';
    END IF;
END $$;

-- =============================================================================
-- RECREATE VIEWS WITH UPDATED COLUMN TYPES
-- =============================================================================
-- Recreate loot_view with new TIMESTAMPTZ columns

CREATE VIEW loot_view AS
 WITH quantity_sums AS (
         SELECT loot.name,
            loot.type,
            loot.size,
            loot.unidentified,
            loot.masterwork,
            loot.status,
            sum(loot.quantity) AS total_quantity
           FROM loot
          GROUP BY loot.name, loot.type, loot.size, loot.unidentified, loot.masterwork, loot.status
        ), loot_summary AS (
         SELECT min(l.id) AS summary_id,
            l.name,
            l.type,
            l.size,
            l.unidentified,
            l.masterwork,
            qs.total_quantity,
            NULL::numeric AS average_value,
            round(COALESCE(avg(a.believedvalue), NULL::numeric), 2) AS average_appraisal,
            array_agg(DISTINCT c_whohas.name) AS character_names,
            string_agg(DISTINCT (l.notes)::text, ' | '::text) AS notes,
            array_agg(json_build_object('character_name', c_appraisal.name, 'believedvalue', a.believedvalue)) AS appraisals,
            NULL::integer AS id,
            max(l.session_date) AS session_date,
            min(l.itemid) AS itemid,
            min(l.modids) AS modids,
            max(l.lastupdate) AS lastupdate,
                CASE
                    WHEN bool_or(((l.status)::text = 'Pending Sale'::text)) THEN 'Pending Sale'::text
                    ELSE NULL::text
                END AS status,
            l.status AS statuspage
           FROM ((((loot l
             LEFT JOIN characters c_whohas ON ((l.whohas = c_whohas.id)))
             LEFT JOIN appraisal a ON ((l.id = a.lootid)))
             LEFT JOIN characters c_appraisal ON ((a.characterid = c_appraisal.id)))
             LEFT JOIN quantity_sums qs ON ((((l.name)::text = (qs.name)::text) AND ((l.type)::text = (qs.type)::text) AND (((l.size)::text = (qs.size)::text) OR ((l.size IS NULL) AND (qs.size IS NULL))) AND ((l.unidentified = qs.unidentified) OR ((l.unidentified IS NULL) AND (qs.unidentified IS NULL))) AND ((l.masterwork = qs.masterwork) OR ((l.masterwork IS NULL) AND (qs.masterwork IS NULL))) AND (((l.status)::text = (qs.status)::text) OR ((l.status IS NULL) AND (qs.status IS NULL))))))
          GROUP BY l.name, l.type, l.size, l.unidentified, l.masterwork, l.status, qs.total_quantity
        ), individual_rows AS (
         SELECT l.id,
            l.session_date,
            l.quantity,
            l.name,
            l.unidentified,
            l.masterwork,
            l.type,
            l.size,
            l.status,
            l.itemid,
            l.modids,
            l.charges,
            l.value,
            l.whohas,
            l.whoupdated,
            l.lastupdate,
            l.notes,
            l.spellcraft_dc,
            l.dm_notes,
            c_whohas.name AS character_name,
            round(COALESCE(avg(a.believedvalue), NULL::numeric), 2) AS average_appraisal,
            array_agg(json_build_object('character_name', c_appraisal.name, 'believedvalue', a.believedvalue)) AS appraisals
           FROM (((loot l
             LEFT JOIN characters c_whohas ON ((l.whohas = c_whohas.id)))
             LEFT JOIN appraisal a ON ((l.id = a.lootid)))
             LEFT JOIN characters c_appraisal ON ((a.characterid = c_appraisal.id)))
          GROUP BY l.id, c_whohas.name
        )
 SELECT 'summary'::text AS row_type,
    ls.summary_id AS id,
    ls.session_date,
    ls.total_quantity AS quantity,
    ls.name,
    ls.unidentified,
    ls.masterwork,
    ls.type,
    ls.size,
    ls.average_value AS value,
    ls.itemid,
    ls.modids,
    ls.status,
    ls.statuspage,
    ls.character_names[1] AS character_name,
    NULL::integer AS whoupdated,
    ls.lastupdate,
    ls.average_appraisal,
    ls.notes,
    ls.appraisals
   FROM loot_summary ls
UNION ALL
 SELECT 'individual'::text AS row_type,
    ir.id,
    ir.session_date,
    ir.quantity,
    ir.name,
    ir.unidentified,
    ir.masterwork,
    ir.type,
    ir.size,
    ir.value,
    ir.itemid,
    ir.modids,
    ir.status,
    ir.status AS statuspage,
    ir.character_name,
    ir.whoupdated,
    ir.lastupdate,
    ir.average_appraisal,
    ir.notes,
    ir.appraisals
   FROM individual_rows ir
  ORDER BY 1, 5, 2;

COMMENT ON VIEW loot_view IS 'Aggregated loot view with individual and summary rows - updated for TIMESTAMPTZ columns';

-- Recreate gold_totals_view with updated TIMESTAMPTZ column (gold.session_date)
CREATE VIEW gold_totals_view AS
SELECT
    COALESCE(SUM(platinum), 0) as total_platinum,
    COALESCE(SUM(gold), 0) as total_gold,
    COALESCE(SUM(silver), 0) as total_silver,
    COALESCE(SUM(copper), 0) as total_copper,
    COALESCE(
        (10 * SUM(platinum)) +
        SUM(gold) +
        (SUM(silver) / 10.0) +
        (SUM(copper) / 100.0),
        0
    ) as total_value_in_gold,
    COUNT(*) as total_transactions,
    MAX(session_date) as last_transaction_date
FROM gold;

COMMENT ON VIEW gold_totals_view IS 'Provides current gold totals and overview statistics - updated for TIMESTAMPTZ columns';

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
