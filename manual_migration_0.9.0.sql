-- ============================================================================
-- MANUAL MIGRATION FOR VERSION 0.9.0
-- ============================================================================
-- This SQL file manually applies all changes needed for the Discord Session
-- Attendance feature when automated migrations fail.
--
-- IMPORTANT: Run this entire file in a single transaction on your production
-- database. Review each section before executing.
--
-- Database: loot_tracking
-- Target Tables: Will create game_sessions and related session tables
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create game_sessions table (base structure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP 2: Add Discord integration columns to users table
-- ============================================================================

-- Add Discord ID mapping to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS discord_id VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);

-- ============================================================================
-- STEP 3: Enhance game_sessions table with session management features
-- ============================================================================

-- Add session management columns
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),
ADD COLUMN IF NOT EXISTS minimum_players INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS maximum_players INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS auto_announce_hours INTEGER DEFAULT 168,
ADD COLUMN IF NOT EXISTS reminder_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS auto_cancel_hours INTEGER DEFAULT 48,
ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS announcement_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS confirmation_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(20),
ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(20),
ADD COLUMN IF NOT EXISTS confirmation_days_before INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS announcement_days_before INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS confirmed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS declined_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS maybe_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS snack_master_id INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS last_snack_master_id INTEGER REFERENCES users(id);

-- ============================================================================
-- STEP 4: Add recurring session support
-- ============================================================================

ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurring_pattern VARCHAR(20) CHECK (recurring_pattern IN ('weekly', 'biweekly', 'monthly', 'custom')),
ADD COLUMN IF NOT EXISTS recurring_day_of_week INTEGER CHECK (recurring_day_of_week BETWEEN 0 AND 6),
ADD COLUMN IF NOT EXISTS recurring_interval INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS recurring_end_date DATE,
ADD COLUMN IF NOT EXISTS recurring_end_count INTEGER,
ADD COLUMN IF NOT EXISTS parent_recurring_id INTEGER REFERENCES game_sessions(id),
ADD COLUMN IF NOT EXISTS created_from_recurring BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- STEP 5: Create session_attendance table
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_attendance (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    character_id INTEGER REFERENCES characters(id),
    discord_id VARCHAR(20),
    status VARCHAR(20) NOT NULL CHECK (status IN ('accepted', 'declined', 'tentative')),
    response_type VARCHAR(20) CHECK (response_type IN ('yes', 'no', 'maybe', 'late', 'early', 'late_and_early')),
    late_arrival_time TIME,
    early_departure_time TIME,
    notes TEXT,
    response_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reminder_count INTEGER DEFAULT 0,
    last_reminder_sent TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id)
);

-- ============================================================================
-- STEP 6: Create supporting tables
-- ============================================================================

-- Session reminders table
CREATE TABLE IF NOT EXISTS session_reminders (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    days_before INTEGER NOT NULL,
    reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('initial', 'followup', 'final')),
    target_audience VARCHAR(20) NOT NULL CHECK (target_audience IN ('all', 'non_responders', 'maybe_responders', 'active_players')),
    message_template TEXT,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    discord_message_id VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session notes table
CREATE TABLE IF NOT EXISTS session_notes (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    character_id INTEGER REFERENCES characters(id),
    note_type VARCHAR(20) DEFAULT 'general' CHECK (note_type IN ('prep_request', 'general', 'dm_note')),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session tasks table
CREATE TABLE IF NOT EXISTS session_tasks (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session task assignments table
CREATE TABLE IF NOT EXISTS session_task_assignments (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE UNIQUE,
    task_assignments JSONB NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attendee_count INTEGER DEFAULT 0
);

-- Session completions table
CREATE TABLE IF NOT EXISTS session_completions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE UNIQUE,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    final_attendance_count INTEGER DEFAULT 0,
    completion_summary JSONB
);

-- Session automations table
CREATE TABLE IF NOT EXISTS session_automations (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    automation_type VARCHAR(50) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'executed', 'failed', 'cancelled')),
    executed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Discord outbox table for reliable message delivery
CREATE TABLE IF NOT EXISTS discord_outbox (
    id SERIAL PRIMARY KEY,
    message_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    last_error TEXT,
    last_attempt_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP
);

