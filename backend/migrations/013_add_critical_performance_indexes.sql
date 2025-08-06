-- Migration: Add critical performance indexes based on query pattern analysis
-- Description: Add strategic indexes for most frequently used query patterns
-- Created: 2025-08-05
-- Status: Performance optimization

BEGIN;

-- =====================================================================================
-- CRITICAL MISSING INDEXES - High Impact Performance Improvements
-- =====================================================================================

-- Settings table - very frequent lookups by name
CREATE INDEX IF NOT EXISTS idx_settings_name ON settings(name);

-- Session messages table - frequent lookups by session_id with ordering
CREATE INDEX IF NOT EXISTS idx_session_messages_session_id ON session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_session_created ON session_messages(session_id, created_at);

-- Weather tables - frequent region-based lookups
CREATE INDEX IF NOT EXISTS idx_golarion_weather_region ON golarion_weather(region);
CREATE INDEX IF NOT EXISTS idx_golarion_weather_region_date ON golarion_weather(region, year, month, day);

-- Invites table - frequent lookups by token and email
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_is_used ON invites(is_used);

-- =====================================================================================
-- COMPOSITE INDEXES - Optimize Complex Queries
-- =====================================================================================

-- Loot status filtering with character ownership (most common loot query pattern)
CREATE INDEX IF NOT EXISTS idx_loot_status_character ON loot(status, whohas);
CREATE INDEX IF NOT EXISTS idx_loot_status_session ON loot(status, session_date);

-- Gold entries with character and date filtering (goldController patterns)
CREATE INDEX IF NOT EXISTS idx_gold_character_created ON gold(character_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gold_session_created ON gold(session_id, created_at);

-- Character active status filtering (userController patterns)
CREATE INDEX IF NOT EXISTS idx_characters_active_user ON characters(active, user_id);

-- Session attendance with status filtering
CREATE INDEX IF NOT EXISTS idx_session_attendance_session_status ON session_attendance(session_id, status);

-- =====================================================================================
-- AGGREGATION OPTIMIZATION INDEXES
-- =====================================================================================

-- Optimize consumable usage stats queries
CREATE INDEX IF NOT EXISTS idx_consumableuse_loot_time ON consumableuse(lootid, consumed_on);

-- Optimize appraisal statistics queries  
CREATE INDEX IF NOT EXISTS idx_appraisal_character_time ON appraisal(characterid, appraised_on);

-- Optimize sold items reporting
CREATE INDEX IF NOT EXISTS idx_sold_loot_date ON sold(lootid, soldon);

-- =====================================================================================
-- FOREIGN KEY PERFORMANCE INDEXES  
-- =====================================================================================

-- These should exist but ensuring they're present for referential integrity performance
CREATE INDEX IF NOT EXISTS idx_crew_ship_id ON crew(ship_id);
CREATE INDEX IF NOT EXISTS idx_outposts_session_id ON outposts(session_id);
CREATE INDEX IF NOT EXISTS idx_fame_history_character ON fame_history(character_id);

-- =====================================================================================
-- PARTIAL INDEXES - Optimize Filtered Queries
-- =====================================================================================

-- Only index active characters (most queries filter for active=true)
CREATE INDEX IF NOT EXISTS idx_characters_active_only ON characters(user_id, name) WHERE active = true;

-- Only index unidentified loot (frequent filtering condition)
CREATE INDEX IF NOT EXISTS idx_loot_unidentified ON loot(itemid, session_date) WHERE unidentified = true;

-- Only index unused invites (most common lookup pattern)
CREATE INDEX IF NOT EXISTS idx_invites_unused ON invites(email, created_at) WHERE is_used = false;

-- =====================================================================================
-- TEXT SEARCH OPTIMIZATION
-- =====================================================================================

-- Add GIN indexes for text search if full-text search is needed
-- Commented out for now, uncomment if implementing search features
-- CREATE INDEX IF NOT EXISTS idx_loot_name_text ON loot USING gin(to_tsvector('english', name));
-- CREATE INDEX IF NOT EXISTS idx_item_name_text ON item USING gin(to_tsvector('english', name));

-- =====================================================================================
-- QUERY PLAN STATISTICS UPDATE
-- =====================================================================================

-- Update table statistics to help query planner make better decisions
ANALYZE loot;
ANALYZE gold; 
ANALYZE characters;
ANALYZE sessions;
ANALYZE settings;
ANALYZE session_messages;
ANALYZE consumableuse;
ANALYZE appraisal;

-- =====================================================================================
-- PERFORMANCE MONITORING SETUP
-- =====================================================================================

-- Enable query statistics tracking (requires superuser, comment out if needed)
-- This helps identify slow queries in production
-- ALTER SYSTEM SET track_io_timing = on;
-- ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1 second
-- SELECT pg_reload_conf();

-- Record this migration
INSERT INTO schema_migrations (filename) VALUES ('013_add_critical_performance_indexes.sql');

COMMIT;

-- =====================================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- =====================================================================================

-- Run these queries after migration to verify index usage:
-- 
-- Check index sizes:
-- SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
-- FROM pg_stat_user_indexes 
-- ORDER BY pg_relation_size(indexrelid) DESC;
--
-- Check index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes 
-- WHERE idx_scan > 0
-- ORDER BY idx_scan DESC;
--
-- Test critical query patterns:
-- EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM loot WHERE status = 'Unprocessed' ORDER BY lastupdate DESC LIMIT 50;
-- EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM gold WHERE character_id = 1 ORDER BY created_at DESC LIMIT 20;