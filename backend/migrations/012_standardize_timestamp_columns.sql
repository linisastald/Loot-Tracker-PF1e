-- Migration: Standardize timestamp column naming
-- Description: Rename timestamp columns to follow consistent naming patterns
-- Created: 2025-08-05
-- Status: Schema standardization

BEGIN;

-- Rename appraisal.time to appraisal.appraised_on
-- This field represents when the appraisal was performed
ALTER TABLE appraisal RENAME COLUMN time TO appraised_on;

-- Rename consumableuse.time to consumableuse.consumed_on  
-- This field represents when the consumable was used
ALTER TABLE consumableuse RENAME COLUMN time TO consumed_on;

-- Add comment to document the change
COMMENT ON COLUMN appraisal.appraised_on IS 'Timestamp when the item was appraised';
COMMENT ON COLUMN consumableuse.consumed_on IS 'Timestamp when the consumable was used';

-- Update indexes that reference the old column names
-- Drop old indexes and create new ones with updated names

-- Update appraisal time index
DROP INDEX IF EXISTS idx_appraisal_time;
CREATE INDEX IF NOT EXISTS idx_appraisal_appraised_on ON appraisal(appraised_on);

-- Update consumableuse time index
DROP INDEX IF EXISTS idx_consumableuse_time;
CREATE INDEX IF NOT EXISTS idx_consumableuse_consumed_on ON consumableuse(consumed_on);

-- Record this migration
INSERT INTO schema_migrations (filename) VALUES ('012_standardize_timestamp_columns.sql');

COMMIT;