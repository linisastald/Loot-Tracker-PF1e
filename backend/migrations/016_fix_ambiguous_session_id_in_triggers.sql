-- Fix ambiguous session_id references in database functions
-- This migration fixes column reference ambiguity in PL/pgSQL functions

-- Drop and recreate the check_session_auto_cancel function with fully qualified column names
DROP FUNCTION IF EXISTS check_session_auto_cancel(integer);

CREATE OR REPLACE FUNCTION check_session_auto_cancel(p_session_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_session RECORD;
    v_confirmed_count integer;
    v_auto_cancel_hours integer;
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

    -- Get auto-cancel hours (default 2 if not set)
    v_auto_cancel_hours := COALESCE(v_session.auto_cancel_hours, 2);

    -- Check if we should auto-cancel
    -- Cancel if we're within the auto-cancel window and don't have enough confirmed players
    IF v_session.start_time - NOW() <= make_interval(hours => v_auto_cancel_hours)
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

-- Drop and recreate the trigger function with fully qualified column names
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

-- Add comment
COMMENT ON FUNCTION check_session_auto_cancel(integer) IS 'Checks if a session should be auto-cancelled based on confirmed attendance and time until start';
COMMENT ON FUNCTION update_session_status_trigger() IS 'Trigger function that runs auto-cancel check when attendance changes';
