-- Migration: 068_db_cleanup_and_fixes.sql
-- Description: W01 database sweep, forward fixes that cannot be made by editing applied
--   migrations. Findings: F-0041, F-0048, F-0890, F-0053, F-0877, F-0870, F-0878, F-0886.
--   Also the owner-approved removal of three objects the application no longer uses.
--
--   1. Unused session objects (owner-approved): DROP VIEW upcoming_sessions, DROP TABLE
--      session_notes, DROP TABLE session_messages. No application code reads or writes
--      them any more (verified by grep of backend/src, discord-handler and frontend/src;
--      the only mention is a comment in sessionController.js). Dropping a table also
--      drops its own indexes and its tenant RLS policy. NO CASCADE is used on purpose: if
--      some other object still depends on one of them the migration fails and the server
--      does not start, instead of silently dropping that object. The data in the two
--      tables is discarded.
--      A fresh install still creates session_messages in init.sql (migrations 029, 044,
--      045, 047 and 051 alter it) and session_notes / upcoming_sessions in migration 014;
--      this migration then removes them, so a fresh install and production end up equal.
--   2. F-0041: city.size CHECK allows only six sizes, but the application offers Thorp and
--      Hamlet too (City.js SETTLEMENT_SIZES). Re-create the CHECK with all eight.
--   3. F-0048 / F-0890: golarion_holidays has campaign_id but no RLS, so any campaign's DM
--      could edit and delete another campaign's custom holidays. campaign_id now defaults
--      from the app.current_campaign GUC (the model's INSERT omits the column), existing
--      custom holidays with campaign_id NULL are assigned to campaign 1 (the campaign that
--      owns all pre-multi-campaign data, see migration 044), and four per-command policies
--      are added: official rows (campaign_id IS NULL) stay readable by everyone but can only
--      be written in cross-campaign mode ('all'); custom rows are visible and writable only
--      in their own campaign.
--   4. F-0053: migration 052 drops idx_appraisal_characterid as a prefix of
--      idx_appraisal_character_time, which fresh installs never had. Create it.
--   5. F-0877: gold_totals_view collapsed the whole total to 0 when one denomination summed
--      to NULL. Coalesce each SUM individually. Same columns and types, security_invoker kept.
--   6. F-0870: the 'Evade!' imposition description was garbled ("ship's100 feet").
--   7. F-0878 / F-0886: drop indexes that duplicate a unique index or the leftmost columns of
--      a unique constraint (each only when the covering unique index exists).
--
-- Idempotent: every statement is IF [NOT] EXISTS, guarded, or a no-op on the second run.
-- Runs as the migration owner (RLS does not apply to it); the GUC is still set to the
-- cross-campaign mode for the data statements so they do not depend on that, as in 067.
--
-- UNTESTED against a real database. Preview on production (rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/068_db_cleanup_and_fixes.sql | psql -d <db> -v ON_ERROR_STOP=1
-- Check what would be discarded first:
--   SELECT 'session_messages' AS t, count(*) FROM session_messages
--   UNION ALL SELECT 'session_notes', count(*) FROM session_notes;
--   SELECT id, name, campaign_id FROM golarion_holidays WHERE is_custom AND campaign_id IS NULL;

BEGIN;

-- ============================================================================
-- 1. Unused session objects
-- ============================================================================
DROP VIEW IF EXISTS upcoming_sessions;
DROP TABLE IF EXISTS session_notes;
DROP TABLE IF EXISTS session_messages;

-- ============================================================================
-- 2. city.size CHECK (F-0041). The constraint was created unnamed in 019; find it by the
--    column it covers, drop it, and add it again under a stable name.
-- ============================================================================
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE c.contype = 'c'
           AND n.nspname = current_schema()
           AND t.relname = 'city'
           AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'size')]
    LOOP
        EXECUTE format('ALTER TABLE city DROP CONSTRAINT %I', con.conname);
    END LOOP;

    ALTER TABLE city ADD CONSTRAINT city_size_check CHECK (size IN ('Thorp', 'Hamlet', 'Village', 'Small Town', 'Large Town', 'Small City', 'Large City', 'Metropolis'));
