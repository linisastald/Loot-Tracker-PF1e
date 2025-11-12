-- Migration: Add recurring session support
-- Date: 2025-11-12
-- Description: Adds columns to support recurring session creation and management

-- Add recurring session columns to game_sessions table
ALTER TABLE game_sessions
ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE,
ADD COLUMN recurring_pattern VARCHAR(20) CHECK (recurring_pattern IN ('weekly', 'biweekly', 'monthly', 'custom')),
ADD COLUMN recurring_day_of_week INTEGER CHECK (recurring_day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
ADD COLUMN recurring_interval INTEGER DEFAULT 1, -- For custom intervals (e.g., every 2 weeks)
ADD COLUMN recurring_end_date DATE, -- When to stop generating sessions
ADD COLUMN recurring_end_count INTEGER, -- Alternative: stop after N sessions
ADD COLUMN parent_recurring_id INTEGER REFERENCES game_sessions(id), -- Links generated sessions to parent
ADD COLUMN created_from_recurring BOOLEAN DEFAULT FALSE; -- Identifies auto-generated sessions

-- Create index for efficient recurring session queries
CREATE INDEX idx_game_sessions_recurring ON game_sessions(is_recurring, recurring_pattern);
CREATE INDEX idx_game_sessions_parent_recurring ON game_sessions(parent_recurring_id);
CREATE INDEX idx_game_sessions_next_occurrence ON game_sessions(start_time) WHERE is_recurring = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN game_sessions.is_recurring IS 'Indicates if this is a recurring session template';
COMMENT ON COLUMN game_sessions.recurring_pattern IS 'Frequency pattern: weekly, biweekly, monthly, custom';
COMMENT ON COLUMN game_sessions.recurring_day_of_week IS 'Day of week (0=Sunday, 6=Saturday) for recurring sessions';
COMMENT ON COLUMN game_sessions.recurring_interval IS 'Interval for custom patterns (e.g., every 2 weeks)';
COMMENT ON COLUMN game_sessions.recurring_end_date IS 'Date to stop generating recurring sessions';
COMMENT ON COLUMN game_sessions.recurring_end_count IS 'Number of sessions to generate';
COMMENT ON COLUMN game_sessions.parent_recurring_id IS 'References the parent recurring session template';
COMMENT ON COLUMN game_sessions.created_from_recurring IS 'True if session was auto-generated from recurring template';