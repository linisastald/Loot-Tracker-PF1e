-- Migration: 083_normalize_legacy_loot_and_roles.sql
-- Description: Bring old rows into the vocabularies the application enforces today
-- (found reviewing the test and production databases on 2026-10-08).
--
--   1. users.role: 'player' -> 'Player', 'dm' -> 'DM'. The login check compares the
--      exact string, so a lowercase role (written by an old test-data seeder) could not
--      log in at all. Production has none; the test instance has three.
--
--   2. loot.status: 'Trash' -> 'Trashed' (old test fixture), and the legacy
--      'Kept Self' -> 'Kept Character'. New keeps have written 'Kept Character' for a
--      long time; the kept-character report read both, but the DM Item Management status
--      filter only offered 'Kept Self', so newer kept items never appeared under it.
--      Production has 34 'Kept Self' rows.
--
--   3. loot.type: 70 production rows have no type (entered before the type became
--      required). Where the row is linked to a catalog item, the item's type is used
--      (55 rows on production); the legacy free-text types from the old test fixtures
--      (gem, cloak, boots, wondrous, scroll, potion, tool, alchemical, ammunition, ...)
--      are mapped to the nearest real type; anything still outside the vocabulary,
--      including the unlinked NULLs, becomes 'other'. The UI's type filter already put
--      these rows under "Other", so this changes what the filter calls them, not where
--      they appear.
--
-- RLS: loot has tenant policies keyed on app.current_campaign; the GUC is set to 'all'
-- for this transaction so every campaign's rows are updated (as in 073 / 078).
--
-- Idempotent: every UPDATE matches only rows still holding a legacy value. One
-- transaction. UNTESTED against a real database. Roll-back preview (prints the NOTICE
-- counts, then rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/083_normalize_legacy_loot_and_roles.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    n_roles INTEGER;
    n_trash INTEGER;
    n_kept INTEGER;
    n_from_item INTEGER;
    n_mapped INTEGER;
    n_other INTEGER;
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    -- 1. Role case.
    UPDATE users
       SET role = CASE lower(role) WHEN 'player' THEN 'Player' WHEN 'dm' THEN 'DM' END
     WHERE lower(role) IN ('player', 'dm')
       AND role NOT IN ('Player', 'DM');
    GET DIAGNOSTICS n_roles = ROW_COUNT;

    -- 2. Status spellings.
    UPDATE loot SET status = 'Trashed' WHERE status = 'Trash';
    GET DIAGNOSTICS n_trash = ROW_COUNT;

    UPDATE loot SET status = 'Kept Character' WHERE status = 'Kept Self';
    GET DIAGNOSTICS n_kept = ROW_COUNT;

    -- 3a. Untyped rows take the type of their catalog item.
    UPDATE loot l
       SET type = i.type
      FROM item i
     WHERE l.itemid = i.id
       AND l.type IS NULL
       AND i.type IN ('weapon', 'armor', 'magic', 'gear', 'trade good', 'other');
    GET DIAGNOSTICS n_from_item = ROW_COUNT;

    -- 3b. Legacy free-text types from the old test fixtures.
    UPDATE loot
       SET type = CASE lower(type)
                    WHEN 'gem' THEN 'trade good'
                    WHEN 'treasure' THEN 'trade good'
                    WHEN 'coin' THEN 'trade good'
                    WHEN 'jewelry' THEN 'trade good'
                    WHEN 'art' THEN 'trade good'
                    WHEN 'ammunition' THEN 'weapon'
                    WHEN 'tool' THEN 'gear'
                    WHEN 'alchemical' THEN 'gear'
                    WHEN 'kit' THEN 'gear'
                    WHEN 'clothing' THEN 'gear'
                    ELSE 'magic'   -- cloak, boots, wondrous, scroll, potion, wand, ring, rod, staff, amulet, belt
                  END
     WHERE lower(type) IN ('gem', 'treasure', 'coin', 'jewelry', 'art', 'ammunition', 'tool', 'alchemical',
                           'kit', 'clothing', 'cloak', 'boots', 'wondrous', 'scroll', 'potion', 'wand', 'ring',
                           'rod', 'staff', 'amulet', 'belt');
    GET DIAGNOSTICS n_mapped = ROW_COUNT;

    -- 3c. Whatever is left outside the vocabulary (including unlinked NULLs).
    UPDATE loot
       SET type = 'other'
     WHERE type IS NULL
        OR type NOT IN ('weapon', 'armor', 'magic', 'gear', 'trade good', 'other');
    GET DIAGNOSTICS n_other = ROW_COUNT;

    RAISE NOTICE 'Migration 083: % user roles recased; loot status: % Trash->Trashed, % Kept Self->Kept Character; loot type: % from catalog, % legacy names mapped, % set to other',
        n_roles, n_trash, n_kept, n_from_item, n_mapped, n_other;
END
$$;

COMMIT;
