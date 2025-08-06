-- Performance Indexes for Pathfinder Loot Tracker
-- This file adds indexes to improve query performance based on common access patterns
-- Run this after initial database setup

-- ====================================================================================
-- LOOT TABLE INDEXES - Most critical for application performance
-- ====================================================================================

-- Index for status-based queries (most common filter)
CREATE INDEX IF NOT EXISTS idx_loot_status ON loot(status);

-- Composite index for status + identification queries (common in sales)
CREATE INDEX IF NOT EXISTS idx_loot_status_identified ON loot(status, unidentified) WHERE unidentified IS NOT NULL;

-- Composite index for status + value queries (sales calculations)
CREATE INDEX IF NOT EXISTS idx_loot_status_value ON loot(status, value) WHERE value IS NOT NULL;

-- Index for session date queries (date range filtering)
CREATE INDEX IF NOT EXISTS idx_loot_session_date ON loot(session_date);

-- Index for character ownership queries
CREATE INDEX IF NOT EXISTS idx_loot_whohas ON loot(whohas) WHERE whohas IS NOT NULL;

-- Index for item type filtering
CREATE INDEX IF NOT EXISTS idx_loot_type ON loot(type);

-- Index for last update timestamp (sorting)
CREATE INDEX IF NOT EXISTS idx_loot_lastupdate ON loot(lastupdate);

-- Composite index for loot summary grouping (used in loot_view)
CREATE INDEX IF NOT EXISTS idx_loot_grouping ON loot(name, type, size, unidentified, masterwork, status);

-- Index for item reference lookups
CREATE INDEX IF NOT EXISTS idx_loot_itemid ON loot(itemid) WHERE itemid IS NOT NULL;

-- ====================================================================================
-- APPRAISAL TABLE INDEXES
-- ====================================================================================

-- Index for character-based appraisal queries
CREATE INDEX IF NOT EXISTS idx_appraisal_characterid ON appraisal(characterid);

-- Index for loot-based appraisal queries (already has unique constraint but good for performance)
CREATE INDEX IF NOT EXISTS idx_appraisal_lootid ON appraisal(lootid);

-- Composite index for loot-character appraisal lookups (covers unique constraint efficiently)
CREATE INDEX IF NOT EXISTS idx_appraisal_loot_character ON appraisal(lootid, characterid);

-- Index for appraisal time-based queries
CREATE INDEX IF NOT EXISTS idx_appraisal_appraised_on ON appraisal(appraised_on);

-- ====================================================================================
-- GOLD TABLE INDEXES
-- ====================================================================================

-- Index for session date queries (date filtering)
CREATE INDEX IF NOT EXISTS idx_gold_session_date ON gold(session_date);

-- Index for transaction type filtering
CREATE INDEX IF NOT EXISTS idx_gold_transaction_type ON gold(transaction_type);

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_gold_who ON gold(who) WHERE who IS NOT NULL;

-- Composite index for gold calculations (sum queries)
CREATE INDEX IF NOT EXISTS idx_gold_calculations ON gold(session_date, transaction_type);

-- ====================================================================================
-- SOLD TABLE INDEXES
-- ====================================================================================

-- Index for sold date queries
CREATE INDEX IF NOT EXISTS idx_sold_soldon ON sold(soldon);

-- Index for loot reference (already referenced but good for joins)
CREATE INDEX IF NOT EXISTS idx_sold_lootid ON sold(lootid);

-- Composite index for sale reporting
CREATE INDEX IF NOT EXISTS idx_sold_date_value ON sold(soldon, soldfor);

-- ====================================================================================
-- CHARACTERS TABLE INDEXES
-- ====================================================================================

-- Index for active character queries (very common)
CREATE INDEX IF NOT EXISTS idx_characters_active ON characters(active);

-- Index for user-based character lookups
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id) WHERE user_id IS NOT NULL;

-- Index for character name lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_characters_name_lower ON characters(lower(name));

