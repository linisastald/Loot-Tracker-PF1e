-- Migration: Add missing indexes on foreign key columns for query performance
-- These foreign keys had no indexes, causing full table scans on JOINs

-- CRITICAL: Indexes on frequently joined columns
CREATE INDEX IF NOT EXISTS idx_appraisal_lootid ON appraisal(lootid);
CREATE INDEX IF NOT EXISTS idx_appraisal_characterid ON appraisal(characterid);
CREATE INDEX IF NOT EXISTS idx_loot_itemid ON loot(itemid);

-- HIGH PRIORITY: Foreign key indexes for reporting/lookup queries
CREATE INDEX IF NOT EXISTS idx_sold_lootid ON sold(lootid);
CREATE INDEX IF NOT EXISTS idx_identify_lootid ON identify(lootid);
CREATE INDEX IF NOT EXISTS idx_identify_characterid ON identify(characterid);
CREATE INDEX IF NOT EXISTS idx_loot_whoupdated ON loot(whoupdated);

-- Composite index for common loot filtering pattern (status + character)
CREATE INDEX IF NOT EXISTS idx_loot_status_whohas ON loot(status, whohas);

-- Remove duplicate indexes (fame table had two identical indexes)
DROP INDEX IF EXISTS fame_character_id_idx;
-- Keeps idx_fame_character_id (consistent naming convention)

DROP INDEX IF EXISTS fame_history_character_id_idx;
-- Keeps idx_fame_history_character_id (consistent naming convention)

COMMENT ON INDEX idx_appraisal_lootid IS 'FK index: appraisal -> loot';
COMMENT ON INDEX idx_appraisal_characterid IS 'FK index: appraisal -> characters';
COMMENT ON INDEX idx_loot_itemid IS 'FK index: loot -> item';
COMMENT ON INDEX idx_sold_lootid IS 'FK index: sold -> loot';
COMMENT ON INDEX idx_identify_lootid IS 'FK index: identify -> loot';
COMMENT ON INDEX idx_identify_characterid IS 'FK index: identify -> characters';
COMMENT ON INDEX idx_loot_whoupdated IS 'FK index: loot -> users (who updated)';
COMMENT ON INDEX idx_loot_status_whohas IS 'Composite index for common loot filtering by status and character';
