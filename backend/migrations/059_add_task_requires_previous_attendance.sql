-- Migration 059: session tasks that require attendance at the previous session
--
-- Adds requires_previous_attendance to session_task_definition. When true, the
-- Tasks page only deals the task to characters who were at the last session
-- (the Tasks page marks each selected character as "Was at last session",
-- pre-filled from the previous task-assignment record). The motivating case is
-- the pre-session "Recap" task: someone who missed the last session cannot
-- recap it.
--
-- Existing campaigns get the flag switched on for their stock "Recap"
-- pre-session task so the intended behaviour applies without DM action;
-- renamed/custom tasks are left alone. The migration runner wraps this file in
-- a transaction. IDEMPOTENT: ADD COLUMN IF NOT EXISTS; the UPDATE is a no-op
-- once the flag is set.

ALTER TABLE session_task_definition
    ADD COLUMN IF NOT EXISTS requires_previous_attendance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN session_task_definition.requires_previous_attendance IS
    'Only deal this task to characters who attended the previous session (e.g. Recap).';

UPDATE session_task_definition
SET requires_previous_attendance = true, updated_at = NOW()
WHERE phase = 'pre'
  AND name = 'Recap'
  AND requires_previous_attendance = false;