END
$$;

-- ============================================================================
-- 3. golarion_holidays tenant scoping (F-0048, F-0890)
-- ============================================================================
ALTER TABLE golarion_holidays ALTER COLUMN campaign_id SET DEFAULT NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int;

DO $$
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    UPDATE golarion_holidays h
       SET campaign_id = 1
     WHERE h.is_custom
       AND h.campaign_id IS NULL
       AND EXISTS (SELECT 1 FROM campaigns WHERE id = 1)
       AND NOT EXISTS (SELECT 1 FROM golarion_holidays x WHERE x.campaign_id = 1 AND x.name = h.name);
END
$$;

ALTER TABLE golarion_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golarion_holidays_select ON golarion_holidays;
CREATE POLICY golarion_holidays_select ON golarion_holidays
    FOR SELECT
    USING (
        campaign_id IS NULL
        OR campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

DROP POLICY IF EXISTS golarion_holidays_insert ON golarion_holidays;
CREATE POLICY golarion_holidays_insert ON golarion_holidays
    FOR INSERT
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

DROP POLICY IF EXISTS golarion_holidays_update ON golarion_holidays;
CREATE POLICY golarion_holidays_update ON golarion_holidays
    FOR UPDATE
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

DROP POLICY IF EXISTS golarion_holidays_delete ON golarion_holidays;
CREATE POLICY golarion_holidays_delete ON golarion_holidays
    FOR DELETE
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- ============================================================================
-- 4. Appraisal FK index that fresh installs lost to migration 052 (F-0053)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_appraisal_character_time ON appraisal(characterid, appraised_on);

-- ============================================================================
-- 5. gold_totals_view: coalesce each SUM on its own (F-0877)
-- ============================================================================
CREATE OR REPLACE VIEW gold_totals_view WITH (security_invoker = true) AS
SELECT
    COALESCE(SUM(platinum), 0) AS total_platinum,
    COALESCE(SUM(gold), 0) AS total_gold,
    COALESCE(SUM(silver), 0) AS total_silver,
    COALESCE(SUM(copper), 0) AS total_copper,
    (10 * COALESCE(SUM(platinum), 0))
        + COALESCE(SUM(gold), 0)
        + (COALESCE(SUM(silver), 0) / 10.0)
        + (COALESCE(SUM(copper), 0) / 100.0) AS total_value_in_gold,
    COUNT(*) AS total_transactions,
    MAX(session_date) AS last_transaction_date
FROM gold;

COMMENT ON VIEW gold_totals_view IS 'Provides current gold totals and overview statistics (each denomination summed on its own, NULL-safe)';

-- ============================================================================
-- 6. 'Evade!' imposition description (F-0870). Only touches the row while it still holds
--    the garbled seed text, so an edited description is never overwritten.
-- ============================================================================
UPDATE impositions
   SET description = 'The PCs'' ship and its entire crew are teleported 100 feet in any direction. This imposition can be used once per day.'
 WHERE name = 'Evade!'
   AND description = 'Teleport your ship''s100 feet in any direction. This imposition can be used once per day.';

-- ============================================================================
-- 7. Redundant indexes (F-0878, F-0886). Dropped only when the unique index that already
--    serves the same lookups exists, so an install without it keeps its index.
--    (index to drop, unique index that covers it)
-- ============================================================================
DO $$
DECLARE
    pair TEXT[];
BEGIN
    FOREACH pair SLICE 1 IN ARRAY ARRAY[
        ARRAY['idx_users_google_id', 'users_google_id_key'],
        ARRAY['idx_invites_code', 'invites_code_key'],
        ARRAY['idx_fame_character_id', 'fame_character_id_key'],
        ARRAY['idx_golarion_calendar_notes_campaign_id', 'golarion_calendar_notes_campaign_year_month_day_key'],
        ARRAY['idx_favored_ports_campaign_id', 'favored_ports_campaign_port_name_key']
    ] LOOP
        IF to_regclass(pair[2]) IS NOT NULL THEN
            EXECUTE format('DROP INDEX IF EXISTS %I', pair[1]);
        END IF;
    END LOOP;
END
$$;

COMMIT;
