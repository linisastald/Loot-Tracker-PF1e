-- Migration: 024_fix_auto_cancel_function.sql
-- Description: Update check_session_auto_cancel function to use confirmation_hours instead of removed auto_cancel_hours
-- Author: Database Architect Agent
-- Date: 2025-11-19
--
-- Context: Migration 023 removed auto_cancel_hours column and consolidated functionality into confirmation_hours.
-- This migration updates the database functions that still referenced the old column.

-- UP Migration
BEGIN;

-- Drop and recreate the check_session_auto_cancel function to use confirmation_hours
DROP FUNCTION IF EXISTS check_session_auto_cancel(integer) CASCADE;

CREATE OR REPLACE FUNCTION check_session_auto_cancel(p_session_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_session RECORD;
    v_confirmed_count integer;
    v_confirmation_hours integer;
BEGIN
    -- Get session details
    SELECT * INTO v_session
    FROM game_sessions
    WHERE id = p_session_id;

    -- Exit if session not found or already cancelled/completed
    IF NOT FOUND OR v_session.status IN ('cancelled', 'completed') THEN
        RETURN;
    END IF;

    -- Get confirmed attendance count using fully qualified column names
    SELECT COUNT(DISTINCT sa.user_id) INTO v_confirmed_count
    FROM session_attendance sa
    WHERE sa.session_id = p_session_id
        AND sa.response_type = 'yes';

    -- Get confirmation hours (default 48 if not set) - this is now used for both confirmation and auto-cancel
    v_confirmation_hours := COALESCE(v_session.confirmation_hours, 48);

    -- Check if we should auto-cancel
    -- Cancel if we're within the confirmation window and don't have enough confirmed players
    IF v_session.start_time - NOW() <= make_interval(hours => v_confirmation_hours)
        AND v_confirmed_count < v_session.minimum_players THEN

        UPDATE game_sessions
        SET status = 'cancelled',
            cancel_reason = 'Automatically cancelled: insufficient confirmed players'
        WHERE id = p_session_id;

        RAISE NOTICE 'Session % auto-cancelled: % confirmed players (minimum: %)',
            p_session_id, v_confirmed_count, v_session.minimum_players;
    END IF;
END;
$$;

-- Recreate the trigger function (no changes needed, but recreating for completeness)
DROP FUNCTION IF EXISTS update_session_status_trigger() CASCADE;

CREATE OR REPLACE FUNCTION update_session_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check if this attendance update should trigger auto-cancel check
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM check_session_auto_cancel(NEW.session_id);
    END IF;

    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS session_attendance_status_check ON session_attendance;

CREATE TRIGGER session_attendance_status_check
    AFTER INSERT OR UPDATE ON session_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_session_status_trigger();

-- Update comments to reflect the change
COMMENT ON FUNCTION check_session_auto_cancel(integer) IS
    'Checks if a session should be auto-cancelled based on confirmed attendance and confirmation window. ' ||
    'Uses confirmation_hours (default 48) as the window before session start to check for auto-cancellation.';

COMMENT ON FUNCTION update_session_status_trigger() IS
    'Trigger function that runs auto-cancel check when attendance changes';

COMMIT;

-- DOWN Migration (Rollback)
-- Note: Cannot truly rollback because auto_cancel_hours column no longer exists
-- This would require first restoring the column via rollback of migration 023
--
-- BEGIN;
--
-- DROP FUNCTION IF EXISTS check_session_auto_cancel(integer) CASCADE;
--
-- CREATE OR REPLACE FUNCTION check_session_auto_cancel(p_session_id integer)
-- RETURNS void
-- LANGUAGE plpgsql
-- AS $$
-- DECLARE
--     v_session RECORD;
--     v_confirmed_count integer;
--     v_auto_cancel_hours integer;
-- BEGIN
--     SELECT * INTO v_session
--     FROM game_sessions
--     WHERE id = p_session_id;
--
--     IF NOT FOUND OR v_session.status IN ('cancelled', 'completed') THEN
--         RETURN;
--     END IF;
--
--     SELECT COUNT(DISTINCT sa.user_id) INTO v_confirmed_count
--     FROM session_attendance sa
--     WHERE sa.session_id = p_session_id
--         AND sa.response_type = 'yes';
--
--     v_auto_cancel_hours := COALESCE(v_session.auto_cancel_hours, 2);
--
--     IF v_session.start_time - NOW() <= make_interval(hours => v_auto_cancel_hours)
--         AND v_confirmed_count < v_session.minimum_players THEN
--
--         UPDATE game_sessions
--         SET status = 'cancelled',
--             cancel_reason = 'Automatically cancelled: insufficient confirmed players'
--         WHERE id = p_session_id;
--     END IF;
-- END;
-- $$;
--
-- [Recreate trigger function and trigger...]
--
-- COMMIT;

-- ================================================================================
-- SUMMARY OF CHANGES
-- ================================================================================
-- ✅ Updated check_session_auto_cancel() to use confirmation_hours instead of auto_cancel_hours
-- ✅ Changed default from 2 hours to 48 hours to match confirmation_hours default
-- ✅ Recreated update_session_status_trigger() function (CASCADE drop/recreate)
-- ✅ Recreated session_attendance_status_check trigger
-- ✅ Updated function comments to document the change
--
-- IMPACT ANALYSIS:
-- - Auto-cancel window changed from 2 hours to 48 hours (matches confirmation behavior)
-- - Sessions will now auto-cancel if minimum players not met within 48 hours of start
-- - This aligns with the consolidated timing strategy from migration 023
-- - No data loss or breaking changes to attendance recording
