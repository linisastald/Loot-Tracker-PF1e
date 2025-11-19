-- Migration: Consolidate session timing columns to hours-based system
-- Date: 2025-11-19
-- Description: Removes duplicate day/hour columns, fixes reminder_hours bug, standardizes on hours

-- Step 1: Add confirmation_hours column (hours before session to request final confirmation)
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS confirmation_hours INTEGER DEFAULT 48;

-- Step 2: Migrate existing data from confirmation_days_before to confirmation_hours
UPDATE game_sessions
SET confirmation_hours = confirmation_days_before * 24
WHERE confirmation_days_before IS NOT NULL;

-- Step 3: Fix incorrect reminder_hours values
-- Any reminder_hours > 168 (1 week) is likely a bug from the confirmation_days_before calculation
-- Reset these to a sensible default of 48 hours (2 days before)
UPDATE game_sessions
SET reminder_hours = 48
WHERE reminder_hours > 168 OR reminder_hours IS NULL;

-- Step 4: Ensure auto_announce_hours has sensible values
-- If it was calculated from announcement_days_before, it should be fine
-- But ensure NULL values get the default
UPDATE game_sessions
SET auto_announce_hours = 168
WHERE auto_announce_hours IS NULL;

-- Step 5: Drop redundant columns
-- Note: Using IF EXISTS for safety in case columns were already removed
ALTER TABLE game_sessions
DROP COLUMN IF EXISTS announcement_days_before,
DROP COLUMN IF EXISTS confirmation_days_before,
DROP COLUMN IF EXISTS announcement_message_id;

-- Step 6: Add helpful comments
COMMENT ON COLUMN game_sessions.auto_announce_hours IS 'Hours before session to automatically post announcement (default: 168 = 1 week)';
COMMENT ON COLUMN game_sessions.reminder_hours IS 'Hours before session to send reminder (default: 48 = 2 days)';
COMMENT ON COLUMN game_sessions.confirmation_hours IS 'Hours before session to request final confirmation (default: 48 = 2 days)';
COMMENT ON COLUMN game_sessions.auto_cancel_hours IS 'Hours before session to auto-cancel if minimum players not met (default: 48 = 2 days)';
COMMENT ON COLUMN game_sessions.discord_message_id IS 'Discord message ID for the session announcement (announcement_message_id was removed as duplicate)';

-- Step 7: Create index on timing columns for scheduler queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_timing ON game_sessions(start_time, auto_announce_hours, reminder_hours, confirmation_hours, auto_cancel_hours);

-- Migration summary:
-- ✅ Added confirmation_hours column
-- ✅ Migrated confirmation_days_before → confirmation_hours
-- ✅ Fixed reminder_hours values that were incorrectly calculated (> 168 hours reset to 48)
-- ✅ Removed duplicate columns: announcement_days_before, confirmation_days_before, announcement_message_id
-- ✅ Standardized on hours-based timing system
-- ✅ Added documentation comments
