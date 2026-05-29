-- Migration: Drop legacy snack-master columns, rotation function, and setting
-- The snack master is now derived from the post-session task assignment
-- (session_task_history.snack_master_name) and surfaced in the next session's
-- announcement. The old per-session column-based rotation, its helper function,
-- and the never-implemented setting are no longer referenced by any code.
--
-- NOTE: the migration runner wraps this whole file in a single transaction,
-- so no explicit BEGIN/COMMIT here. All statements are guarded with IF EXISTS
-- so the migration is safe to run regardless of prior state.

-- The upcoming_sessions view is defined as SELECT gs.*, which expands to an
-- explicit column list at creation time and therefore depends on the columns
-- being dropped. Drop it first, drop the columns, then recreate it.
DROP VIEW IF EXISTS upcoming_sessions;

ALTER TABLE game_sessions
    DROP COLUMN IF EXISTS snack_master_id,
    DROP COLUMN IF EXISTS last_snack_master_id;

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

-- Drop the unused round-robin rotation helper.
DROP FUNCTION IF EXISTS get_next_snack_master(INTEGER);

-- Remove the never-implemented snack master setting from whichever settings
-- table holds it. The core `settings` table always exists; `system_settings`
-- only exists in some environments, so guard that one.
DELETE FROM settings WHERE name = 'enable_snack_master';

DO $$
BEGIN
    IF to_regclass('public.system_settings') IS NOT NULL THEN
        DELETE FROM system_settings WHERE setting_key LIKE 'enable_snack_master%';
    END IF;
END $$;
