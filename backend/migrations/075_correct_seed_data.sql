-- Migration: 075_correct_seed_data.sql
-- Description: Provable corrections to the global item, mod and spell catalogs (findings F-0897, F-0898, F-0907,
-- F-0908, F-0909, F-0924, F-0927). The same corrections are made in database/item_data.sql, mod_data.sql and
-- spells_data.sql for fresh installs, where this migration therefore updates 0 rows.
--
-- Every change is either an internal contradiction (an item whose name states a different value than its value
-- column, a truncated or misspelled name) or a fact stated in the official Paizo PRD:
--   item  value  : 2825 (name says 1,000 gp); 3750 and 3413 (Ultimate Equipment, Specific Magic Armor and Shields:
--                  Mithral heavy shield 1,020 gp, Living steel heavy shield 120 gp); 2328 (Advanced Class Guide,
--                  Full Plate of the Corpse 35,650 gp); 3271 and 7103 (Ultimate Equipment, Specific Magic Weapons:
--                  Lance of jousting 4,310 gp, Trident of Stability 9,815 gp)
--   mod   name   : 511 'ifying' -> 'Nullifying' (the +3 melee weapon ability), 367 'Ominuous' -> 'Ominous',
--                  155 'Dual- Balanced' -> 'Dual-Balanced', 247 and 190 capitalisation
--   mod   plus   : 501 armor Brawling +3 -> +1 (Ultimate Equipment, Armor Special Abilities)
--   spell item   : 4 spells above 3rd level lose the Potion flag (a potion holds a spell of 3rd level or lower, Core
--                  Rulebook, Magic Items: Potions and Oils)
--   spell type   : typo 'Arcande.Divine' and the token order of 6 rows normalised to 'Arcane.Divine' /
--                  'Arcane.Divine.Psychic'
--
-- Existing loot rows are NOT touched; they keep the value recorded when they were created. Nothing is deleted
-- and no row is merged: rows that may be referenced by loot are listed for the owner in the review notes instead.
--
-- Safety: a row is updated ONLY when its id AND name still match and its old value is still exactly the one
-- listed below; item and mod rows must also be global (campaign_id IS NULL). A row an admin already edited,
-- renamed or scoped to a campaign is left alone. Idempotent: after one run the old value no longer matches.
-- The corrections are generated from a single list (docs/aonprd-work/w02/fixes.js).

BEGIN;

DO $$
DECLARE
    n_item integer;
    n_mod_name integer;
    n_mod_plus integer;
    n_potion integer;
    n_type integer;
BEGIN
    WITH fixes (id, name, old_value, new_value) AS (
        VALUES
        (2825, 'Herbs, Oils, and Incense (worth 1,000 gp)', 2000, 1000),
        (3750, 'Mithral Heavy Shield', 20, 1020),
        (3413, 'Living Steel Heavy Shield', 20, 120),
        (2328, 'Full Plate of the Corpse', 1500, 35650),
        (3271, 'Lance of Jousting', 10, 4310),
        (7103, 'Trident of Stability', 15, 9815)
    )
    UPDATE item AS i
    SET value = f.new_value::numeric
    FROM fixes AS f
    WHERE i.id = f.id
      AND i.name = f.name
      AND i.campaign_id IS NULL
      AND i.value IS NOT DISTINCT FROM f.old_value::numeric;
    GET DIAGNOSTICS n_item = ROW_COUNT;

    WITH fixes (id, old_name, new_name) AS (
        VALUES
        (511, 'ifying', 'Nullifying'),
        (367, 'Ominuous', 'Ominous'),
        (155, 'Dual- Balanced', 'Dual-Balanced'),
        (247, 'locksmith', 'Locksmith'),
        (190, 'jousting', 'Jousting')
    )
    UPDATE mod AS m
    SET name = f.new_name
    FROM fixes AS f
    WHERE m.id = f.id
      AND m.name = f.old_name
      AND m.campaign_id IS NULL;
    GET DIAGNOSTICS n_mod_name = ROW_COUNT;

    WITH fixes (id, name, target, old_plus, new_plus) AS (
        VALUES
        (501, 'Brawling', 'armor', 3, 1)
    )
    UPDATE mod AS m
    SET plus = f.new_plus::integer
    FROM fixes AS f
    WHERE m.id = f.id
      AND m.name = f.name
      AND m.target = f.target
      AND m.campaign_id IS NULL
      AND m.plus IS NOT DISTINCT FROM f.old_plus::integer;
    GET DIAGNOSTICS n_mod_plus = ROW_COUNT;

    WITH fixes (id, name) AS (
        VALUES
        (5536, 'Ethereal Jaunt'),
        (2688, 'Nondetection (Communal)'),
        (5962, 'Wind Walk'),
        (9508, 'Interplanetary Teleport')
    )
    UPDATE spells AS s
    SET item = ARRAY[]::varchar[]
    FROM fixes AS f
    WHERE s.id = f.id
      AND s.name = f.name
      AND s.item::text = '{Potion}'
      AND s.spelllevel > 3;
    GET DIAGNOSTICS n_potion = ROW_COUNT;

    WITH fixes (id, name, old_type, new_type) AS (
        VALUES
        (1193, 'Accursed Glare', 'Arcande.Divine', 'Arcane.Divine'),
        (1314, 'Expeditious Construction', 'Divine.Arcane', 'Arcane.Divine'),
        (9494, 'Cloud of Seasickness', 'Divine.Arcane', 'Arcane.Divine'),
        (9504, 'Secret Speech', 'Divine.Arcane', 'Arcane.Divine'),
        (9503, 'Lover''s Vengeance', 'Divine.Arcane', 'Arcane.Divine'),
        (1324, 'Splinter Spell Resistance', 'Arcane.Psychic.Divine', 'Arcane.Divine.Psychic'),
        (1323, 'Linked Legacy', 'Arcane.Psychic.Divine', 'Arcane.Divine.Psychic')
    )
    UPDATE spells AS s
    SET type = f.new_type
    FROM fixes AS f
    WHERE s.id = f.id
      AND s.name = f.name
      AND s.type = f.old_type;
    GET DIAGNOSTICS n_type = ROW_COUNT;

    RAISE NOTICE 'Migration 075: item values % of 6, mod names % of 5, mod plus % of 1, spell potion flags % of 4, spell types % of 7 (rows already corrected or edited by an admin are skipped)',
        n_item, n_mod_name, n_mod_plus, n_potion, n_type;
END $$;

COMMIT;
