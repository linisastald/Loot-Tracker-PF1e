-- ============================================================================
-- PATCH FOR MANUAL MIGRATION 0.9.0
-- ============================================================================
-- This adds the missing discord_channel_id column that the code expects
-- but wasn't included in the original manual migration.
--
-- Run this if you're getting "Session not found" errors when clicking
-- Discord buttons.
-- ============================================================================

BEGIN;

-- Add missing discord_channel_id column
ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(20);

-- Add index for discord lookups
CREATE INDEX IF NOT EXISTS idx_game_sessions_discord_message_id ON game_sessions(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_announcement_message_id ON game_sessions(announcement_message_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_confirmation_message_id ON game_sessions(confirmation_message_id);

COMMENT ON COLUMN game_sessions.discord_channel_id IS 'Discord channel ID where session was announced';

COMMIT;

-- ============================================================================
-- After running this, restart your backend and resend the session announcement
-- ============================================================================
