-- Migration: 082_resolve_placeholder_items.sql
-- Description: Resolve the comma-form placeholder catalog rows (type 'other', value NULL;
-- finding F-0896, owner decision of 2026-10-08: look the values up). Two groups:
--
--   A. 40 rows that duplicate a properly named catalog item ('Crossbow, Heavy' beside
--      'Heavy Crossbow'). These are merged into the existing row exactly as
--      migration 078 did: loot.itemid and
--      item_search.item_id are repointed, then the placeholder is deleted. The kept row
--      already carries the type, subtype, value and weight. loot.name is not touched.
--
--   B. 9 rows with no twin get their value from the rules (per unit for ammunition, like
--      the rest of the catalog where an arrow is 0.05):
--        Bolt, Crossbow            0.1   CRB equipment table: 1 gp per 10
--        Bolt, Repeating Crossbow  0.2   CRB equipment table: 1 gp per 5
--        Bullet, Sling             0.01  CRB equipment table: 1 sp per 10
--        Holy Symbol, Silver       25    CRB equipment table
--        Holy Symbol, Wooden       1     CRB equipment table
--        Pack Animal, Mule         8     CRB equipment table ("Donkey or mule")
--        Shield, Tower             30    CRB armor table
--        Bolt, Hushing             547   UE: hushing bolts share the hushing arrow's stats
--        Bolt, Greater Hushing     1047  UE: as above, greater
--        Rythius, The Kyton Scourge 53000 Champions of Purity (aonprd.com)
--      Type and subtype are left as they are; the remaining 'other' rows beside these
--      (the already-priced Hushing Arrow, Dust Bolt, ...) use the same convention.
--
-- database/item_data.sql carries the same changes, so on a fresh install this migration
-- changes 0 rows.
--
-- RLS: as in 078, the GUC is set to 'all' for this transaction so the loot and
-- item_search updates see every campaign's rows.
--
-- Safety: a merge happens only when both rows still have the seeded id and name and are
-- global; a value is set only on a seeded global row whose value is still NULL.
-- Idempotent. One transaction. UNTESTED against a real database.
-- Roll-back preview (prints the NOTICE counts, then rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/082_resolve_placeholder_items.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    n_pairs INTEGER;
    n_loot INTEGER;
    n_search INTEGER;
    n_deleted INTEGER;
    n_valued INTEGER;
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    CREATE TEMP TABLE _item_merge (
        drop_id INTEGER PRIMARY KEY,
        drop_name TEXT NOT NULL,
        keep_id INTEGER NOT NULL,
        keep_name TEXT NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO _item_merge (drop_id, drop_name, keep_id, keep_name) VALUES
        (311, 'Axe, Orc Double', 4228, 'Orc Double Axe'),
        (312, 'Axe, Throwing', 6964, 'Throwing Axe'),
        (1134, 'Chain, Spiked', 6516, 'Spiked Chain'),
        (1424, 'Crossbow, Hand', 2661, 'Hand Crossbow'),
        (1425, 'Crossbow, Heavy', 2776, 'Heavy Crossbow'),
        (1427, 'Crossbow, Light', 3378, 'Light Crossbow'),
        (1428, 'Crossbow, Repeating Heavy', 4913, 'Repeating Heavy Crossbow'),
        (1429, 'Crossbow, Repeating Light', 4914, 'Repeating Light Crossbow'),
        (1475, 'Curve Blade, Elven', 1912, 'Elven Curve Blade'),
        (1499, 'Dagger, Punching', 4789, 'Punching Dagger'),
        (1530, 'Dart, Blowgun', 672, 'Blowgun Dart'),
        (2167, 'Flail, Dire', 1670, 'Dire Flail'),
        (2168, 'Flail, Heavy', 2777, 'Heavy Flail'),
        (2169, 'Flail, Light', 3382, 'Light Flail'),
        (2370, 'Gauntlet, Spiked', 6518, 'Spiked Gauntlet'),
        (2653, 'Hammer, Gnome Hooked', 2466, 'Gnome Hooked Hammer'),
        (2655, 'Hammer, Light', 3383, 'Light Hammer'),
        (2888, 'Holy Symbol, Compartment', 1359, 'Compartment Holy Symbol'),
        (2889, 'Holy Symbol, Flask', 2182, 'Flask Holy Symbol'),
        (3446, 'Longbow, Composite', 1361, 'Composite Longbow'),
        (3447, 'Longbow, Composite (+0 Str)', 1361, 'Composite Longbow'),
        (3501, 'Mace, Heavy', 2782, 'Heavy Mace'),
        (3502, 'Mace, Light', 3388, 'Light Mace'),
        (4045, 'Nunchaku, Metal', 4044, 'Nunchaku'),
        (4265, 'Pack Animal, Donkey', 1697, 'Donkey'),
        (4267, 'Pack Animal, Ox', 4263, 'Ox'),
        (4407, 'Pick, Heavy', 2783, 'Heavy Pick'),
        (4409, 'Pick, Light', 3390, 'Light Pick'),
        (6194, 'Shield, Heavy Steel', 2784, 'Heavy Steel Shield'),
        (6195, 'Shield, Heavy Wooden', 2787, 'Heavy Wooden Shield'),
        (6196, 'Shield, Light Steel', 3391, 'Light Steel Shield'),
        (6198, 'Shield, Light Wooden', 3393, 'Light Wooden Shield'),
        (6246, 'Shortbow, Composite', 1362, 'Composite Shortbow'),
        (6247, 'Shortbow, Composite (+0 Str)', 1362, 'Composite Shortbow'),
        (6371, 'Sling Staff, Halfling', 2637, 'Halfling Sling Staff'),
        (6798, 'Sword, Bastard', 427, 'Bastard Sword'),
        (6827, 'Sword, Short', 6249, 'Short Sword'),
        (6828, 'Sword, Two-Bladed', 7141, 'Two-Bladed Sword'),
        (7175, 'Urgrosh, Dwarven', 1823, 'Dwarven Urgrosh'),
        (7639, 'Waraxe, Dwarven', 1824, 'Dwarven Waraxe');

    -- Keep only the pairs where both rows are still the seeded global rows.
    DELETE FROM _item_merge m
     WHERE NOT EXISTS (SELECT 1 FROM item d
                        WHERE d.id = m.drop_id AND d.name = m.drop_name AND d.campaign_id IS NULL)
        OR NOT EXISTS (SELECT 1 FROM item k
                        WHERE k.id = m.keep_id AND k.name = m.keep_name AND k.campaign_id IS NULL);
    SELECT count(*) INTO n_pairs FROM _item_merge;

    UPDATE loot l
       SET itemid = m.keep_id
      FROM _item_merge m
     WHERE l.itemid = m.drop_id;
    GET DIAGNOSTICS n_loot = ROW_COUNT;

    UPDATE item_search s
       SET item_id = m.keep_id
      FROM _item_merge m
     WHERE s.item_id = m.drop_id;
    GET DIAGNOSTICS n_search = ROW_COUNT;

    DELETE FROM item i
     USING _item_merge m
     WHERE i.id = m.drop_id
       AND i.name = m.drop_name
       AND i.campaign_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM loot l WHERE l.itemid = i.id)
       AND NOT EXISTS (SELECT 1 FROM item_search s WHERE s.item_id = i.id);
    GET DIAGNOSTICS n_deleted = ROW_COUNT;

    -- B. Values for the rows with no twin.
    UPDATE item i
       SET value = v.value
      FROM (VALUES
        (708, 'Bolt, Crossbow', 0.1),
        (710, 'Bolt, Greater Hushing', 1047),
        (711, 'Bolt, Hushing', 547),
        (714, 'Bolt, Repeating Crossbow', 0.2),
        (917, 'Bullet, Sling', 0.01),
        (2890, 'Holy Symbol, Silver', 25),
        (2892, 'Holy Symbol, Wooden', 1),
        (4266, 'Pack Animal, Mule', 8),
        (5332, 'Rythius, The Kyton Scourge', 53000),
        (6209, 'Shield, Tower', 30)
      ) AS v(id, name, value)
     WHERE i.id = v.id
       AND i.name = v.name
       AND i.campaign_id IS NULL
       AND i.value IS NULL;
    GET DIAGNOSTICS n_valued = ROW_COUNT;

    RAISE NOTICE 'Migration 082: merged % of 40 placeholder items (% loot rows and % item searches repointed, % rows deleted); priced % of 10',
        n_pairs, n_loot, n_search, n_deleted, n_valued;
END
$$;

COMMIT;
