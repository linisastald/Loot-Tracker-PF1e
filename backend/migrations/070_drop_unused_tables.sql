-- Migration: 070_drop_unused_tables.sql
-- Description: Owner-approved removal of three tables the application no longer uses
--   (code review findings F-0885, F-0889): fame, fame_history, golarion_calendar_notes.
--
--   Evidence that they are unused (grep of backend/src non-test code, frontend/src,
--   discord-handler, scripts and docker; no view, trigger, function or foreign key from
--   another table refers to them; they are not in the dbUtils allow-list):
--     * fame / fame_history: no model, controller, route or UI. Only their own tenant RLS
--       policies (045), campaign_id columns (044/047) and legacy-drift repairs (051) mention them.
--     * golarion_calendar_notes: replaced by golarion_notes in migration 040, which copied
--       every legacy row across; no code writes the old table.
--   Dropping a table also drops its own indexes, constraints and RLS policies. The policies
--   are dropped explicitly below so the migration names everything it removes. NO CASCADE is
--   used on purpose: if some other object still depends on one of these tables the migration
--   fails and the server does not start, instead of silently dropping that object.
--   fame_history is dropped before fame. The data in all three tables is discarded.
--
--   A fresh install still creates the three tables in database/init.sql, because migrations
--   040, 044, 045, 047 and 051 alter or read them unguarded; this migration then removes them,
--   so a fresh install and production end in the same schema (same approach as session_messages
--   in 068).
--
-- Idempotent: every statement is IF EXISTS or guarded, and is a no-op on the second run.
--
-- Check what would be discarded BEFORE deploying:
--   SELECT 'fame' AS t, count(*) FROM fame
--   UNION ALL SELECT 'fame_history', count(*) FROM fame_history
--   UNION ALL SELECT 'golarion_calendar_notes', count(*) FROM golarion_calendar_notes;
--   -- legacy calendar notes not present in golarion_notes (expect 0 rows):
--   SELECT gcn.year, gcn.month, gcn.day, gcn.note FROM golarion_calendar_notes gcn
--   WHERE NOT EXISTS (SELECT 1 FROM golarion_notes gn
--     WHERE gn.start_year = gcn.year AND gn.start_month = gcn.month AND gn.start_day = gcn.day
--       AND gn.note = gcn.note);
-- Preview on production (rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/070_drop_unused_tables.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

-- Name the tenant policies (created by 045) before the tables go.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['fame_history', 'fame', 'golarion_calendar_notes'] LOOP
        IF to_regclass(t) IS NOT NULL THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
        END IF;
    END LOOP;
END
$$;

DROP TABLE IF EXISTS fame_history;
DROP TABLE IF EXISTS fame;
DROP TABLE IF EXISTS golarion_calendar_notes;

COMMIT;
