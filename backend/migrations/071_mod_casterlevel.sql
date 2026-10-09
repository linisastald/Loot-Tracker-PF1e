-- Migration: 071_mod_casterlevel.sql
-- Description: Create mod.casterlevel on fresh installs (finding F-1735).
--
-- adminController (mod create/update) and identificationService (caster level of a mod)
-- read and write mod.casterlevel, but neither database/init.sql nor any earlier migration
-- created it. Production already has the column (added by hand), so on production this
-- migration is a no-op; on a fresh install it adds the missing column.
--
-- Idempotent (IF NOT EXISTS). Nullable, no default: metadata-only change.

ALTER TABLE mod ADD COLUMN IF NOT EXISTS casterlevel INTEGER;

COMMENT ON COLUMN mod.casterlevel IS
    'Minimum caster level of the enchantment this mod represents (used when identifying items). NULL = not set.';
