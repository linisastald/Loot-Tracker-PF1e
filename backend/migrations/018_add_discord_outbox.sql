-- Migration: Add Discord outbox table for reliable messaging
-- This implements the outbox pattern to ensure Discord notifications are never lost
-- when database updates succeed but Discord API calls fail

CREATE TABLE IF NOT EXISTS discord_outbox (
    id SERIAL PRIMARY KEY,

    -- Message details
    message_type VARCHAR(50) NOT NULL, -- 'session_announcement', 'session_update', 'session_cancellation', 'reminder'
    payload JSONB NOT NULL, -- Contains all data needed to send the Discord message

    -- Processing status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,

    -- Related entity
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,

    -- Error tracking
    last_error TEXT,
    last_attempt_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP
);

-- Index for efficient processing
CREATE INDEX IF NOT EXISTS idx_discord_outbox_status_created
ON discord_outbox(status, created_at)
WHERE status IN ('pending', 'failed');

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_discord_outbox_session
ON discord_outbox(session_id);

-- Comments
COMMENT ON TABLE discord_outbox IS 'Outbox pattern for reliable Discord message delivery';
COMMENT ON COLUMN discord_outbox.message_type IS 'Type of Discord message to send';
COMMENT ON COLUMN discord_outbox.payload IS 'JSON payload with all data needed to construct Discord message';
COMMENT ON COLUMN discord_outbox.status IS 'Processing status: pending, processing, sent, or failed';
COMMENT ON COLUMN discord_outbox.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN discord_outbox.session_id IS 'Related session ID if applicable';
