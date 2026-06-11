-- Migration: 046_registration_mode.sql
-- Description: Multi-campaign refactor Phase 3b (invite overhaul) - settings.
--   Seeds a single 'registration_mode' setting ('open' | 'invite-only' |
--   'closed') that replaces the old registrations_open / invite_required
--   pair as the source of truth for the registration flow.
-- Author: Backend Agent
-- Date: 2026-06-10
--
-- This migration is IDEMPOTENT: the row is only inserted when no
-- 'registration_mode' setting exists yet. The migration runner wraps this
-- file in a transaction automatically, so no explicit BEGIN/COMMIT.
--
-- Derivation from the legacy settings (preserves current runtime behavior):
--   * registrations_open present and not '1' (the old code treated anything
--     other than 1/'1' as closed, and closed registration + an invite code
--     WAS the invite flow)            -> 'invite-only'
--   * registrations_open = '1' AND invite_required = '1' -> 'invite-only'
--   * otherwise (open, or no legacy row at all)          -> 'open'
--
-- The legacy 'registrations_open' and 'invite_required' rows are left in
-- place untouched. They are DEPRECATED and no longer read by the backend;
-- they are kept only so a rollback of the application code keeps working.

INSERT INTO settings (name, value, value_type, description)
SELECT
    'registration_mode',
    CASE
        WHEN EXISTS (
                 SELECT 1 FROM settings
                 WHERE name = 'registrations_open' AND value IS DISTINCT FROM '1'
             )
            THEN 'invite-only'
        WHEN (SELECT value FROM settings WHERE name = 'registrations_open') = '1'
         AND (SELECT value FROM settings WHERE name = 'invite_required') = '1'
            THEN 'invite-only'
        ELSE 'open'
    END,
    'string',
    'How new accounts may register: open (anyone), invite-only (a valid invite code is required), or closed (no new registrations)'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE name = 'registration_mode');

COMMENT ON TABLE settings IS 'Global application settings. registration_mode supersedes the deprecated registrations_open/invite_required rows.';
