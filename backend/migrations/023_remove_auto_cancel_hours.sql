-- Migration: Remove redundant auto_cancel_hours column
-- Date: 2025-11-19
-- Description: Removes auto_cancel_hours column as confirmation_hours now handles both confirmation and auto-cancellation

-- Step 1: Drop the dependent view before dropping the column
-- The upcoming_sessions view uses gs.* which includes all columns including auto_cancel_hours
DROP VIEW IF EXISTS upcoming_sessions;

-- Step 2: Drop the composite index that includes auto_cancel_hours
-- This must be done before dropping the column
DROP INDEX IF EXISTS idx_game_sessions_timing;

-- Step 3: Drop auto_cancel_hours column
ALTER TABLE game_sessions
DROP COLUMN IF EXISTS auto_cancel_hours;

-- Step 4: Recreate the timing index without auto_cancel_hours
CREATE INDEX IF NOT EXISTS idx_game_sessions_timing ON game_sessions(start_time, auto_announce_hours, reminder_hours, confirmation_hours);

-- Step 5: Recreate the upcoming_sessions view
-- This view will work correctly with gs.* even after auto_cancel_hours column drop
CREATE OR REPLACE VIEW upcoming_sessions AS
SELECT
    gs.*,
    COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.response_type = 'yes') as confirmed_players,
    COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.response_type = 'no') as declined_players,
    COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.response_type = 'maybe') as maybe_players,
    COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.response_type IN ('late', 'early', 'late_and_early')) as modified_attendance
FROM game_sessions gs
LEFT JOIN session_attendance sa ON gs.id = sa.session_id
WHERE gs.start_time > NOW()
    AND gs.status IN ('scheduled', 'confirmed')
GROUP BY gs.id
ORDER BY gs.start_time;

-- Step 6: Update confirmation_hours comment to reflect new behavior
COMMENT ON COLUMN game_sessions.confirmation_hours IS 'Hours before session to check attendance and confirm/cancel (default: 48 = 2 days). Checks run at 12pm, 5pm, and 10pm daily.';

-- Migration summary:
-- ✅ Dropped upcoming_sessions view (depended on auto_cancel_hours)
-- ✅ Dropped idx_game_sessions_timing index (contained auto_cancel_hours)
-- ✅ Removed auto_cancel_hours column (functionality merged into confirmation_hours)
-- ✅ Recreated idx_game_sessions_timing index without auto_cancel_hours
-- ✅ Recreated upcoming_sessions view (works with gs.* selecting remaining columns)
-- ✅ Updated confirmation_hours comment to reflect new behavior
-- ✅ System simplified: confirmation check now handles both confirmation and cancellation
