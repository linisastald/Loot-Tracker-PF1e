-- Migration 060: per-task options for session task definitions
--
-- Turns the last hardcoded rules around session tasks into per-task options
-- so custom tasks get the same behaviour the stock list had baked into code:
--
--  * exclude_late       skip characters marked "Late" (was: every pre task)
--  * exclude_early      skip characters marked "Leaving early"
--  * dm_eligible        the DM can draw this task (was: every post task)
--  * announce_label     shown in the next session announcement as
--                       "<label>: <name>" (generalises is_snack_master, which
--                       stays in place for compatibility and is derived from
--                       the label = 'Snack Master')
--  * sticky             whoever drew it last session keeps it if present
--  * avoid_repeat       never goes to whoever had it last session
--  * priority           0 normal, 1 dealt before normal tasks, 2 always dealt
--                       even if someone gets an extra slot
--  * max_characters     skip when more than this many characters are selected
--  * is_active          inactive tasks are kept but never dealt
--  * description        shown under the task on the Tasks page and in Discord
--  * fixed_character_id always goes to this character when present/eligible
--
-- session_task_history gains announcements JSONB ({ "Snack Master": "Bob" })
-- written by POST /sessions/task-history and read by the session announcement.
--
-- The migration runner wraps this file in a transaction. IDEMPOTENT: every
-- ADD COLUMN uses IF NOT EXISTS; the data updates only touch rows still at
-- their defaults.

ALTER TABLE session_task_definition
    ADD COLUMN IF NOT EXISTS exclude_late BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exclude_early BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS dm_eligible BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS announce_label VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sticky BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS avoid_repeat BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 0
        CHECK (priority BETWEEN 0 AND 2),
    ADD COLUMN IF NOT EXISTS max_characters SMALLINT
        CHECK (max_characters IS NULL OR max_characters BETWEEN 1 AND 50),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS fixed_character_id INTEGER
        REFERENCES characters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_task_definition_fixed_character
    ON session_task_definition(fixed_character_id)
    WHERE fixed_character_id IS NOT NULL;

COMMENT ON COLUMN session_task_definition.exclude_late IS 'Skip characters marked as arriving late.';
COMMENT ON COLUMN session_task_definition.exclude_early IS 'Skip characters marked as leaving early.';
COMMENT ON COLUMN session_task_definition.dm_eligible IS 'The DM can draw this task.';
COMMENT ON COLUMN session_task_definition.announce_label IS 'Label shown in the next session announcement as "<label>: <assignee>"; NULL = not announced.';
COMMENT ON COLUMN session_task_definition.sticky IS 'Whoever drew it last session keeps it when present and eligible.';
COMMENT ON COLUMN session_task_definition.avoid_repeat IS 'Never dealt to whoever had it last session when anyone else can take it.';
COMMENT ON COLUMN session_task_definition.priority IS '0 normal, 1 dealt before normal tasks, 2 always dealt even over the slot limit.';
COMMENT ON COLUMN session_task_definition.max_characters IS 'Only include when at most this many characters are selected; NULL = always.';
COMMENT ON COLUMN session_task_definition.is_active IS 'Inactive tasks are kept in the list but never dealt.';
COMMENT ON COLUMN session_task_definition.description IS 'Short instructions shown under the task on the Tasks page and in the Discord embed.';
COMMENT ON COLUMN session_task_definition.fixed_character_id IS 'Always goes to this character when they are selected and eligible; otherwise dealt normally.';

-- Preserve the behaviour the phases used to hardcode.
UPDATE session_task_definition SET exclude_late = true, updated_at = NOW()
WHERE phase = 'pre' AND exclude_late = false;

UPDATE session_task_definition SET dm_eligible = true, updated_at = NOW()
WHERE phase = 'post' AND dm_eligible = false;

UPDATE session_task_definition SET announce_label = 'Snack Master', updated_at = NOW()
WHERE is_snack_master = true AND announce_label IS NULL;

-- Announcements recorded with each task assignment.
ALTER TABLE session_task_history
    ADD COLUMN IF NOT EXISTS announcements JSONB;

COMMENT ON COLUMN session_task_history.announcements IS 'JSON { "<announce_label>": "<assignee name(s)>" } for tasks with an announce label; shown in the next session announcement.';
