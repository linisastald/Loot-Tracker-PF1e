-- Migration: 073_owner_data_corrections.sql
-- Description: Two data corrections decided by the owner after the 2026-10 code review.
--
-- 1. Official holidays (finding F-0047), checked by the owner against the Inner Sea
--    World Guide calendar:
--      - First Crusader Day (Mendev), also called Crusader Memorial Day, falls on
--        6 Arodus. It was seeded as 8 Arodus.
--      - 19 Calistril is Loyalty Day (Cheliax, Asmodeus), the national holiday that
--        commemorates the signing of the Treaty of Egorian. It was seeded under the
--        treaty's name.
--    Only official rows (is_custom = false, campaign_id IS NULL) that still hold the
--    seeded values are changed.
--
-- 2. Catalog wands the rules do not allow. A wand can hold a spell of 4th level or
--    lower (Core Rulebook, Magic Items: Wands). Ten global catalog rows are wands of
--    5th- or 6th-level spells and are removed. A row is deleted only when it still has
--    the seeded id and name, is a global row, and nothing references it: no loot row
--    (loot.itemid) and no item search (item_search.item_id, which would otherwise be
--    deleted by its ON DELETE CASCADE). Referenced rows are left in place and reported.
--
-- RLS: golarion_holidays, loot and item_search have tenant policies keyed on the
-- app.current_campaign GUC. The migration runner connects as the table owner, but the
-- statements must not depend on that, so the GUC is set to the cross-campaign mode
-- 'all' for this transaction only (as in 067).
--
-- Idempotent: every statement is guarded on the old value, so a second run changes
-- nothing. UNTESTED against a real database. Preview (rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/073_owner_data_corrections.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    holiday_rows INTEGER := 0;
    step_rows INTEGER;
    deleted_wands INTEGER;
    kept_wands TEXT;
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    -- 1. Holidays
    UPDATE golarion_holidays
       SET day = 6,
           description = 'A Mendevian holiday tied to the Worldwound crusades. Also called Crusader Memorial Day.'
     WHERE name = 'First Crusader Day'
       AND month = 8
       AND day = 8
       AND is_custom = false
       AND campaign_id IS NULL;
    GET DIAGNOSTICS step_rows = ROW_COUNT;
    holiday_rows := holiday_rows + step_rows;

    UPDATE golarion_holidays
       SET name = 'Loyalty Day',
           deity = 'Asmodeus',
           description = 'A Chelish national holiday commemorating the signing of the Treaty of Egorian.'
     WHERE name = 'Treaty of Egorian'
       AND month = 2
       AND day = 19
       AND is_custom = false
       AND campaign_id IS NULL;
    GET DIAGNOSTICS step_rows = ROW_COUNT;
    holiday_rows := holiday_rows + step_rows;

    -- 2. Wands above 4th level
    CREATE TEMP TABLE _wands_to_remove (id INTEGER PRIMARY KEY, name TEXT NOT NULL) ON COMMIT DROP;
    INSERT INTO _wands_to_remove (id, name) VALUES
        (7294, 'Wand of Animal Growth'),
        (7320, 'Wand of Break Enchantment'),
        (7339, 'Wand of Commune with Nature'),
        (7385, 'Wand of Dispel Chaos'),
        (7386, 'Wand of Dispel Evil'),
        (7387, 'Wand of Dispel Good'),
        (7388, 'Wand of Dispel Law'),
        (7396, 'Wand of Dominate Person'),
        (7455, 'Wand of Hold Monster'),
        (7478, 'Wand of Legend Lore');

    SELECT string_agg(i.name, ', ' ORDER BY i.name) INTO kept_wands
      FROM item i
      JOIN _wands_to_remove w ON w.id = i.id AND w.name = i.name
     WHERE i.campaign_id IS NULL
       AND (EXISTS (SELECT 1 FROM loot l WHERE l.itemid = i.id)
            OR EXISTS (SELECT 1 FROM item_search s WHERE s.item_id = i.id));

    DELETE FROM item i
     USING _wands_to_remove w
     WHERE i.id = w.id
       AND i.name = w.name
       AND i.campaign_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM loot l WHERE l.itemid = i.id)
       AND NOT EXISTS (SELECT 1 FROM item_search s WHERE s.item_id = i.id);
    GET DIAGNOSTICS deleted_wands = ROW_COUNT;

    RAISE NOTICE 'Migration 073: corrected % of 2 holiday rows; removed % of 10 wand rows',
        holiday_rows, deleted_wands;
    IF kept_wands IS NOT NULL THEN
        RAISE NOTICE 'Migration 073: kept because loot or a search references them: %', kept_wands;
    END IF;
END
$$;

COMMIT;
