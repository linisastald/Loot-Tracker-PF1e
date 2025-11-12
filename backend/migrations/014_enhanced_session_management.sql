-- Enhanced Session Management Migration
-- Adds comprehensive Discord integration and session tracking features

-- Add Discord ID mapping to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS discord_id VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);

-- Enhance game_sessions table with additional features
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed')),
ADD COLUMN IF NOT EXISTS minimum_players INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS announcement_days_before INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS confirmation_days_before INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS announcement_message_id VARCHAR(20),
ADD COLUMN IF NOT EXISTS confirmation_message_id VARCHAR(20),
ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
ADD COLUMN IF NOT EXISTS snack_master_id INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS last_snack_master_id INTEGER REFERENCES users(id);

-- Enhance session_attendance with more detailed response tracking
ALTER TABLE session_attendance
ADD COLUMN IF NOT EXISTS discord_id VARCHAR(20),
ADD COLUMN IF NOT EXISTS response_type VARCHAR(20) CHECK (response_type IN ('yes', 'no', 'maybe', 'late', 'early', 'late_and_early')),
ADD COLUMN IF NOT EXISTS late_arrival_time TIME,
ADD COLUMN IF NOT EXISTS early_departure_time TIME,
ADD COLUMN IF NOT EXISTS response_timestamp TIMESTAMP,
ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMP,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create session reminders table
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

-- Create session notes table for player prep requests
CREATE TABLE IF NOT EXISTS session_notes (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    character_id INTEGER REFERENCES characters(id),
    note_type VARCHAR(20) NOT NULL CHECK (note_type IN ('prep_request', 'general', 'dm_note')),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create automatic tasks table
CREATE TABLE IF NOT EXISTS session_tasks (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    task_description TEXT NOT NULL,
    assigned_to INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    due_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create Discord reaction tracking table
CREATE TABLE IF NOT EXISTS discord_reaction_tracking (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(20) NOT NULL,
    user_discord_id VARCHAR(20) NOT NULL,
    reaction_emoji VARCHAR(50) NOT NULL,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    reaction_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_discord_id, reaction_emoji)
);

-- Session configuration settings
CREATE TABLE IF NOT EXISTS session_config (
    id SERIAL PRIMARY KEY,
    setting_name VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(20) CHECK (setting_type IN ('number', 'text', 'boolean', 'json')),
    description TEXT
);

-- Insert default session configuration
INSERT INTO session_config (setting_name, setting_value, setting_type, description) VALUES
('announcement_days_before', '7', 'number', 'Days before session to post announcement'),
('first_reminder_days_before', '4', 'number', 'Days before session for first reminder'),
('final_reminder_days_before', '2', 'number', 'Days before session for final reminder'),
('confirmation_days_before', '2', 'number', 'Days before session to confirm/cancel'),
('minimum_players_required', '3', 'number', 'Minimum players needed for session'),
('task_generation_hours_before', '4', 'number', 'Hours before session to generate tasks'),
('reminder_ping_role', NULL, 'text', 'Discord role ID to ping for reminders'),
('attendance_reactions', '{"yes": "✅", "no": "❌", "maybe": "❓", "late": "⏰", "early": "🏃", "late_and_early": "⏳"}', 'json', 'Emoji mappings for attendance reactions'),
('enable_snack_master', 'true', 'boolean', 'Enable snack master reminders'),
('enable_auto_cancel', 'true', 'boolean', 'Auto-cancel sessions below minimum players')
ON CONFLICT (setting_name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_session_reminders_session_id ON session_reminders(session_id);
CREATE INDEX IF NOT EXISTS idx_session_reminders_sent ON session_reminders(sent);
CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_session_id ON session_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_status ON session_tasks(status);
CREATE INDEX IF NOT EXISTS idx_discord_reactions_message_id ON discord_reaction_tracking(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_reactions_session_id ON discord_reaction_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_start_time ON game_sessions(start_time);

-- Create views for easier querying
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

CREATE OR REPLACE VIEW session_attendance_summary AS
SELECT
    sa.*,
    u.username,
    u.discord_id as user_discord_id,
    u.discord_username,
    c.name as character_name,
    gs.title as session_title,
    gs.start_time as session_start,
    gs.status as session_status
FROM session_attendance sa
JOIN users u ON sa.user_id = u.id
LEFT JOIN characters c ON sa.character_id = c.id
JOIN game_sessions gs ON sa.session_id = gs.id;

-- Function to check if session should be auto-cancelled
CREATE OR REPLACE FUNCTION check_session_auto_cancel(session_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    min_players INTEGER;
    confirmed_count INTEGER;
    auto_cancel_enabled BOOLEAN;
BEGIN
    -- Get minimum players for this session
    SELECT minimum_players INTO min_players
    FROM game_sessions
    WHERE id = session_id;

    -- Check if auto-cancel is enabled
    SELECT (setting_value = 'true')::BOOLEAN INTO auto_cancel_enabled
    FROM session_config
    WHERE setting_name = 'enable_auto_cancel';

    IF NOT auto_cancel_enabled THEN
        RETURN FALSE;
    END IF;

    -- Count confirmed players
    SELECT COUNT(DISTINCT user_id) INTO confirmed_count
    FROM session_attendance
    WHERE session_id = check_session_auto_cancel.session_id
        AND response_type = 'yes';

    RETURN confirmed_count < min_players;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session status based on attendance
CREATE OR REPLACE FUNCTION update_session_status_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF check_session_auto_cancel(NEW.session_id) THEN
        UPDATE game_sessions
        SET status = 'cancelled',
            cancelled = TRUE,
            cancel_reason = 'Insufficient players'
        WHERE id = NEW.session_id
            AND status = 'scheduled';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_attendance_status_check
AFTER INSERT OR UPDATE ON session_attendance
FOR EACH ROW
EXECUTE FUNCTION update_session_status_trigger();

-- Function to get next snack master
CREATE OR REPLACE FUNCTION get_next_snack_master(current_session_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    last_master_id INTEGER;
    next_master_id INTEGER;
BEGIN
    -- Get the last snack master from the most recent completed session
    SELECT snack_master_id INTO last_master_id
    FROM game_sessions
    WHERE status = 'completed'
        AND snack_master_id IS NOT NULL
    ORDER BY end_time DESC
    LIMIT 1;

    -- Get next eligible user (round-robin from active players)
    WITH active_players AS (
        SELECT DISTINCT u.id
        FROM users u
        JOIN session_attendance sa ON u.id = sa.user_id
        JOIN game_sessions gs ON sa.session_id = gs.id
        WHERE gs.start_time > NOW() - INTERVAL '30 days'
            AND sa.response_type = 'yes'
        ORDER BY u.id
    )
    SELECT id INTO next_master_id
    FROM active_players
    WHERE id > COALESCE(last_master_id, 0)
    ORDER BY id
    LIMIT 1;

    -- If no user found after last master, wrap around to beginning
    IF next_master_id IS NULL THEN
        SELECT id INTO next_master_id
        FROM active_players
        ORDER BY id
        LIMIT 1;
    END IF;

    RETURN next_master_id;
END;
$$ LANGUAGE plpgsql;