-- Migration: 074_crew_hire_date.sql
-- Description: Store the crew member's hire date (owner decision 2026-10-06).
--
-- The crew form has always had a "Hire Date" field and sent it on save, but there was
-- no column to keep it, so it was silently lost. The value is a campaign-calendar
-- (Golarion) date such as 4722-01-15, stored in a plain DATE like crew.death_date and
-- crew.departure_date; the application returns it as a 'YYYY-MM-DD' string.
--
-- Idempotent (IF NOT EXISTS). Nullable, no default: metadata-only change, existing
-- crew members simply have no hire date.

ALTER TABLE crew ADD COLUMN IF NOT EXISTS hire_date DATE;

COMMENT ON COLUMN crew.hire_date IS
    'Date the crew member was hired, as a campaign (Golarion) calendar date. NULL = not recorded.';
