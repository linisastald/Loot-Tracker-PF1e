-- Migration: Remove redundant auto_cancel_hours column
-- Date: 2025-11-19
-- Description: Removes auto_cancel_hours column as confirmation_hours now handles both confirmation and auto-cancellation

-- Step 1: Drop the composite index that includes auto_cancel_hours
-- This must be done before dropping the column
DROP INDEX IF EXISTS idx_game_sessions_timing;

-- Step 2: Drop auto_cancel_hours column
ALTER TABLE game_sessions
DROP COLUMN IF EXISTS auto_cancel_hours;

-- Step 3: Recreate the timing index without auto_cancel_hours
CREATE INDEX IF NOT EXISTS idx_game_sessions_timing ON game_sessions(start_time, auto_announce_hours, reminder_hours, confirmation_hours);

-- Step 4: Update confirmation_hours comment to reflect new behavior
COMMENT ON COLUMN game_sessions.confirmation_hours IS 'Hours before session to check attendance and confirm/cancel (default: 48 = 2 days). Checks run at 12pm, 5pm, and 10pm daily.';

-- Migration summary:
-- ✅ Dropped idx_game_sessions_timing index (contained auto_cancel_hours)
-- ✅ Removed auto_cancel_hours column (functionality merged into confirmation_hours)
-- ✅ Recreated idx_game_sessions_timing index without auto_cancel_hours
-- ✅ Updated confirmation_hours comment to reflect new behavior
-- ✅ System simplified: confirmation check now handles both confirmation and cancellation
