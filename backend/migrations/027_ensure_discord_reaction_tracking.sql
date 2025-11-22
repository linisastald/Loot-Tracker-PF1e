-- Migration 027: Ensure discord_reaction_tracking table exists
-- This migration is idempotent and safe to run even if the table already exists
-- Addresses missing table from migration 014 if it wasn't fully applied

-- Create Discord reaction tracking table (if not exists)
CREATE TABLE IF NOT EXISTS discord_reaction_tracking (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(20) NOT NULL,
    user_discord_id VARCHAR(20) NOT NULL,
    reaction_emoji VARCHAR(50) NOT NULL,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    reaction_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_discord_id, reaction_emoji)
);

-- Create indexes for better performance (if not exists)
CREATE INDEX IF NOT EXISTS idx_discord_reactions_message_id ON discord_reaction_tracking(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_reactions_session_id ON discord_reaction_tracking(session_id);

-- Add comment
COMMENT ON TABLE discord_reaction_tracking IS 'Tracks Discord button interactions for session attendance to prevent duplicate processing';
