-- Migration: 080_spellbook_subtype.sql
-- Description: "spellbook" is a subtype of item type magic (owner decision). Loot rows
-- have no subtype column; they get it through loot.itemid, so the loot generator links a
-- generated spellbook to the global catalog row 'Spellbook'. That row, and the two other
-- blank-book rows, therefore get subtype 'spellbook'. Types and values are unchanged (a
-- blank spellbook is mundane gear). database/item_data.sql carries the same change, so
-- on a fresh install this migration changes 0 rows.
--
-- Safety: a row is changed only when it still has the seeded id and name, is global
-- (campaign_id IS NULL) and has no subtype yet. Idempotent: after one run nothing
-- matches. One transaction. The item table has no row-level security.
-- UNTESTED against a real database. Roll-back preview (prints the NOTICE count, then
-- rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/080_spellbook_subtype.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    n_updated INTEGER;
BEGIN
    UPDATE item i
       SET subtype = 'spellbook'
      FROM (VALUES
        (1357, 'Compact Spellbook'),
        (6472, 'Spellbook'),
        (7081, 'Traveling Spellbook')
      ) AS s(id, name)
     WHERE i.id = s.id
       AND i.name = s.name
       AND i.campaign_id IS NULL
       AND i.subtype IS NULL;
    GET DIAGNOSTICS n_updated = ROW_COUNT;

    RAISE NOTICE 'Migration 080: set subtype spellbook on % of 3 catalog items', n_updated;
END
$$;

COMMIT;
