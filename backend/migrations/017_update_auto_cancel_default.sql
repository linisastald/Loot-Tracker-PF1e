-- Update auto_cancel_hours default from 2 to 48 hours
-- This gives sessions 48 hours (2 days) notice before auto-cancellation

-- Update the default value for existing and new columns
ALTER TABLE game_sessions
ALTER COLUMN auto_cancel_hours SET DEFAULT 48;

-- Update existing sessions that have the old default of 2 hours to the new default
UPDATE game_sessions
SET auto_cancel_hours = 48
WHERE auto_cancel_hours = 2;

-- Add auto_cancel_hours to session_config if it doesn't exist
INSERT INTO session_config (setting_name, setting_value, setting_type, description)
VALUES ('default_auto_cancel_hours', '48', 'number', 'Default hours before session start to auto-cancel if minimum players not met')
ON CONFLICT (setting_name) DO UPDATE
SET setting_value = '48';

COMMENT ON COLUMN game_sessions.auto_cancel_hours IS 'Hours before session start to check for auto-cancellation due to insufficient players';