-- Session config table (if doesn't exist)
CREATE TABLE IF NOT EXISTS session_config (
    setting_name VARCHAR(255) PRIMARY KEY,
    setting_value TEXT,
    setting_type VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP 7: Create indexes for performance
-- ============================================================================

-- game_sessions indexes
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_start_time ON game_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_by ON game_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_game_sessions_recurring ON game_sessions(is_recurring, recurring_pattern);
CREATE INDEX IF NOT EXISTS idx_game_sessions_parent_recurring ON game_sessions(parent_recurring_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_next_occurrence ON game_sessions(start_time) WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_game_sessions_discord_message_id ON game_sessions(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_announcement_message_id ON game_sessions(announcement_message_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_confirmation_message_id ON game_sessions(confirmation_message_id);

-- session_attendance indexes
CREATE INDEX IF NOT EXISTS idx_session_attendance_session_id ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_user_id ON session_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_character_id ON session_attendance(character_id);

-- session_notes indexes
CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id);

-- session_tasks indexes
CREATE INDEX IF NOT EXISTS idx_session_tasks_session_id ON session_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_assigned_to ON session_tasks(assigned_to);

-- session_automations indexes
CREATE INDEX IF NOT EXISTS idx_session_automations_session_id ON session_automations(session_id);
CREATE INDEX IF NOT EXISTS idx_session_automations_scheduled_time ON session_automations(scheduled_time);

-- discord_outbox indexes
CREATE INDEX IF NOT EXISTS idx_discord_outbox_status_created ON discord_outbox(status, created_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_discord_outbox_session ON discord_outbox(session_id);

-- ============================================================================
-- STEP 8: Create database functions and triggers
-- ============================================================================

-- Function to check if session should be auto-cancelled
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

    -- Get auto-cancel hours (default 48 if not set)
    v_auto_cancel_hours := COALESCE(v_session.auto_cancel_hours, 48);

    -- Check if we should auto-cancel
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

-- Trigger function for session attendance changes
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

-- Create the trigger
DROP TRIGGER IF EXISTS session_attendance_status_check ON session_attendance;
CREATE TRIGGER session_attendance_status_check
    AFTER INSERT OR UPDATE ON session_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_session_status_trigger();

-- ============================================================================
-- STEP 9: Insert default configuration
-- ============================================================================

INSERT INTO session_config (setting_name, setting_value, setting_type, description)
VALUES ('default_auto_cancel_hours', '48', 'number', 'Default hours before session start to auto-cancel if minimum players not met')
ON CONFLICT (setting_name) DO UPDATE
SET setting_value = '48';

-- ============================================================================
-- STEP 10: Add helpful comments for documentation
-- ============================================================================

COMMENT ON TABLE game_sessions IS 'Game sessions with Discord integration and recurring session support';
COMMENT ON TABLE session_attendance IS 'Player attendance tracking for game sessions';
COMMENT ON TABLE discord_outbox IS 'Outbox pattern for reliable Discord message delivery';
COMMENT ON COLUMN game_sessions.status IS 'Session status: scheduled, confirmed, cancelled, completed';
COMMENT ON COLUMN game_sessions.is_recurring IS 'Indicates if this is a recurring session template';
COMMENT ON COLUMN game_sessions.auto_cancel_hours IS 'Hours before session start to check for auto-cancellation due to insufficient players';
COMMENT ON FUNCTION check_session_auto_cancel(integer) IS 'Checks if a session should be auto-cancelled based on confirmed attendance and time until start';

-- ============================================================================
-- STEP 11: Mark migrations as applied
-- ============================================================================

-- Mark migrations 014-018 as applied in the migration tracking system
INSERT INTO schema_migrations_v2 (migration_id, filename, description, checksum, schema_version)
VALUES
    ('014', '014_enhanced_session_management.sql', 'Enhanced session management with Discord integration', 'manual', '2.0'),
    ('015', '015_add_enhanced_session_columns.sql', 'Add enhanced session management columns', 'manual', '2.0'),
    ('016', '016_fix_ambiguous_session_id_in_triggers.sql', 'Fix ambiguous session_id in triggers', 'manual', '2.0'),
    ('017', '017_update_auto_cancel_default.sql', 'Update auto_cancel_hours default to 48', 'manual', '2.0'),
    ('018', '018_add_discord_outbox.sql', 'Add Discord outbox table', 'manual', '2.0')
ON CONFLICT (migration_id) DO NOTHING;

-- Record in migration history
INSERT INTO migration_history (migration_id, filename, action, status, execution_time_ms, applied_by)
VALUES
    ('014', '014_enhanced_session_management.sql', 'apply', 'success', 0, 'manual_migration'),
    ('015', '015_add_enhanced_session_columns.sql', 'apply', 'success', 0, 'manual_migration'),
    ('016', '016_fix_ambiguous_session_id_in_triggers.sql', 'apply', 'success', 0, 'manual_migration'),
    ('017', '017_update_auto_cancel_default.sql', 'apply', 'success', 0, 'manual_migration'),
    ('018', '018_add_discord_outbox.sql', 'apply', 'success', 0, 'manual_migration');

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries after the migration to verify everything is correct:
--
-- 1. Check that game_sessions table exists with all columns:
--    \d game_sessions
--
-- 2. Check that session_attendance table exists:
--    \d session_attendance
--
-- 3. Check that all supporting tables exist:
--    \dt session_*
--
-- 4. Verify migrations are marked as applied:
--    SELECT * FROM schema_migrations_v2 WHERE migration_id IN ('014','015','016','017','018');
--
-- 5. Check that triggers exist:
--    \df check_session_auto_cancel
--    \df update_session_status_trigger
--
-- ============================================================================
