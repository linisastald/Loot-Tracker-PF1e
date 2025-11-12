-- Migration: Add enhanced session management columns
-- Date: 2025-11-12
-- Description: Adds all missing columns for enhanced session management and recurring sessions

-- First, add the basic enhanced session columns that are missing
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS minimum_players INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS maximum_players INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS auto_announce_hours INTEGER DEFAULT 168,
ADD COLUMN IF NOT EXISTS reminder_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS auto_cancel_hours INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS announcement_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS confirmation_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS confirmation_days_before INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS announcement_days_before INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS confirmed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS declined_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS maybe_count INTEGER DEFAULT 0;

-- Now add the recurring session columns
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recurring_pattern VARCHAR(20) CHECK (recurring_pattern IN ('weekly', 'biweekly', 'monthly', 'custom')),
ADD COLUMN IF NOT EXISTS recurring_day_of_week INTEGER CHECK (recurring_day_of_week BETWEEN 0 AND 6),
ADD COLUMN IF NOT EXISTS recurring_interval INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS recurring_end_date DATE,
ADD COLUMN IF NOT EXISTS recurring_end_count INTEGER,
ADD COLUMN IF NOT EXISTS parent_recurring_id INTEGER REFERENCES game_sessions(id),
ADD COLUMN IF NOT EXISTS created_from_recurring BOOLEAN DEFAULT FALSE;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_start_time ON game_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_by ON game_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_game_sessions_recurring ON game_sessions(is_recurring, recurring_pattern);
CREATE INDEX IF NOT EXISTS idx_game_sessions_parent_recurring ON game_sessions(parent_recurring_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_next_occurrence ON game_sessions(start_time) WHERE is_recurring = TRUE;

-- Create session_attendance table if it doesn't exist
CREATE TABLE IF NOT EXISTS session_attendance (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    character_id INTEGER REFERENCES characters(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('accepted', 'declined', 'tentative')),
    response_type VARCHAR(20), -- For backward compatibility
    late_arrival_time TIME,
    early_departure_time TIME,
    notes TEXT,
    response_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id)
);

-- Create other supporting tables if they don't exist
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

CREATE TABLE IF NOT EXISTS session_task_assignments (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE UNIQUE,
    task_assignments JSONB NOT NULL,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    attendee_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_completions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE UNIQUE,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    final_attendance_count INTEGER DEFAULT 0,
    completion_summary JSONB
);

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

-- Create indexes for supporting tables
CREATE INDEX IF NOT EXISTS idx_session_attendance_session_id ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_user_id ON session_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_character_id ON session_attendance(character_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_session_id ON session_notes(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_session_id ON session_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_assigned_to ON session_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_session_automations_session_id ON session_automations(session_id);
CREATE INDEX IF NOT EXISTS idx_session_automations_scheduled_time ON session_automations(scheduled_time);

-- Add comments for documentation
COMMENT ON COLUMN game_sessions.status IS 'Session status: scheduled, confirmed, cancelled, completed, recurring_template';
COMMENT ON COLUMN game_sessions.minimum_players IS 'Minimum players required for session to proceed';
COMMENT ON COLUMN game_sessions.maximum_players IS 'Maximum players allowed in session';
COMMENT ON COLUMN game_sessions.is_recurring IS 'Indicates if this is a recurring session template';
COMMENT ON COLUMN game_sessions.recurring_pattern IS 'Frequency pattern: weekly, biweekly, monthly, custom';
COMMENT ON COLUMN game_sessions.recurring_day_of_week IS 'Day of week (0=Sunday, 6=Saturday) for recurring sessions';
COMMENT ON COLUMN game_sessions.recurring_interval IS 'Interval for custom patterns (e.g., every 2 weeks)';
COMMENT ON COLUMN game_sessions.recurring_end_date IS 'Date to stop generating recurring sessions';
COMMENT ON COLUMN game_sessions.recurring_end_count IS 'Number of sessions to generate';
COMMENT ON COLUMN game_sessions.parent_recurring_id IS 'References the parent recurring session template';
COMMENT ON COLUMN game_sessions.created_from_recurring IS 'True if session was auto-generated from recurring template';