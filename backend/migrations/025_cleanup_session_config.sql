-- Migration: 025_cleanup_session_config.sql
-- Description: Remove obsolete session_config entries that have been replaced by per-session timing columns
-- Author: Database Architect Agent
-- Date: 2025-11-19
--
-- Context: Migration 022 consolidated session timing into per-session columns (auto_announce_hours,
-- reminder_hours, confirmation_hours). The following session_config entries are now obsolete:
--   - announcement_days_before (replaced by per-session auto_announce_hours)
--   - first_reminder_days_before (replaced by per-session reminder_hours)
--   - final_reminder_days_before (replaced by per-session reminder_hours)
--   - confirmation_days_before (replaced by per-session confirmation_hours)
--   - default_auto_cancel_hours (replaced by per-session confirmation_hours per migration 023)
--
-- These global settings are no longer referenced by the application or database functions.

-- UP Migration
BEGIN;

-- Remove obsolete session timing configuration entries
-- These have been superseded by per-session timing columns in game_sessions table
DELETE FROM session_config
WHERE setting_name IN (
    'announcement_days_before',      -- Replaced by game_sessions.auto_announce_hours
    'first_reminder_days_before',    -- Replaced by game_sessions.reminder_hours
    'final_reminder_days_before',    -- Replaced by game_sessions.reminder_hours
    'confirmation_days_before',      -- Replaced by game_sessions.confirmation_hours
    'default_auto_cancel_hours'      -- Replaced by game_sessions.confirmation_hours
);

-- Log the changes
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Removed % obsolete session_config entries', deleted_count;
END $$;

COMMIT;

-- DOWN Migration (Rollback)
-- Restores the obsolete entries with their original default values
-- Note: These would need to be removed again if migrating forward
--
-- BEGIN;
--
-- INSERT INTO session_config (setting_name, setting_value, setting_type, description) VALUES
-- ('announcement_days_before', '7', 'number', 'Days before session to post announcement'),
-- ('first_reminder_days_before', '4', 'number', 'Days before session for first reminder'),
-- ('final_reminder_days_before', '2', 'number', 'Days before session for final reminder'),
-- ('confirmation_days_before', '2', 'number', 'Days before session to confirm/cancel'),
-- ('default_auto_cancel_hours', '48', 'number', 'Default hours before session start to auto-cancel if minimum players not met')
-- ON CONFLICT (setting_name) DO NOTHING;
--
-- COMMIT;

-- ================================================================================
-- SUMMARY OF CHANGES
-- ================================================================================
-- ✅ Removed 5 obsolete session_config entries:
--    • announcement_days_before (superseded by game_sessions.auto_announce_hours)
--    • first_reminder_days_before (superseded by game_sessions.reminder_hours)
--    • final_reminder_days_before (superseded by game_sessions.reminder_hours)
--    • confirmation_days_before (superseded by game_sessions.confirmation_hours)
--    • default_auto_cancel_hours (superseded by game_sessions.confirmation_hours)
--
-- IMPACT ANALYSIS:
-- - No functional impact: These settings are no longer used by application or database
-- - Cleaner configuration: Removes redundant global settings
-- - Per-session control: All timing is now controlled at the session level
-- - Migration 022 already migrated existing behavior to per-session columns
-- - Rollback available: DOWN migration can restore entries if needed
--
-- RELATED MIGRATIONS:
-- - 022_consolidate_session_timing_columns.sql (introduced per-session timing)
-- - 023_remove_auto_cancel_hours.sql (consolidated auto_cancel_hours into confirmation_hours)
-- - 024_fix_auto_cancel_function.sql (updated functions to use confirmation_hours)
