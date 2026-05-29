-- Migration: Add session_task_history for manual task-assignment tracking
-- Records every manual assignment from the Tasks page. Unlike the legacy
-- session_task_assignments table (which has UNIQUE(session_id) and stored only
-- the latest auto-generated set), this table keeps full history -- many rows
-- per session, one per "Assign Tasks" click.

CREATE TABLE IF NOT EXISTS session_task_history (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
    session_title VARCHAR(255),          -- denormalized snapshot, survives session deletion
    assignments JSONB NOT NULL,          -- { pre: {...}, during: {...}, post: {...} }
    character_count INTEGER DEFAULT 0,
    late_count INTEGER DEFAULT 0,
    snack_master_name VARCHAR(255),      -- whoever got the "snacks for next session" post-task
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_task_history_session_id ON session_task_history(session_id);
CREATE INDEX IF NOT EXISTS idx_session_task_history_created_at ON session_task_history(created_at DESC);

COMMENT ON TABLE session_task_history IS 'Full history of manual pre/during/post-session task assignments made from the Tasks page';
COMMENT ON COLUMN session_task_history.assignments IS 'JSON: { pre: {char: [tasks]}, during: {...}, post: {...} }';
COMMENT ON COLUMN session_task_history.session_title IS 'Snapshot of the session title at assignment time; survives session deletion';
COMMENT ON COLUMN session_task_history.snack_master_name IS 'Character/DM assigned the post-session snacks task; surfaced as Snack Master in the NEXT session announcement';

-- Clean up the now-removed auto task generation setting (feature removed).
DELETE FROM settings WHERE name = 'auto_task_generation_enabled';
