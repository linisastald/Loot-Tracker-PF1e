-- Migration: 072_loot_cursed.sql
-- Description: Create loot.cursed on fresh installs (finding F-0360).
--
-- itemCreationController inserts loot.cursed, identificationService reads it and the loot
-- search filters on it, but neither database/init.sql nor any earlier migration created it.
-- Production already has the column (migration 052 mentions idx_loot_cursed), so on
-- production this migration is a no-op; on a fresh install it adds the missing column.
--
-- Idempotent (IF NOT EXISTS). Nullable with a constant default: metadata-only change.
-- loot_view (migration 056) does not expose the column and nothing reads it from the view.

ALTER TABLE loot ADD COLUMN IF NOT EXISTS cursed BOOLEAN DEFAULT false;

COMMENT ON COLUMN loot.cursed IS
    'DM-only flag: the item carries a curse (revealed by identification with a high Spellcraft roll).';
