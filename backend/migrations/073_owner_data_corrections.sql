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
-- 2. Catalog wands of spells above 4th level. A wand can hold a spell of 4th level or
--    lower (Core Rulebook, Magic Items: Wands).
--    a. Dispel Good and Dispel Law are 5th level for every class that has them
--       (cleric 5 only), so no wand of them can exist. Those two global catalog rows are
--       removed. A row is deleted only when it still has the seeded id and name, is a
--       global row, and nothing references it: no loot row (loot.itemid) and no item
--       search (item_search.item_id, which would otherwise be deleted by its
--       ON DELETE CASCADE). Referenced rows are left in place and reported.
--    b. Eight other wands looked illegal because the spell is 5th or 6th level for a
--       wizard, cleric or druid, but a bard, paladin or ranger casts it as a 4th-level
--       spell, so the wand is legal: Animal Growth (ranger 4), Break Enchantment
--       (bard 4, paladin 4), Commune with Nature (ranger 4), Dispel Chaos and Dispel
--       Evil (paladin 4), Dominate Person, Hold Monster and Legend Lore (bard 4).
--       They were priced as 4th-level wizard wands (420 gp per charge, caster level 7).
--       They are repriced like the other bard/paladin/ranger 4th-level wands in 065:
--       caster level 10, 4 x 10 x 15 = 600 gp per charge (wand values are PER CHARGE),
--       plus 250 gp per charge for Legend Lore's incense. Only global rows still holding
--       the old value are changed.
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
    repriced_wands INTEGER;
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

    -- 2a. Wands no class can make (cleric 5 only)
    CREATE TEMP TABLE _wands_to_remove (id INTEGER PRIMARY KEY, name TEXT NOT NULL) ON COMMIT DROP;
    INSERT INTO _wands_to_remove (id, name) VALUES
        (7387, 'Wand of Dispel Good'),
        (7388, 'Wand of Dispel Law');

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

    -- 2b. Legal 4th-level bard/paladin/ranger wands: per-charge price and caster level
    UPDATE item AS i
       SET value = f.new_value::numeric,
           casterlevel = 10
      FROM (VALUES
        (7294, 'Wand of Animal Growth', 600),
        (7320, 'Wand of Break Enchantment', 600),
        (7339, 'Wand of Commune with Nature', 600),
        (7385, 'Wand of Dispel Chaos', 600),
        (7386, 'Wand of Dispel Evil', 600),
        (7396, 'Wand of Dominate Person', 600),
        (7455, 'Wand of Hold Monster', 600),
        (7478, 'Wand of Legend Lore', 850)
      ) AS f(id, name, new_value)
     WHERE i.id = f.id
       AND i.name = f.name
       AND i.campaign_id IS NULL
       AND i.value IS NOT DISTINCT FROM 420::numeric;
    GET DIAGNOSTICS repriced_wands = ROW_COUNT;

    RAISE NOTICE 'Migration 073: corrected % of 2 holiday rows; removed % of 2 wand rows; repriced % of 8 wand rows',
        holiday_rows, deleted_wands, repriced_wands;
    IF kept_wands IS NOT NULL THEN
        RAISE NOTICE 'Migration 073: kept because loot or a search references them: %', kept_wands;
    END IF;
END
$$;

COMMIT;
