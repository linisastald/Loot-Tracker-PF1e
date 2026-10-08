-- Migration: 081_loot_lastupdate_trigger.sql
-- Description: loot.lastupdate was only ever set by its column default on INSERT; no
-- UPDATE in the application (status buttons, DM item editor, split, appraise, identify,
-- sell) touched it, so the "most recently updated first" ordering of the loot pages was
-- really "most recently entered first". A BEFORE UPDATE trigger now stamps lastupdate
-- with the current time whenever a row actually changes.
--
-- Details:
--   * Fires only when something changed (OLD.* IS DISTINCT FROM NEW.*), so a no-op
--     UPDATE does not move the row to the top.
--   * If the statement itself sets lastupdate, that value is kept.
--   * Existing rows are not touched: their lastupdate still reflects when they were
--     entered, and starts tracking changes from now on.
--   * Trigger functions run with the rights of the user performing the UPDATE, so the
--     application login (loot_app) needs nothing beyond the UPDATE on loot it already has.
--   * database/init.sql carries the same function and trigger for fresh installs; this
--     migration is idempotent (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
-- UNTESTED against a real database. Roll-back preview (prints the NOTICE, then rolls
-- everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/081_loot_lastupdate_trigger.sql | psql -d <db> -v ON_ERROR_STOP=1
-- Manual roll-back: DROP TRIGGER IF EXISTS loot_set_lastupdate ON loot; DROP FUNCTION IF EXISTS set_loot_lastupdate();

BEGIN;

CREATE OR REPLACE FUNCTION set_loot_lastupdate()
RETURNS TRIGGER AS $$
BEGIN
    -- Keep an explicit value when the statement sets one; otherwise stamp now.
    IF NEW.lastupdate IS NOT DISTINCT FROM OLD.lastupdate THEN
        NEW.lastupdate := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_loot_lastupdate() IS
    'BEFORE UPDATE trigger function: stamps loot.lastupdate when a row changes (migration 081).';

DROP TRIGGER IF EXISTS loot_set_lastupdate ON loot;

CREATE TRIGGER loot_set_lastupdate
    BEFORE UPDATE ON loot
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION set_loot_lastupdate();

COMMENT ON COLUMN loot.lastupdate IS
    'Set on insert and refreshed by trigger loot_set_lastupdate whenever the row changes.';

DO $$
BEGIN
    RAISE NOTICE 'Migration 081: trigger loot_set_lastupdate installed on loot';
END
$$;

COMMIT;
