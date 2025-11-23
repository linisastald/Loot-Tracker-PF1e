-- Quick fix: Create missing discord_reaction_tracking table
-- This is safe to run - uses IF NOT EXISTS

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discord_reactions_message_id ON discord_reaction_tracking(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_reactions_session_id ON discord_reaction_tracking(session_id);

-- Verify table was created
SELECT 'discord_reaction_tracking table created successfully' AS status;