-- ====================================================================================
-- IDENTIFY TABLE INDEXES
-- ====================================================================================

-- Index for loot identification lookups
CREATE INDEX IF NOT EXISTS idx_identify_lootid ON identify(lootid);

-- Index for character identification history
CREATE INDEX IF NOT EXISTS idx_identify_characterid ON identify(characterid);

-- Index for identification time queries
CREATE INDEX IF NOT EXISTS idx_identify_identified_at ON identify(identified_at);

-- Composite index for Golarion date queries
CREATE INDEX IF NOT EXISTS idx_identify_golarion_date ON identify(characterid, golarion_date) WHERE golarion_date IS NOT NULL;

-- ====================================================================================
-- ITEM TABLE INDEXES
-- ====================================================================================

-- Index for item type filtering
CREATE INDEX IF NOT EXISTS idx_item_type ON item(type);

-- Index for item name searches (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_item_name_lower ON item(lower(name));

-- Index for value-based queries
CREATE INDEX IF NOT EXISTS idx_item_value ON item(value) WHERE value IS NOT NULL;

-- Composite index for type and subtype filtering
CREATE INDEX IF NOT EXISTS idx_item_type_subtype ON item(type, subtype) WHERE subtype IS NOT NULL;

-- ====================================================================================
-- MOD TABLE INDEXES
-- ====================================================================================

-- Index for mod type filtering
CREATE INDEX IF NOT EXISTS idx_mod_type ON mod(type);

-- Index for mod target filtering
CREATE INDEX IF NOT EXISTS idx_mod_target ON mod(target);

-- Index for mod name searches
CREATE INDEX IF NOT EXISTS idx_mod_name_lower ON mod(lower(name));

-- ====================================================================================
-- SETTINGS TABLE INDEXES
-- ====================================================================================

-- Index for settings name lookups (already unique but good for performance)
CREATE INDEX IF NOT EXISTS idx_settings_name ON settings(name);

-- ====================================================================================
-- VIEW OPTIMIZATION INDEXES
-- ====================================================================================

-- Additional indexes to optimize the loot_view performance
-- These support the complex GROUP BY and JOIN operations in the view

-- Index to support the quantity_sums CTE grouping
CREATE INDEX IF NOT EXISTS idx_loot_view_grouping_extended ON loot(name, type, size, unidentified, masterwork, status, quantity);

-- Index to support character name joins in loot_view
CREATE INDEX IF NOT EXISTS idx_loot_whohas_with_status ON loot(whohas, status) WHERE whohas IS NOT NULL;

-- ====================================================================================
-- PERFORMANCE MONITORING
-- ====================================================================================

-- Create a simple view to monitor index usage
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ====================================================================================
-- INDEX MAINTENANCE NOTES
-- ====================================================================================

/*
MAINTENANCE NOTES:

1. Monitor index usage with:
   SELECT * FROM index_usage_stats WHERE idx_scan < 100;

2. To check for unused indexes after running for a while:
   SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

3. To analyze query performance:
   EXPLAIN (ANALYZE, BUFFERS) [your query here];

4. To get table and index sizes:
   SELECT 
       tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
       pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
   FROM pg_tables 
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

5. Regular maintenance (should be run periodically):
   -- Update table statistics
   ANALYZE;
   
   -- Rebuild indexes if needed (rarely necessary in PostgreSQL)
   -- REINDEX INDEX index_name;

ESTIMATED PERFORMANCE IMPROVEMENTS:
- Loot filtering by status: 10-50x faster
- Character-based queries: 5-20x faster  
- Date range queries: 5-15x faster
- Appraisal lookups: 3-10x faster
- Sales calculations: 10-30x faster
- Loot view performance: 5-20x faster

DISK SPACE IMPACT:
- Estimated additional space: 15-25% of current database size
- Critical for performance as data grows beyond 10k+ loot entries
*/