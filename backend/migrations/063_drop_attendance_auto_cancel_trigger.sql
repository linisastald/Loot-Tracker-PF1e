-- Migration: 063_drop_attendance_auto_cancel_trigger.sql
-- Description: Stop the session_attendance trigger from silently cancelling sessions.
--
-- Migration 024 left an AFTER INSERT OR UPDATE trigger (session_attendance_status_check)
-- on session_attendance that called check_session_auto_cancel(), which set
-- game_sessions.status = 'cancelled' whenever start_time - NOW() <= confirmation_hours
-- and fewer than minimum_players had responded 'yes'. Every RSVP fired it, so the first
-- late RSVP (even a 'yes', and 'late'/'early' responders were not counted) cancelled the
-- session with no Discord notice, without setting cancelled = TRUE and without the
-- reminder-before-cancel guard. Confirmation and cancellation are owned by
-- SessionSchedulerService.checkConfirmations / sessionService.cancelSession.
--
-- Fix: drop the trigger and its trigger function. check_session_auto_cancel() is kept
-- (sessionService.checkAutoCancel calls it) but now only REPORTS: it returns boolean and
-- never modifies data, and it counts accepted responses the way the application does
-- (yes, late, early, late_and_early).
--
-- Idempotent; safe on production (001-062 applied) and on fresh installs.

BEGIN;

DROP TRIGGER IF EXISTS session_attendance_status_check ON session_attendance;
DROP FUNCTION IF EXISTS update_session_status_trigger() CASCADE;

-- Return type changes (void -> boolean), so the old function must be dropped first.
DROP FUNCTION IF EXISTS check_session_auto_cancel(integer) CASCADE;

CREATE OR REPLACE FUNCTION check_session_auto_cancel(p_session_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_session RECORD;
    v_confirmed_count integer;
BEGIN
    SELECT * INTO v_session
    FROM game_sessions
    WHERE id = p_session_id;

    IF NOT FOUND OR v_session.status IN ('cancelled', 'completed') THEN
        RETURN FALSE;
    END IF;

    -- Only future sessions can be auto-cancelled
    IF v_session.start_time <= NOW() THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(DISTINCT sa.user_id) INTO v_confirmed_count
    FROM session_attendance sa
    WHERE sa.session_id = p_session_id
        AND sa.response_type IN ('yes', 'late', 'early', 'late_and_early');

    RETURN v_session.start_time - NOW() <= make_interval(hours => COALESCE(v_session.confirmation_hours, 48))
        AND v_confirmed_count < COALESCE(v_session.minimum_players, 0);
END;
$$;

COMMENT ON FUNCTION check_session_auto_cancel(integer) IS
    'Read-only: returns TRUE if a future session is inside its confirmation window with fewer accepted responses than minimum_players. Does not modify data; cancellation is performed by the application.';

COMMIT;
