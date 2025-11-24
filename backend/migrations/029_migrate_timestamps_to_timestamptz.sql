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

DROP VIEW IF EXISTS loot_view;

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
