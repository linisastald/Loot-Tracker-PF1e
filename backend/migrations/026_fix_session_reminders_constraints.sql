-- Migration: 026_fix_session_reminders_constraints.sql
-- Description: Fix session_reminders table to support manual and automated reminder tracking
-- Author: Database Architect Agent
-- Date: 2025-11-19
--
-- Context: The session_reminders table was originally designed with a CHECK constraint limiting
-- reminder_type to ('initial', 'followup', 'final'), but the Discord integration code needs to
-- distinguish between manual and automated reminders using values 'manual' and 'auto'.
--
-- Issues being resolved:
-- 1. CHECK constraint rejects 'auto' and 'manual' reminder_type values
-- 2. No way to prevent automated reminders from being sent too soon after manual reminders
-- 3. days_before is required but should be nullable for automated reminders (calculated dynamically)
--
-- Changes:
-- 1. Drop existing CHECK constraint on reminder_type
-- 2. Add new CHECK constraint allowing ('initial', 'followup', 'final', 'auto', 'manual')
-- 3. Add is_manual BOOLEAN column to easily identify manual reminders
-- 4. Make days_before nullable with DEFAULT NULL for automated reminders

-- UP Migration
BEGIN;

-- Store the constraint name for reference
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the existing CHECK constraint on reminder_type
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'session_reminders'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%reminder_type%';

    IF constraint_name IS NOT NULL THEN
        RAISE NOTICE 'Found existing constraint: %', constraint_name;
        EXECUTE format('ALTER TABLE session_reminders DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No existing reminder_type constraint found - this may be a fresh install';
    END IF;
END $$;

-- Add new CHECK constraint that includes 'auto' and 'manual' types
-- Keep original types for backward compatibility with any existing data
ALTER TABLE session_reminders
ADD CONSTRAINT session_reminders_reminder_type_check
CHECK (reminder_type IN ('initial', 'followup', 'final', 'auto', 'manual'));

COMMENT ON CONSTRAINT session_reminders_reminder_type_check ON session_reminders IS
'Validates reminder_type values:
- initial, followup, final: Legacy types for staged reminder campaigns
- auto: Automated system-generated reminders
- manual: DM-triggered manual reminders (prevents auto-reminders from being sent too soon)';

-- Add is_manual column for quick filtering without parsing reminder_type
-- This makes queries more efficient when checking for recent manual reminders
ALTER TABLE session_reminders
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN session_reminders.is_manual IS
'Quick boolean flag to identify manual reminders. Used to prevent automated reminders
from being sent within a cooldown period after a manual reminder. Set to TRUE when
reminder_type = ''manual'', FALSE otherwise.';

-- Create index for efficient queries checking recent manual reminders
CREATE INDEX IF NOT EXISTS idx_session_reminders_manual_recent
ON session_reminders(session_id, is_manual, sent_at)
WHERE is_manual = TRUE AND sent = TRUE;

COMMENT ON INDEX idx_session_reminders_manual_recent IS
'Optimizes queries checking for recent manual reminders to enforce cooldown periods.
Partial index only includes sent manual reminders for efficiency.';

-- Make days_before nullable to support automated reminders
-- Automated reminders calculate timing dynamically from game_sessions.reminder_hours
-- Manual and legacy reminders will still populate this field
ALTER TABLE session_reminders
ALTER COLUMN days_before DROP NOT NULL,
ALTER COLUMN days_before SET DEFAULT NULL;

COMMENT ON COLUMN session_reminders.days_before IS
'Days before session to send reminder. NULL for automated reminders (which calculate
dynamically from game_sessions.reminder_hours). Populated for manual reminders and
legacy scheduled reminders.';

-- Update any existing manual reminders (if any exist) to set is_manual flag
UPDATE session_reminders
SET is_manual = TRUE
WHERE reminder_type = 'manual';

-- Log the changes
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count > 0 THEN
        RAISE NOTICE 'Updated % existing manual reminders to set is_manual = TRUE', updated_count;
    ELSE
        RAISE NOTICE 'No existing manual reminders found to update';
    END IF;
END $$;

COMMIT;

-- DOWN Migration (Rollback)
-- WARNING: Rolling back this migration will cause data loss for 'auto' and 'manual' reminder types
-- Any reminders with these types will be deleted to satisfy the original CHECK constraint
--
-- BEGIN;
--
-- -- Delete any reminders with 'auto' or 'manual' types (cannot exist with old constraint)
-- DELETE FROM session_reminders
-- WHERE reminder_type IN ('auto', 'manual');
--
-- -- Drop the new constraint and indexes
-- ALTER TABLE session_reminders
-- DROP CONSTRAINT IF EXISTS session_reminders_reminder_type_check;
--
-- DROP INDEX IF EXISTS idx_session_reminders_manual_recent;
--
-- -- Restore original CHECK constraint
-- ALTER TABLE session_reminders
-- ADD CONSTRAINT session_reminders_reminder_type_check
-- CHECK (reminder_type IN ('initial', 'followup', 'final'));
--
-- -- Remove is_manual column
-- ALTER TABLE session_reminders
-- DROP COLUMN IF EXISTS is_manual;
--
-- -- Restore NOT NULL constraint on days_before
-- UPDATE session_reminders
-- SET days_before = 0
-- WHERE days_before IS NULL;
--
-- ALTER TABLE session_reminders
-- ALTER COLUMN days_before SET NOT NULL,
-- ALTER COLUMN days_before DROP DEFAULT;
--
-- COMMIT;

-- ================================================================================
-- SUMMARY OF CHANGES
-- ================================================================================
-- ✅ Updated reminder_type CHECK constraint:
--    • Added 'auto' type for automated system-generated reminders
--    • Added 'manual' type for DM-triggered manual reminders
--    • Retained 'initial', 'followup', 'final' for backward compatibility
--
-- ✅ Added is_manual BOOLEAN column:
--    • Default FALSE for all existing and new reminders
--    • Set to TRUE for reminder_type = 'manual'
--    • Enables efficient queries for recent manual reminder checks
--
-- ✅ Created partial index idx_session_reminders_manual_recent:
--    • Optimizes queries checking for recent manual reminders
--    • Only indexes sent manual reminders for efficiency
--    • Supports cooldown period enforcement
--
-- ✅ Made days_before nullable:
--    • Allows NULL for automated reminders (timing calculated from reminder_hours)
--    • Still populated for manual and legacy scheduled reminders
--    • Default value set to NULL
--
-- IMPACT ANALYSIS:
-- - Resolves SQL errors when inserting 'auto' or 'manual' reminder types
-- - Enables tracking of manual vs automated reminders
-- - Supports automated reminder cooldown after manual reminders
-- - No data loss: All existing reminders remain valid
-- - Backward compatible: Existing reminder types still supported
-- - Performance: New partial index improves manual reminder queries
--
-- USAGE NOTES:
-- - Set is_manual = TRUE and reminder_type = 'manual' for DM-triggered reminders
-- - Set is_manual = FALSE and reminder_type = 'auto' for automated system reminders
-- - Leave days_before = NULL for automated reminders (timing from reminder_hours)
-- - Populate days_before for manual reminders to record the intended timing
--
-- RELATED MIGRATIONS:
-- - 014_enhanced_session_management.sql (created session_reminders table)
-- - 022_consolidate_session_timing_columns.sql (added reminder_hours to game_sessions)
--
-- FOLLOW-UP TASKS:
-- - Update Discord integration code to use 'auto' and 'manual' types
-- - Implement cooldown logic to check is_manual and sent_at before sending auto-reminders
-- - Update reminder creation code to set is_manual flag appropriately
