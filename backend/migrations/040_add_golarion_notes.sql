-- Migration: Rich Golarion calendar notes
-- Description: Replaces the single-note-per-day golarion_calendar_notes with a
-- richer golarion_notes table supporting multi-day (spanning) notes, multiple
-- notes per day, DM-only visibility, and authorship. Existing notes are
-- migrated as single-day, player-visible notes. The legacy table is left in
-- place (read-only) to preserve the original data.

CREATE TABLE IF NOT EXISTS golarion_notes (
    id SERIAL PRIMARY KEY,
    start_year INTEGER NOT NULL,
    start_month INTEGER NOT NULL,
    start_day INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    end_month INTEGER NOT NULL,
    end_day INTEGER NOT NULL,
    note TEXT NOT NULL,
    dm_only BOOLEAN NOT NULL DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for the common "notes starting in this range" lookups and ordering.
CREATE INDEX IF NOT EXISTS idx_golarion_notes_start
    ON golarion_notes (start_year, start_month, start_day);
CREATE INDEX IF NOT EXISTS idx_golarion_notes_created_by
    ON golarion_notes (created_by);

COMMENT ON TABLE golarion_notes IS 'Calendar notes/events. A note spans start..end (inclusive); single-day notes have end = start. dm_only notes are visible to DMs only.';
COMMENT ON COLUMN golarion_notes.dm_only IS 'When true, the note is visible only to DMs.';
COMMENT ON COLUMN golarion_notes.created_by IS 'User who created the note (nullable; set null if the user is removed).';

-- Migrate legacy single-day notes (idempotent: skip rows already migrated).
INSERT INTO golarion_notes (start_year, start_month, start_day, end_year, end_month, end_day, note, dm_only)
SELECT gcn.year, gcn.month, gcn.day, gcn.year, gcn.month, gcn.day, gcn.note, false
FROM golarion_calendar_notes gcn
WHERE NOT EXISTS (
    SELECT 1 FROM golarion_notes gn
    WHERE gn.start_year = gcn.year AND gn.start_month = gcn.month AND gn.start_day = gcn.day
      AND gn.end_year = gcn.year AND gn.end_month = gcn.month AND gn.end_day = gcn.day
      AND gn.note = gcn.note
);
