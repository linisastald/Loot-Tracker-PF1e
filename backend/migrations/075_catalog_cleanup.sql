-- Migration: 075_catalog_cleanup.sql
-- Description: Three owner-approved clean-ups of the global item, mod and spell catalogs (owner decisions of 2026-10-06).
-- The same changes are made in database/item_data.sql, mod_data.sql and spells_data.sql for fresh installs, where this
-- migration therefore changes 0 rows. Generated from one list (docs/aonprd-work/dec-b/dec_b_source.json), so it cannot
-- drift from the seed files; a Jest test (catalogCleanupMigration.test.js) checks that they agree.
--
-- 1. ITEMS: 105 named magic armour/shield/weapon rows and special-material rows were priced at their mundane base
--    item (or had no price). Each now carries the price (and caster level, where the PRD gives one and the row had none)
--    printed in the official PRD: Core Rulebook magic items, Ultimate Equipment (Specific Magic Armor and Shields,
--    Specific Magic Weapons, Adventuring Gear), Advanced Player's Guide, Advanced Class Guide. Only rows with an explicit
--    "Price N gp" line for that exact item are changed; the type column is never touched.
-- 2. MODS: 222 'Vitalguard' is an exact duplicate of 221 'Vital Guard' (every column except the spelling is equal).
--    Loot references are moved to 221 first: loot.modids and item_search.mod_ids are integer arrays, the app reads them
--    as sets (every lookup is "WHERE id = ANY(...)" and the UI prints one name per id), so a resulting double occurrence
--    of 221 is collapsed to one (first position kept). All campaigns are covered. Then 222 is deleted.
-- 3. SPELLS: 345 rows with no class list and no spell level (monster spell-like-ability variants), 5 PCGen '.MOD'
--    modification records that hold class data, 1 row whose only class entries were deity-restricted PCGen tokens
--    the PRD does not confirm, and 57 duplicate-name rows are removed; 16 class lists are edited (PCGen [PRE...]
--    suffixes removed from entries the PRD does not confirm, and PRD-confirmed class/level entries merged into the kept row
--    of a duplicate name). The source column is not touched. A spell row is deleted only when nothing references it: no
--    spellbook_spell.spell_id and no spellcasting_service.spell_id (any campaign); a non-duplicate row is also kept when a
--    saved spellbook or service record holds exactly its name and no castable spell of that name remains. Rows kept
--    for that reason are reported in the NOTICE.
--
-- RLS: loot, item_search, spellbook_spell and spellcasting_service have tenant policies keyed on app.current_campaign.
-- The runner connects as the table owner, but the statements must not depend on that, so the GUC is set to the
-- cross-campaign mode 'all' for this transaction only (as in 073). item, mod and spells have no row-level security.
--
-- Safety: every row is changed only when its id AND name AND the old value(s) still match; item and mod rows must be
-- global (campaign_id IS NULL). A row an admin edited, renamed or scoped to a campaign is skipped. Idempotent: after
-- one run no old value matches any more. One transaction. UNTESTED against a real database.
-- Roll-back preview (prints the NOTICE counts, then rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/075_catalog_cleanup.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    n_items integer;
    n_mod_pairs integer := 0;
    n_loot_rows integer := 0;
    n_search_rows integer := 0;
    n_mods_deleted integer := 0;
    n_class_edits integer;
    n_del_junk integer;
    n_del_mod integer;
    n_del_emptied integer;
    n_del_dup integer;
    step_rows integer;
    pair record;
    kept_spells text;
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    -- 1. Items --------------------------------------------------------------------------------------------------
    WITH fixes (id, name, old_value, new_value, old_cl, new_cl) AS (
        VALUES
        (246, 'Armor of Insults', 25, 16175, NULL, 7),
        (259, 'Arrow, Greater Hushing', NULL, 1047, NULL, 5),
        (260, 'Arrow, Greater Slaying', 0, 4057, NULL, 13),
        (261, 'Arrow, Hushing', NULL, 547, NULL, 5),
        (266, 'Arrow, Searing', 1516, 1516, NULL, 9),
        (267, 'Arrow, Sizzling', 1350, 1516, NULL, 9),
        (268, 'Arrow, Slaying', 0, 2282, NULL, 13),
        (269, 'Arrow, Sleep', 0, 132, NULL, 5),
        (302, 'Avalanche Shield', 15020, 19170, NULL, 12),
        (463, 'Beaststrike Club', 0, 7300, NULL, 6),
        (511, 'Belligerent Shield', 20020, 36170, NULL, 12),
        (626, 'Blade of Binding', 50, 12350, NULL, 3),
        (709, 'Bolt, Dust', NULL, 1730, NULL, 5),
        (715, 'Bolt, Screaming', 0, 267, NULL, 5),
        (718, 'Bolt, Tangle', 60, 226, NULL, 12),
        (731, 'Boneless Leather', 11010, 12160, NULL, 3),
        (863, 'Breastplate of Vanishing', 10200, 15200, NULL, 5),
        (900, 'Buccaneer''s Breastplate', 200, 23850, 9, 9),
        (909, 'Bullet, Alchemist''s', NULL, 330, NULL, 3),
        (910, 'Bullet, Dustburst', 0, 196, NULL, 5),
        (931, 'Burglar''s Buckler', 3505, 4655, NULL, 5),
        (1064, 'Caster''s Shield, Greater', 1003, 10153, NULL, NULL),
        (1082, 'Catskin Leather', 14010, 18910, NULL, 13),
        (1112, 'Celestial Shield', 13170, 13170, NULL, 7),
        (1239, 'Clawhand Shield', 150, 8158, NULL, 9),
        (1339, 'Collapsible Tower', 4020, 8170, NULL, 6),
        (1542, 'Daystar Half-Plate', 600, 81250, 15, 15),
        (1736, 'Dragonslayer''s Shield', 3020, 7170, NULL, 5),
        (1785, 'Duelist''s Comate', 20, 35320, NULL, 13),
        (1918, 'Elysian Shield', 52620, 52620, NULL, 13),
        (1938, 'Enchanted Eelskin', 6260, 11160, NULL, 5),
        (1958, 'Equestrian Plate', 6500, 10650, NULL, 9),
        (2254, 'Folding Plate', 1500, 12650, NULL, 10),
        (2269, 'Force Tower', 9030, 46030, NULL, 7),
        (2296, 'Forsaken Banded Mail', 250, 25400, NULL, 11),
        (2328, 'Full Plate of the Corpse', 35650, 35650, NULL, 5),
        (2396, 'Giant Hide (Cloud)', 15, 69165, 15, 15),
        (2397, 'Giant Hide (Fire)', 15, 54165, 15, 15),
        (2398, 'Giant Hide (Frost)', 15, 54165, 15, 15),
        (2399, 'Giant Hide (Hill)', 15, 46665, 15, 15),
        (2400, 'Giant Hide (Ogre)', 15, 39165, 15, 15),
        (2401, 'Giant Hide (Stone)', 15, 54165, 15, 15),
        (2402, 'Giant Hide (Storm)', 15, 76665, 15, 15),
        (2403, 'Giant Hide (Troll)', 15, 59165, 15, 15),
        (2426, 'Gloom Blade', 8810, 8810, NULL, 13),
        (2545, 'Greataxe, Swift Obsidian', NULL, 11320, NULL, 10),
        (2605, 'Guarding Blade', 10, 65310, NULL, 15),
        (2621, 'Guisarme, Dragoncatch', NULL, 13308, NULL, 8),
        (2649, 'Hamatula Hide', 40015, 44215, NULL, 9),
        (2652, 'Hammer, Dwarfbond', NULL, 25312, NULL, 7),
        (2657, 'Hammer, Ricochet', 1, 20301, NULL, 7),
        (2758, 'Headsman''s Blade', 50, 13850, NULL, 9),
        (2831, 'Hero''s Hauberk', 100, 16600, NULL, 13),
        (3082, 'Invincible Armor', 101500, 137650, NULL, 13),
        (3239, 'Kukri, Bloodletting', NULL, 6308, NULL, 5),
        (3271, 'Lance of Jousting', 4310, 4310, NULL, 5),
        (3500, 'Mace, Boulderhead', 3500, 6812, NULL, 9),
        (3505, 'Mace of Smiting', NULL, 75312, NULL, 11),
        (3514, 'Maelstrom Shield', 10020, 14170, NULL, 5),
        (3468, 'Luck Blade (0 wishes)', NULL, 22060, 17, 17),
        (3470, 'Luck Blade (2 wishes)', NULL, 102660, 17, 17),
        (3471, 'Luck Blade (3 wishes)', NULL, 142960, 17, 17),
        (3536, 'Mail of Malevolence', 30150, 61300, NULL, 10),
        (3646, 'Masterwork Cold Iron Longsword', NULL, 330, NULL, NULL),
        (3746, 'Mistmail', 1100, 2250, NULL, 3),
        (3808, 'Morlock Hide', 4010, 8910, NULL, 10),
        (3826, 'Murderer''s Blackcloth', 5, 12405, NULL, 9),
        (4246, 'Otyugh Hide', 1415, 2565, NULL, 5),
        (4759, 'Prismatic Plate', 151500, 160650, NULL, 13),
        (4816, 'Quick Block Buckler', 11005, 36155, NULL, 14),
        (4865, 'Rapier of Battlefield Movement', 20, 30320, NULL, 7),
        (4809, 'Quarterstaff (Hurricane)', NULL, 7840, NULL, 3),
        (5396, 'Scarab Breastplate', 23200, 32350, NULL, 8),
        (6086, 'Scythe, Void', NULL, 95318, NULL, 13),
        (6208, 'Shieldsplitter Lance', 10, 18310, NULL, 10),
        (6369, 'Sling, Frostbite', NULL, 9380, NULL, 6),
        (6441, 'Soothsayer''s Raiment', 9150, 10300, NULL, 5),
        (6493, 'Spell Ward Tower Shield', 9030, 25180, NULL, 15),
        (6525, 'Spirit Blade', 2, 48502, NULL, 10),
        (6659, 'Stalking Armor (Cold)', 25, 8575, NULL, 6),
        (6660, 'Stalking Armor (Desert)', 25, 8575, NULL, 6),
        (6661, 'Stalking Armor (Forest)', 25, 8575, NULL, 6),
        (6662, 'Stalking Armor (Jungle)', 25, 8575, NULL, 6),
        (6663, 'Stalking Armor (Mountain)', 25, 8575, NULL, 6),
        (6664, 'Stalking Armor (Plains)', 25, 8575, NULL, 6),
        (6665, 'Stalking Armor (Swamp)', 25, 8575, NULL, 6),
        (6666, 'Stalking Armor (Underground)', 25, 8575, NULL, 6),
        (6667, 'Stalking Armor (Urban)', 25, 8575, NULL, 6),
        (6668, 'Stalking Armor (Water)', 25, 8575, NULL, 6),
        (6678, 'Starknife, Sparkwake', 19024, 21324, NULL, 8),
        (6791, 'Swashbuckler''s Rapier', 20, 7320, NULL, 7),
        (6793, 'Swift Obsidian Greataxe', 11320, 11320, NULL, 10),
        (6901, 'Tempest Shield', 11020, 15170, NULL, 6),
        (6989, 'Tireless Tracking Hide', 15, 11165, NULL, 5),
        (7103, 'Trident of Stability', 9815, 9815, NULL, 3),
        (7106, 'Trident, Triton''s', NULL, 15065, NULL, 6),
        (7149, 'Undercutting Axe', 10, 23310, NULL, 9),
        (7267, 'Volcanic Shield', 10020, 14170, NULL, 5),
        (7643, 'Warden of The Woods', 19100, 29350, NULL, 11),
        (7783, 'Wyrmslayer''s Shield', 4020, 20170, NULL, 9),
        (7803, 'Zombie Skin Shield', 1009, 2159, NULL, 5),
        (3469, 'Luck Blade (1 wish)', NULL, 62360, 17, 17),
        (1086, 'Cauldron, Mithral', 2501, 1251, NULL, NULL),
        (4708, 'Pot (Mithral)', 2001, 1001, NULL, NULL),
        (6341, 'Skillet, Mithral', 2001, 1001, NULL, NULL)
    )
    UPDATE item AS i
       SET value = f.new_value::numeric,
           casterlevel = f.new_cl::integer
      FROM fixes AS f
     WHERE i.id = f.id
       AND i.name = f.name
       AND i.campaign_id IS NULL
       AND i.value IS NOT DISTINCT FROM f.old_value::numeric
       AND i.casterlevel IS NOT DISTINCT FROM f.old_cl::integer;
    GET DIAGNOSTICS n_items = ROW_COUNT;

    -- 2. Mods ---------------------------------------------------------------------------------------------------
    -- Replace every occurrence of dup by keep, then keep only the first occurrence of keep (set semantics).
    CREATE FUNCTION pg_temp.merge_mod_ref(arr integer[], dup integer, keep integer) RETURNS integer[]
    LANGUAGE sql IMMUTABLE AS $fn$
        SELECT array_agg(u.e ORDER BY u.ord)
          FROM unnest(array_replace(arr, dup, keep)) WITH ORDINALITY AS u(e, ord)
         WHERE u.e IS DISTINCT FROM keep
            OR u.ord = (SELECT min(v.ord)
                          FROM unnest(array_replace(arr, dup, keep)) WITH ORDINALITY AS v(e, ord)
                         WHERE v.e = keep)
    $fn$;

    FOR pair IN
        SELECT k.id AS keep_id, k.name AS keep_name, d.id AS dup_id, d.name AS dup_name
          FROM (VALUES
            (221, 'Vital Guard', 222, 'Vitalguard')
               ) AS p (keep_id, keep_name, dup_id, dup_name)
          JOIN mod k ON k.id = p.keep_id AND k.name = p.keep_name AND k.campaign_id IS NULL
          JOIN mod d ON d.id = p.dup_id AND d.name = p.dup_name AND d.campaign_id IS NULL
         WHERE d.plus IS NOT DISTINCT FROM k.plus
           AND d.type IS NOT DISTINCT FROM k.type
           AND d.valuecalc IS NOT DISTINCT FROM k.valuecalc
           AND d.target IS NOT DISTINCT FROM k.target
           AND d.subtarget IS NOT DISTINCT FROM k.subtarget
           AND d.casterlevel IS NOT DISTINCT FROM k.casterlevel
    LOOP
        UPDATE loot
           SET modids = pg_temp.merge_mod_ref(modids, pair.dup_id, pair.keep_id)
         WHERE modids @> ARRAY[pair.dup_id];
        GET DIAGNOSTICS step_rows = ROW_COUNT;
        n_loot_rows := n_loot_rows + step_rows;

        UPDATE item_search
           SET mod_ids = pg_temp.merge_mod_ref(mod_ids, pair.dup_id, pair.keep_id)
         WHERE mod_ids @> ARRAY[pair.dup_id];
        GET DIAGNOSTICS step_rows = ROW_COUNT;
        n_search_rows := n_search_rows + step_rows;

        DELETE FROM mod m
         WHERE m.id = pair.dup_id
           AND m.name = pair.dup_name
           AND m.campaign_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM loot l WHERE l.modids @> ARRAY[m.id])
           AND NOT EXISTS (SELECT 1 FROM item_search s WHERE s.mod_ids @> ARRAY[m.id]);
        GET DIAGNOSTICS step_rows = ROW_COUNT;
        n_mods_deleted := n_mods_deleted + step_rows;
        n_mod_pairs := n_mod_pairs + 1;
    END LOOP;
    DROP FUNCTION pg_temp.merge_mod_ref(integer[], integer, integer);

    -- 3. Spells -------------------------------------------------------------------------------------------------
    CREATE TEMP TABLE _spell_class_edits (id integer PRIMARY KEY, name text NOT NULL, old_class text NOT NULL, new_class text NOT NULL) ON COMMIT DROP;
    INSERT INTO _spell_class_edits (id, name, old_class, new_class) VALUES
        (99, 'Incessant Buzzing', '{Antipaladin,Bard,Psychic,Shaman,Sorcerer,Witch,Wizard=1|Cleric=1[PREDEITY:1,Calistria]}', '{Antipaladin,Bard,Psychic,Shaman,Sorcerer,Witch,Wizard=1}'),
        (98, 'Harvest Knowledge', '{Alchemist,Antipaladin,Bard,Inquisitor,Mesmerist,Psychic,Sorcerer,Witch,Wizard=4|Cleric,Ranger=4[PREDEITY:1,Calistria]}', '{Alchemist,Antipaladin,Bard,Inquisitor,Mesmerist,Psychic,Sorcerer,Witch,Wizard=4}'),
        (751, 'Temporal Regression', '{Psychic,Sorcerer,Witch,Wizard=8|druid=9|Cleric=8[PREDEITY:1,Shyka]}', '{Psychic,Sorcerer,Witch,Wizard=8|druid=9}'),
        (94, 'Betraying Sting', '{Cleric,Occultist,Psychic,Shaman,Witch=6|Bard=6[PREDEITY:1,Calistria]}', '{Cleric,Occultist,Psychic,Shaman,Witch=6}'),
        (103, 'Painful Revelation', '{Antipaladin,Bard,Mesmerist,Psychic,Sorcerer,Wizard=2|Cleric,Witch=2[PREDEITY:1,Calistria]}', '{Antipaladin,Bard,Mesmerist,Psychic,Sorcerer,Wizard=2}'),
        (104, 'Pillow Talk', '{Bard,Inquisitor,Mesmerist,Psychic,Sorcerer,Witch,Wizard=3|Antipaladin,Cleric=3[PREDEITY:1,Calistria]}', '{Bard,Inquisitor,Mesmerist,Psychic,Sorcerer,Witch,Wizard=3}'),
        (748, 'Threefold Face', '{Medium,Sorcerer,Witch,Wizard=3|Cleric=3[PREDEITY:1,Magdh]}', '{Medium,Sorcerer,Witch,Wizard=3}'),
        (750, 'Threefold Sight', '{Bard,Medium,Occultist,Psychic,Sorcerer,Witch,Wizard=3|Cleric=3[PREDEITY:1,Magdh]}', '{Bard,Medium,Occultist,Psychic,Sorcerer,Witch,Wizard=3}'),
        (106, 'Reveal Secrets', '{Bard,Inquisitor,Mesmerist,Psychic,Sorcerer,Witch,Wizard=1|Antipaladin,Cleric=1[PREDEITY:1,Calistria]}', '{Bard,Inquisitor,Mesmerist,Psychic,Sorcerer,Witch,Wizard=1}'),
        (746, 'Temporal Divergence', '{Psychic,Sorcerer,Witch,Wizard=7|Cleric=8[PREDEITY:1,Shyka]}', '{Psychic,Sorcerer,Witch,Wizard=7}'),
        (465, 'Sign of the Dawnflower', '{Cleric,Druid=0|Paladin,Ranger=1[PREDEITY:1,Sarenrae]}', '{Cleric,Druid=0}'),
        (60, 'Vermin Shape II', '{Druid,Witch=4|Sorcerer,Wizard=5}', '{Druid,Witch=4|Alchemist,Magus,Sorcerer,Wizard=5}'),
        (59, 'Vermin Shape I', '{Druid,Witch=3|Sorcerer,Wizard=4}', '{Druid,Witch=3|Alchemist,Magus,Sorcerer,Wizard=4}'),
        (400, 'Vision of Hell', '{Bard,Cleric,Sorcerer,Wizard=3}', '{Bard,Cleric,Sorcerer,Witch,Wizard=3}'),
        (1203, 'Enshroud Thoughts', '{Alchemist,Bard,Inquisitor,Witch=2|Ranger=3}', '{Alchemist,Bard,Inquisitor,Medium,Mesmerist,Psychic,Shaman,Witch=2|Ranger=3}'),
        (543, 'Shield of Wings', '{Cleric,Inquisitor,Paladin,Ranger=3[PREDEITY:1,Ragathiel]}', '{}');

    CREATE TEMP TABLE _spell_deletes (id integer PRIMARY KEY, name text NOT NULL, kind text NOT NULL, level integer, keeper_id integer, keeper_name text) ON COMMIT DROP;
    INSERT INTO _spell_deletes (id, name, kind, level, keeper_id, keeper_name) VALUES
        (63, 'Summon Mantis', 'junk', NULL, NULL, NULL),
        (64, 'Quickened Dispel Magic (Greater)', 'junk', NULL, NULL, NULL),
        (65, 'Summon Demons (Nascent Demon Lord)', 'junk', NULL, NULL, NULL),
        (66, 'Teleport (Greater/within Tanglebriar only)', 'junk', NULL, NULL, NULL),
        (67, 'Animal Growth (Reptiles Only)', 'junk', NULL, NULL, NULL),
        (68, 'Animal Shapes (Reptiles Only)', 'junk', NULL, NULL, NULL),
        (282, 'Geas/Quest (Asmodean)', 'junk', NULL, NULL, NULL),
        (283, 'Knock (Caydenite)', 'junk', NULL, NULL, NULL),
        (284, 'Sympathy (Shelynite)', 'junk', NULL, NULL, NULL),
        (285, 'Whispering Wind (Gozren)', 'junk', NULL, NULL, NULL),
        (290, 'Air Breathing (Personification of Fury)', 'junk', NULL, NULL, NULL),
        (291, 'Create Water (Ataxian)', 'junk', NULL, NULL, NULL),
        (292, 'Feather Fall (Pavbagha)', 'junk', NULL, NULL, NULL),
        (293, 'Heightened Charm Person', 'junk', NULL, NULL, NULL),
        (294, 'Instant Summons (First Blade)', 'junk', NULL, NULL, NULL),
        (295, 'Levitate (Self only)', 'junk', NULL, NULL, NULL),
        (296, 'Magic Jar (Ataxian)', 'junk', NULL, NULL, NULL),
        (297, 'Planar Ally (Thais)', 'junk', NULL, NULL, NULL),
        (298, 'Plane Shift (self and willing targets only)', 'junk', NULL, NULL, NULL),
        (299, 'Quickened Vomit Swarm', 'junk', NULL, NULL, NULL),
        (300, 'Speak With Animals (Zentragt)', 'junk', NULL, NULL, NULL),
        (301, 'Summon Monster I (Ahmuuth)', 'junk', NULL, NULL, NULL),
        (302, 'Summon Monster II (Personification of Fury)', 'junk', NULL, NULL, NULL),
        (303, 'Summon Monster IV (Yethazmari)', 'junk', NULL, NULL, NULL),
        (304, 'Summon Monster V (Basileus)', 'junk', NULL, NULL, NULL),
        (305, 'Summon Monster VI (The Stabbing Beast)', 'junk', NULL, NULL, NULL),
        (306, 'Summon Monster IX (Personification of Fury)', 'junk', NULL, NULL, NULL),
        (307, 'Vomit Swarm (Sarcovalt)', 'junk', NULL, NULL, NULL),
        (308, 'Arcane Mark (Profane Seal Signet)', 'junk', NULL, NULL, NULL),
        (309, 'Beast Shape I (Red Hound Ring)', 'junk', NULL, NULL, NULL),
        (310, 'Beast Shape II (Bear Pelt Of The Bonebreaker)', 'junk', NULL, NULL, NULL),
        (311, 'Beast Shape IV (Ring Of Seven Lovely Colors)', 'junk', NULL, NULL, NULL),
        (312, 'Magic Fang (Belt Of The Snake King)', 'junk', NULL, NULL, NULL),
        (313, 'Rage (Self only)', 'junk', NULL, NULL, NULL),
        (314, 'Summon Monster I (Broken Chain Of The Beast)', 'junk', NULL, NULL, NULL),
        (315, 'Summon Monster I (Red Hound Ring)', 'junk', NULL, NULL, NULL),
        (316, 'Summon Monster II (Demon Mother''s Mask)', 'junk', NULL, NULL, NULL),
        (318, 'Blood Scent (Achaekek)', 'junk', NULL, NULL, NULL),
        (319, 'Curse of Disgust (Besmaran)', 'junk', NULL, NULL, NULL),
        (320, 'Geas (Lesser/Besmaran)', 'junk', NULL, NULL, NULL),
        (359, 'Euphoric Cloud', 'junk', NULL, NULL, NULL),
        (360, 'Night Blindness', 'junk', NULL, NULL, NULL),
        (361, 'Pesh Addiction (Lesser)', 'junk', NULL, NULL, NULL),
        (362, 'Pesh Addiction', 'junk', NULL, NULL, NULL),
        (363, 'Pesh Vigor', 'junk', NULL, NULL, NULL),
        (364, 'Suffocation (Instant)', 'junk', NULL, NULL, NULL),
        (365, 'Suffocation (Slow)', 'junk', NULL, NULL, NULL),
        (382, 'Summon Demons (Nascent Demon Lord)', 'junk', NULL, NULL, NULL),
        (384, 'Portal Jump', 'junk', NULL, NULL, NULL),
        (385, 'Summon Monster VI (Demoniac)', 'junk', NULL, NULL, NULL),
        (386, 'Summon Monster VIII (Demoniac)', 'junk', NULL, NULL, NULL),
        (391, 'Summon Monster II (Vermlek)', 'junk', NULL, NULL, NULL),
        (392, 'Summon Monster III (Brimorak)', 'junk', NULL, NULL, NULL),
        (393, 'Summon Monster V (Seraptis)', 'junk', NULL, NULL, NULL),
        (394, 'Summon Monster VI (Vavakia)', 'junk', NULL, NULL, NULL),
        (439, 'Alter Self (male human only)', 'junk', NULL, NULL, NULL),
        (440, 'Alter Self (Small humanoid child only)', 'junk', NULL, NULL, NULL),
        (441, 'Displacement (Self only)', 'junk', NULL, NULL, NULL),
        (442, 'Quickened Empowered Chain Lightning', 'junk', NULL, NULL, NULL),
        (443, 'Summon Nature''s Ally III (Cervapral)', 'junk', NULL, NULL, NULL),
        (444, 'Summon Nature''s Ally IV (Bee-Man)', 'junk', NULL, NULL, NULL),
        (445, 'Summon Monster IX (Talmandor)', 'junk', NULL, NULL, NULL),
        (527, 'Summon Monster V (elementals only)', 'junk', NULL, NULL, NULL),
        (544, 'Make Whole, Greater', 'junk', NULL, NULL, NULL),
        (618, 'Ancestral Memory', 'junk', NULL, NULL, NULL),
        (650, 'Summon Monster I (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (651, 'Summon Monster II (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (652, 'Summon Monster III (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (653, 'Summon Monster IV (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (654, 'Summon Monster V (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (655, 'Summon Monster VI (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (656, 'Summon Monster VII (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (657, 'Summon Monster VIII (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (658, 'Summon Monster IX (Monster Tactician)', 'junk', NULL, NULL, NULL),
        (722, 'Poisoned Egg', 'junk', NULL, NULL, NULL),
        (725, 'Spell Trap I', 'junk', NULL, NULL, NULL),
        (726, 'Spell Trap II', 'junk', NULL, NULL, NULL),
        (727, 'Spell Trap III', 'junk', NULL, NULL, NULL),
        (728, 'Spell Trap IV', 'junk', NULL, NULL, NULL),
        (729, 'Spell Trap V', 'junk', NULL, NULL, NULL),
        (730, 'Spell Trap VI', 'junk', NULL, NULL, NULL),
        (807, 'Summon Nature''s Ally I', 'junk', NULL, NULL, NULL),
        (808, 'Summon Nature''s Ally II', 'junk', NULL, NULL, NULL),
        (809, 'Summon Nature''s Ally III', 'junk', NULL, NULL, NULL),
        (810, 'Summon Nature''s Ally IV', 'junk', NULL, NULL, NULL),
        (811, 'Summon Nature''s Ally V', 'junk', NULL, NULL, NULL),
        (812, 'Summon Nature''s Ally VI', 'junk', NULL, NULL, NULL),
        (813, 'Summon Nature''s Ally VII', 'junk', NULL, NULL, NULL),
        (814, 'Summon Nature''s Ally VIII', 'junk', NULL, NULL, NULL),
        (815, 'Summon Nature''s Ally IX', 'junk', NULL, NULL, NULL),
        (1097, 'Flame Blade (electrical variant)', 'junk', NULL, NULL, NULL),
        (1098, 'Paragon Surge (any race)', 'junk', NULL, NULL, NULL),
        (1422, 'Elemental Aura (Cold)', 'junk', NULL, NULL, NULL),
        (1574, 'Animal Growth (Reptiles Only)', 'junk', NULL, NULL, NULL),
        (1575, 'Animal Shapes (Reptiles Only)', 'junk', NULL, NULL, NULL),
        (1739, 'Restore Eidolon', 'junk', NULL, NULL, NULL),
        (1740, 'Restore Eidolon (Lesser)', 'junk', NULL, NULL, NULL),
        (1827, 'Major Creation (Metal Items Only)', 'junk', NULL, NULL, NULL),
        (1828, 'Minor Creation (Wood Items Only)', 'junk', NULL, NULL, NULL),
        (1829, 'Statue (Metal Statue Instead of Iron)', 'junk', NULL, NULL, NULL),
        (1830, 'Resist Energy (Cold Only)', 'junk', NULL, NULL, NULL),
        (1837, 'Animal Shapes (Aquatic Creatures Only)', 'junk', NULL, NULL, NULL),
        (1838, 'Animal Shapes (Amphibians Only)', 'junk', NULL, NULL, NULL),
        (1839, 'Animal Shapes (Apes and Monkeys Only)', 'junk', NULL, NULL, NULL),
        (1840, 'Animal Shapes (Birds Only)', 'junk', NULL, NULL, NULL),
        (1841, 'Animal Shapes (Canines Only)', 'junk', NULL, NULL, NULL),
        (1842, 'Animal Shapes (Reptiles and Snakes Only)', 'junk', NULL, NULL, NULL),
        (1843, 'Statue (looking like a stalagmite or stalactite)', 'junk', NULL, NULL, NULL),
        (1844, 'Summon Nature''s Ally V (Dire Ape or Girallon only)', 'junk', NULL, NULL, NULL),
        (1845, 'Transmute Rock to Mud (loose sand instead of mud)', 'junk', NULL, NULL, NULL),
        (1851, 'Plane Shift (Plane of Air Only)', 'junk', NULL, NULL, NULL),
        (1852, 'Plane Shift (Plane of Fire Only)', 'junk', NULL, NULL, NULL),
        (1853, 'Plane Shift (Plane of Water Only)', 'junk', NULL, NULL, NULL),
        (1854, 'Plane Shift (Plane of Earth Only)', 'junk', NULL, NULL, NULL),
        (2598, 'Medusa Mask Gaze', 'junk', NULL, NULL, NULL),
        (6006, 'Magic Vestment (Shield use)', 'junk', NULL, NULL, NULL),
        (6179, 'Dimensional Anchor.MOD', 'junk', NULL, NULL, NULL),
        (6185, 'Disintegrate.MOD', 'junk', NULL, NULL, NULL),
        (6194, 'Disrupt Undead.MOD', 'junk', NULL, NULL, NULL),
        (6213, 'Energy Drain.MOD', 'junk', NULL, NULL, NULL),
        (6214, 'Enervation.MOD', 'junk', NULL, NULL, NULL),
        (6432, 'Polar Ray.MOD', 'junk', NULL, NULL, NULL),
        (6462, 'Ray of Enfeeblement.MOD', 'junk', NULL, NULL, NULL),
        (6463, 'Ray of Exhaustion.MOD', 'junk', NULL, NULL, NULL),
        (6464, 'Ray of Frost.MOD', 'junk', NULL, NULL, NULL),
        (6495, 'Scorching Ray.MOD', 'junk', NULL, NULL, NULL),
        (6500, 'Searing Light.MOD', 'junk', NULL, NULL, NULL),
        (6655, 'Align Weapon (Chaos Only)', 'junk', NULL, NULL, NULL),
        (6656, 'Align Weapon (Evil Only)', 'junk', NULL, NULL, NULL),
        (6657, 'Align Weapon (Good Only)', 'junk', NULL, NULL, NULL),
        (6658, 'Align Weapon (Law Only)', 'junk', NULL, NULL, NULL),
        (6659, 'Beast Shape III (Animals Only)', 'junk', NULL, NULL, NULL),
        (6660, 'Blindness/Deafness (Blindness Only)', 'junk', NULL, NULL, NULL),
        (6661, 'Elemental Body IV (Air Only)', 'junk', NULL, NULL, NULL),
        (6662, 'Elemental Body IV (Earth Only)', 'junk', NULL, NULL, NULL),
        (6663, 'Elemental Body IV (Fire Only)', 'junk', NULL, NULL, NULL),
        (6664, 'Elemental Body IV (Water Only)', 'junk', NULL, NULL, NULL),
        (6665, 'Elemental Swarm (Air Spell Only)', 'junk', NULL, NULL, NULL),
        (6666, 'Elemental Swarm (Earth Spell Only)', 'junk', NULL, NULL, NULL),
        (6667, 'Elemental Swarm (Fire Spell Only)', 'junk', NULL, NULL, NULL),
        (6668, 'Elemental Swarm (Water Spell Only)', 'junk', NULL, NULL, NULL),
        (6669, 'Summon Nature''s Ally IV (Animals Only)', 'junk', NULL, NULL, NULL),
        (6670, 'Summon Nature''s Ally VIII (Animals Only)', 'junk', NULL, NULL, NULL),
        (6671, 'Summon Monster V (1d3 Shadows)', 'junk', NULL, NULL, NULL),
        (6672, 'Summon Monster IX (Chaos Spell Only)', 'junk', NULL, NULL, NULL),
        (6673, 'Summon Monster IX (Evil Spell Only)', 'junk', NULL, NULL, NULL),
        (6674, 'Summon Monster IX (Good Spell Only)', 'junk', NULL, NULL, NULL),
        (6675, 'Summon Monster IX (Law Spell Only)', 'junk', NULL, NULL, NULL),
        (6676, 'Burning Hands (Acid)', 'junk', NULL, NULL, NULL),
        (6677, 'Burning Hands (Cold)', 'junk', NULL, NULL, NULL),
        (6678, 'Burning Hands (Electricity)', 'junk', NULL, NULL, NULL),
        (6679, 'Planar Binding (Devils and Fiendish Creatures Only)', 'junk', NULL, NULL, NULL),
        (6680, 'Scorching Ray (Acid)', 'junk', NULL, NULL, NULL),
        (6681, 'Scorching Ray (Cold)', 'junk', NULL, NULL, NULL),
        (6682, 'Scorching Ray (Electricity)', 'junk', NULL, NULL, NULL),
        (6683, 'Summon Monster VIII (Elementals Only)', 'junk', NULL, NULL, NULL),
        (6701, 'Commune (six questions)', 'junk', NULL, NULL, NULL),
        (6702, 'Confusion (single target only)', 'junk', NULL, NULL, NULL),
        (6703, 'Create Wine', 'junk', NULL, NULL, NULL),
        (6704, 'Enlarge Person (self only)', 'junk', NULL, NULL, NULL),
        (6705, 'Ethereal Jaunt (self plus objects)', 'junk', NULL, NULL, NULL),
        (6706, 'Ethereal Jaunt ~ Cauchemar Nightmare', 'junk', NULL, NULL, NULL),
        (6707, 'Fear (single target)', 'junk', NULL, NULL, NULL),
        (6708, 'Invisibility (self only)', 'junk', NULL, NULL, NULL),
        (6709, 'Invisibility (Greater/self only)', 'junk', NULL, NULL, NULL),
        (6710, 'Plane Shift (willing targets only)', 'junk', NULL, NULL, NULL),
        (6711, 'Plane Shift (self only)', 'junk', NULL, NULL, NULL),
        (6712, 'Plane Shift ~ Nightmare', 'junk', NULL, NULL, NULL),
        (6713, 'Purify Food and Drink (liquids only)', 'junk', NULL, NULL, NULL),
        (6714, 'Pyroclastic Storm', 'junk', NULL, NULL, NULL),
        (6715, 'Quickened Fireball', 'junk', NULL, NULL, NULL),
        (6716, 'Quickened Invisibility (self only)', 'junk', NULL, NULL, NULL),
        (6717, 'Quickened Suggestion', 'junk', NULL, NULL, NULL),
        (6718, 'Quickened Telekinesis', 'junk', NULL, NULL, NULL),
        (6719, 'Quickened Wall of Fire', 'junk', NULL, NULL, NULL),
        (6720, 'Reduce Person (self only)', 'junk', NULL, NULL, NULL),
        (6721, 'Scorching Ray (2 rays only)', 'junk', NULL, NULL, NULL),
        (6722, 'Summon Monster I (Dretch)', 'junk', NULL, NULL, NULL),
        (6723, 'Summon Monster III (Babau)', 'junk', NULL, NULL, NULL),
        (6724, 'Summon Monster III (Shadow Demon)', 'junk', NULL, NULL, NULL),
        (6725, 'Summon Monster III (Succubus)', 'junk', NULL, NULL, NULL),
        (6726, 'Summon Monster III (Vrock)', 'junk', NULL, NULL, NULL),
        (6727, 'Summon Monster III (Bearded Devil)', 'junk', NULL, NULL, NULL),
        (6728, 'Summon Monster III (Erinyes)', 'junk', NULL, NULL, NULL),
        (6729, 'Summon Monster IV (Glabrezu)', 'junk', NULL, NULL, NULL),
        (6730, 'Summon Monster IV (Hezrou)', 'junk', NULL, NULL, NULL),
        (6731, 'Summon Monster IV (Nabasu)', 'junk', NULL, NULL, NULL),
        (6732, 'Summon Monster IV (Barbed Devil)', 'junk', NULL, NULL, NULL),
        (6733, 'Summon Monster IV (Bone Devil)', 'junk', NULL, NULL, NULL),
        (6734, 'Summon Monster IV (Ice Devil)', 'junk', NULL, NULL, NULL),
        (6735, 'Summon Monster V (Marilith)', 'junk', NULL, NULL, NULL),
        (6736, 'Summon Monster V (Nalfeshnee)', 'junk', NULL, NULL, NULL),
        (6737, 'Summon Monster VI (Horned Devil)', 'junk', NULL, NULL, NULL),
        (6738, 'Summon Monster IX (Pit Fiend)', 'junk', NULL, NULL, NULL),
        (6739, 'Summon Monster IX (Celestials Only)', 'junk', NULL, NULL, NULL),
        (6740, 'Summon Monster IX (Fiends Only)', 'junk', NULL, NULL, NULL),
        (6741, 'Summon Monster VIII (Balor)', 'junk', NULL, NULL, NULL),
        (6742, 'Teleport (Greater/Within its forest territory)', 'junk', NULL, NULL, NULL),
        (6743, 'Teleport (Greater/self plus objects)', 'junk', NULL, NULL, NULL),
        (6745, 'Wish (granted to a mortal humanoid only)', 'junk', NULL, NULL, NULL),
        (6746, 'Wood Shape (1 lb only)', 'junk', NULL, NULL, NULL),
        (6748, 'Blur (self only)', 'junk', NULL, NULL, NULL),
        (6749, 'Charm Monster (elementals only)', 'junk', NULL, NULL, NULL),
        (6750, 'Dimension Door (self only)', 'junk', NULL, NULL, NULL),
        (6751, 'Dimension Door (self plus objects)', 'junk', NULL, NULL, NULL),
        (6752, 'Dimension Door (self plus 5 lbs.)', 'junk', NULL, NULL, NULL),
        (6753, 'Elemental Body III (air/water)', 'junk', NULL, NULL, NULL),
        (6754, 'Empowered Chaos Hammer', 'junk', NULL, NULL, NULL),
        (6755, 'Empowered Magic Missile', 'junk', NULL, NULL, NULL),
        (6756, 'Empowered Order''s Wrath', 'junk', NULL, NULL, NULL),
        (6757, 'Fabricate (Leng Spider)', 'junk', NULL, NULL, NULL),
        (6758, 'Fabricate (1 cu ft)', 'junk', NULL, NULL, NULL),
        (6759, 'Fire Shield (warm)', 'junk', NULL, NULL, NULL),
        (6760, 'Magic Circle against Evil (self only)', 'junk', NULL, NULL, NULL),
        (6761, 'Major Image (visual and auditory only)', 'junk', NULL, NULL, NULL),
        (6762, 'Meld into Stone (self only)', 'junk', NULL, NULL, NULL),
        (6763, 'Plane Shift (self/shadow only)', 'junk', NULL, NULL, NULL),
        (6764, 'Plane Shift (self plus skiff)', 'junk', NULL, NULL, NULL),
        (6765, 'Quickened Confusion', 'junk', NULL, NULL, NULL),
        (6766, 'Quickened Cone of Cold', 'junk', NULL, NULL, NULL),
        (6767, 'Quickened Darkness', 'junk', NULL, NULL, NULL),
        (6768, 'Quickened Dimension Door', 'junk', NULL, NULL, NULL),
        (6769, 'Quickened Dimension Door (self only)', 'junk', NULL, NULL, NULL),
        (6770, 'Quickened Disintegrate', 'junk', NULL, NULL, NULL),
        (6771, 'Quickened Enervation', 'junk', NULL, NULL, NULL),
        (6772, 'Quickened Heal', 'junk', NULL, NULL, NULL),
        (6773, 'Quickened Lightning Bolt', 'junk', NULL, NULL, NULL),
        (6774, 'Quickened Magic Missile', 'junk', NULL, NULL, NULL),
        (6775, 'Quickened Summon Swarm', 'junk', NULL, NULL, NULL),
        (6776, 'Quickened Unholy Blight', 'junk', NULL, NULL, NULL),
        (6778, 'Shadow Walk (self only)', 'junk', NULL, NULL, NULL),
        (6779, 'Speak with Animals (fish only)', 'junk', NULL, NULL, NULL),
        (6780, 'Suggestion (Nereid)', 'junk', NULL, NULL, NULL),
        (6781, 'Summon Monster III (Hydrodaemon)', 'junk', NULL, NULL, NULL),
        (6782, 'Summon Monster III (Leukodaemon)', 'junk', NULL, NULL, NULL),
        (6783, 'Summon Monster III (Accuser Devil)', 'junk', NULL, NULL, NULL),
        (6784, 'Summon Monster IV (Derghodaemon)', 'junk', NULL, NULL, NULL),
        (6785, 'Summon Monster IV (Piscodaemon)', 'junk', NULL, NULL, NULL),
        (6786, 'Summon Monster IV (Thanadaemon)', 'junk', NULL, NULL, NULL),
        (6787, 'Summon Monster IV (Kalavakus)', 'junk', NULL, NULL, NULL),
        (6788, 'Summon Monster IV (Omox)', 'junk', NULL, NULL, NULL),
        (6789, 'Summon Monster IV (Witchfire)', 'junk', NULL, NULL, NULL),
        (6790, 'Summon Monster V (Purrodaemon)', 'junk', NULL, NULL, NULL),
        (6791, 'Summon Monster V (Shemhazian)', 'junk', NULL, NULL, NULL),
        (6792, 'Summon Monster V (Handmaiden Devil)', 'junk', NULL, NULL, NULL),
        (6793, 'Summon Monster V (Large water elemental)', 'junk', NULL, NULL, NULL),
        (6794, 'Summon Monster V (Xacarba)', 'junk', NULL, NULL, NULL),
        (6795, 'Summon Monster VI (Astradaemon)', 'junk', NULL, NULL, NULL),
        (6796, 'Summon Monster VI (Vrolikai)', 'junk', NULL, NULL, NULL),
        (6797, 'Summon Monster VI (Belier Devil)', 'junk', NULL, NULL, NULL),
        (6798, 'Summon Monster VI (Nereid)', 'junk', NULL, NULL, NULL),
        (6799, 'Summon Monster VI (Nightwing)', 'junk', NULL, NULL, NULL),
        (6800, 'Summon Monster VII (Nightwalker)', 'junk', NULL, NULL, NULL),
        (6801, 'Summon Monster VIII (water elementals)', 'junk', NULL, NULL, NULL),
        (6802, 'Summon Monster VIII (Nightcrawler)', 'junk', NULL, NULL, NULL),
        (6803, 'Summon Monster VIII (Scylla)', 'junk', NULL, NULL, NULL),
        (6804, 'Summon Monster IX (Immolation Devil)', 'junk', NULL, NULL, NULL),
        (6805, 'Summon Monster IX (Nightwave)', 'junk', NULL, NULL, NULL),
        (6806, 'Summon (Olethrodaemon)', 'junk', NULL, NULL, NULL),
        (6807, 'Summon Nature''s Ally II (Triton)', 'junk', NULL, NULL, NULL),
        (6808, 'Summon Nature''s Ally V (earth/fire elementals)', 'junk', NULL, NULL, NULL),
        (6809, 'Teleport (Greater/self plus entrapped)', 'junk', NULL, NULL, NULL),
        (6810, 'Teleport (Greater/self plus skiff)', 'junk', NULL, NULL, NULL),
        (6811, 'Tree Shape (Colossal tree)', 'junk', NULL, NULL, NULL),
        (6813, 'Animal Growth (Reptiles Only)', 'junk', NULL, NULL, NULL),
        (6814, 'Animal Shapes (Reptiles Only)', 'junk', NULL, NULL, NULL),
        (6817, 'Bestow Curse (30 ft. range)', 'junk', NULL, NULL, NULL),
        (6818, 'Charm Animal (snakes only)', 'junk', NULL, NULL, NULL),
        (6819, 'Charm Monster (vermin only)', 'junk', NULL, NULL, NULL),
        (6820, 'Control Weather (alter storms)', 'junk', NULL, NULL, NULL),
        (6821, 'Control Weather (windy or cold weather only)', 'junk', NULL, NULL, NULL),
        (6822, 'Control Weather (rain only)', 'junk', NULL, NULL, NULL),
        (6823, 'Dimension Door (within sacred site)', 'junk', NULL, NULL, NULL),
        (6824, 'Dominate Monster (vermin only)', 'junk', NULL, NULL, NULL),
        (6825, 'Empowered Cone of Cold', 'junk', NULL, NULL, NULL),
        (6826, 'Extended Animate Objects (Warsworn)', 'junk', NULL, NULL, NULL),
        (6827, 'Fly (self only)', 'junk', NULL, NULL, NULL),
        (6828, 'Haste (self only)', 'junk', NULL, NULL, NULL),
        (6829, 'Hedge Stride', 'junk', NULL, NULL, NULL),
        (6830, 'Hold Monster (vermin only)', 'junk', NULL, NULL, NULL),
        (6831, 'Magic Jar (other formians only)', 'junk', NULL, NULL, NULL),
        (6832, 'Miracle (Divine Realm)', 'junk', NULL, NULL, NULL),
        (6833, 'Plane Shift (Nightmare Lord)', 'junk', NULL, NULL, NULL),
        (6834, 'Plane Shift (Ostiarius)', 'junk', NULL, NULL, NULL),
        (6835, 'Plane Shift (Owb)', 'junk', NULL, NULL, NULL),
        (6836, 'Polymorph (self only/same size)', 'junk', NULL, NULL, NULL),
        (6837, 'Purify Food and Drink (water only)', 'junk', NULL, NULL, NULL),
        (6838, 'Quickened Charm Person', 'junk', NULL, NULL, NULL),
        (6839, 'Quickened Cure Serious Wounds', 'junk', NULL, NULL, NULL),
        (6840, 'Quickened Dispel Magic (Greater)', 'junk', NULL, NULL, NULL),
        (6841, 'Quickened Dominate Person', 'junk', NULL, NULL, NULL),
        (6842, 'Quickened Feeblemind', 'junk', NULL, NULL, NULL),
        (6843, 'Quickened Lightning Bolt', 'junk', NULL, NULL, NULL),
        (6844, 'Quickened Mirror Image', 'junk', NULL, NULL, NULL),
        (6845, 'Quickened True Strike', 'junk', NULL, NULL, NULL),
        (6846, 'Sending (dryads only)', 'junk', NULL, NULL, NULL),
        (6847, 'Sending (to the hive queen only)', 'junk', NULL, NULL, NULL),
        (6848, 'Share Memory (Jinmenju)', 'junk', NULL, NULL, NULL),
        (6849, 'Silence (self only)', 'junk', NULL, NULL, NULL),
        (6850, 'Speak with Animals (aquatic only)', 'junk', NULL, NULL, NULL),
        (6851, 'Speak with Animals (snakes only)', 'junk', NULL, NULL, NULL),
        (6852, 'Speak with Animals (winged animals only)', 'junk', NULL, NULL, NULL),
        (6853, 'Spider Climb (self only)', 'junk', NULL, NULL, NULL),
        (6854, 'Summon Monster II (Devilbound)', 'junk', NULL, NULL, NULL),
        (6855, 'Summon Monster III (Magaav)', 'junk', NULL, NULL, NULL),
        (6856, 'Summon Monster IV (Sarglagon)', 'junk', NULL, NULL, NULL),
        (6857, 'Summon Monster V (Devilbound)', 'junk', NULL, NULL, NULL),
        (6858, 'Summon Monster VI (Devilbound)', 'junk', NULL, NULL, NULL),
        (6859, 'Summon Monster VII (Advodaza)', 'junk', NULL, NULL, NULL),
        (6860, 'Summon Monster VII (Devilbound)', 'junk', NULL, NULL, NULL),
        (6861, 'Summon Monster VII (Morrigna)', 'junk', NULL, NULL, NULL),
        (6862, 'Summon Monster VIII (Devilbound)', 'junk', NULL, NULL, NULL),
        (6863, 'Summon Monster IX (Cthulhu)', 'junk', NULL, NULL, NULL),
        (6864, 'Summon Monster IX (Devilbound)', 'junk', NULL, NULL, NULL),
        (6865, 'Summon Monster IX (Yamaraj)', 'junk', NULL, NULL, NULL),
        (6866, 'Summon Nature''s Ally V (Oceanid)', 'junk', NULL, NULL, NULL),
        (6867, 'Summon Nature''s Ally VI (Erlking)', 'junk', NULL, NULL, NULL),
        (6868, 'Summon Nature''s Ally VII (swimming creatures only)', 'junk', NULL, NULL, NULL),
        (6869, 'Summon Swarm (locusts only)', 'junk', NULL, NULL, NULL),
        (6870, 'Summon Swarm (rat swarm only)', 'junk', NULL, NULL, NULL),
        (6871, 'Telekinesis (Warsworn)', 'junk', NULL, NULL, NULL),
        (6872, 'Wood Shape (10 lbs. only)', 'junk', NULL, NULL, NULL),
        (6930, 'Summon Swarm (rat swarm only)', 'junk', NULL, NULL, NULL),
        (6982, 'Continual Flame (Lantern Bearer)', 'junk', NULL, NULL, NULL),
        (6984, 'Summon Mantis', 'junk', NULL, NULL, NULL),
        (7523, 'Summon Monster I', 'junk', NULL, NULL, NULL),
        (7524, 'Summon Monster II', 'junk', NULL, NULL, NULL),
        (7525, 'Summon Monster III', 'junk', NULL, NULL, NULL),
        (7526, 'Summon Monster IV', 'junk', NULL, NULL, NULL),
        (7527, 'Summon Monster V', 'junk', NULL, NULL, NULL),
        (7528, 'Summon Monster VI', 'junk', NULL, NULL, NULL),
        (7529, 'Summon Monster VII', 'junk', NULL, NULL, NULL),
        (7530, 'Summon Monster VIII', 'junk', NULL, NULL, NULL),
        (7531, 'Summon Monster IX', 'junk', NULL, NULL, NULL),
        (9481, 'Summon Nature''s Ally I', 'junk', NULL, NULL, NULL),
        (9482, 'Summon Nature''s Ally II', 'junk', NULL, NULL, NULL),
        (9483, 'Summon Nature''s Ally III', 'junk', NULL, NULL, NULL),
        (9484, 'Summon Nature''s Ally IV', 'junk', NULL, NULL, NULL),
        (9485, 'Summon Nature''s Ally V', 'junk', NULL, NULL, NULL),
        (9486, 'Summon Nature''s Ally VI', 'junk', NULL, NULL, NULL),
        (9487, 'Summon Nature''s Ally VII', 'junk', NULL, NULL, NULL),
        (9488, 'Summon Nature''s Ally VIII', 'junk', NULL, NULL, NULL),
        (9489, 'Summon Nature''s Ally IX', 'junk', NULL, NULL, NULL),
        (9491, 'Summon Monster V (fire elementals only)', 'junk', NULL, NULL, NULL),
        (9525, 'Speak with Animals (birds only)', 'junk', NULL, NULL, NULL),
        (770, 'Apsu''s Shining Scales.MOD', 'mod', NULL, NULL, NULL),
        (1351, 'Aroden''s Spellsword (Cleric/Warpriest).MOD', 'mod', 3, NULL, NULL),
        (1352, 'Banishing Blade (Cleric).MOD', 'mod', 5, NULL, NULL),
        (1353, 'Aroden''s Magic Army (Cleric).MOD', 'mod', 8, NULL, NULL),
        (7067, 'Damnation Stride.MOD', 'mod', NULL, NULL, NULL),
        (543, 'Shield of Wings', 'emptied', NULL, NULL, NULL),
        (54, 'Interplanetary Teleport', 'dup', 9, 1687, 'Interplanetary Teleport'),
        (57, 'Teleport Trap', 'dup', 7, 22, 'Teleport Trap'),
        (122, 'Elemental Mastery', 'dup', 4, 121, 'Elemental Mastery'),
        (123, 'Elemental Mastery', 'dup', 4, 121, 'Elemental Mastery'),
        (124, 'Elemental Mastery', 'dup', 4, 121, 'Elemental Mastery'),
        (125, 'Elemental Mastery', 'dup', 4, 121, 'Elemental Mastery'),
        (389, 'Vermin Shape I', 'dup', 3, 59, 'Vermin Shape I'),
        (390, 'Vermin Shape II', 'dup', 4, 60, 'Vermin Shape II'),
        (783, 'Defoliate', 'dup', 1, 479, 'Defoliate'),
        (868, 'Harrowing', 'dup', 3, 51, 'Harrowing'),
        (1156, 'Dirge of the Victorious Knights', 'dup', 6, 49, 'Dirge of the Victorious Knights'),
        (1289, 'Imbue with Addiction', 'dup', 2, 735, 'Imbue with Addiction'),
        (1295, 'Secret Coffer', 'dup', 3, 827, 'Secret Coffer'),
        (1467, 'Bleed for Your Master', 'dup', 2, 1363, 'Bleed for Your Master'),
        (1468, 'Callback', 'dup', 2, 889, 'Callback'),
        (1469, 'Callback (Greater)', 'dup', 5, 890, 'Callback (Greater)'),
        (1474, 'Explosion of Rot', 'dup', 4, 1184, 'Explosion of Rot'),
        (1482, 'Greensight', 'dup', 2, 27, 'Greensight'),
        (1486, 'Merge with Familiar', 'dup', 2, 894, 'Merge with Familiar'),
        (1491, 'Pouncing Fury', 'dup', 2, 1218, 'Pouncing Fury'),
        (1494, 'Scamper', 'dup', 2, 1367, 'Scamper'),
        (1496, 'Sea Stallion', 'dup', 4, 1368, 'Sea Stallion'),
        (1497, 'Sea Steed', 'dup', 2, 1369, 'Sea Steed'),
        (1501, 'Sky Steed', 'dup', 3, 1372, 'Sky Steed'),
        (1502, 'Snowball', 'dup', 1, 540, 'Snowball'),
        (1510, 'Vine Strike', 'dup', 2, 691, 'Vine Strike'),
        (1586, 'Agonize', 'dup', 3, 396, 'Agonize'),
        (1645, 'Disfiguring Touch', 'dup', 2, 387, 'Disfiguring Touch'),
        (1796, 'Vermin Shape I', 'dup', 3, 59, 'Vermin Shape I'),
        (1797, 'Vermin Shape II', 'dup', 4, 60, 'Vermin Shape II'),
        (1800, 'Vision of Hell', 'dup', 3, 400, 'Vision of Hell'),
        (2401, 'Aura of the Unremarkable', 'dup', 2, 1154, 'Aura of the Unremarkable'),
        (2406, 'Codespeak', 'dup', 2, 1280, 'Codespeak'),
        (2429, 'Detect the Faithful', 'dup', 1, 460, 'Detect the Faithful'),
        (2953, 'Enshroud Thoughts', 'dup', 2, 1203, 'Enshroud Thoughts'),
        (5232, 'Green Caress', 'dup', 4, 1514, 'Green Caress'),
        (5266, 'Verminous Transformation', 'dup', 6, 1515, 'Verminous Transformation'),
        (6944, 'Brightest Light', 'dup', 4, 192, 'Brightest Light'),
        (6951, 'Detect Charm', 'dup', 1, 1384, 'Detect Charm'),
        (6953, 'Dirge of the Victorious Knights', 'dup', 6, 49, 'Dirge of the Victorious Knights'),
        (6954, 'Frost Mammoth', 'dup', 6, 539, 'Frost Mammoth'),
        (6960, 'Mark of Blood', 'dup', 2, 330, 'Mark of Blood'),
        (6961, 'Mask from Divination', 'dup', 4, 1330, 'Mask from Divination'),
        (6964, 'Planar Inquiry', 'dup', 3, 1331, 'Planar Inquiry'),
        (6973, 'Summon Flight of Eagles', 'dup', 4, 1387, 'Summon Flight of Eagles'),
        (6977, 'Suppress Charms and Compulsions', 'dup', 2, 1386, 'Suppress Charms and Compulsions'),
        (7003, 'Ghost Wolf', 'dup', 4, 593, 'Ghost Wolf'),
        (7044, 'Enemy''s Heart', 'dup', 2, 592, 'Enemy''s Heart'),
        (9498, 'Codespeak', 'dup', 2, 1280, 'Codespeak'),
        (9499, 'Hidden Knowledge', 'dup', 2, 6956, 'Hidden Knowledge'),
        (9503, 'Lover''s Vengeance', 'dup', 3, 55, 'Lover''s Vengeance'),
        (9506, 'Recorporeal Incarnation', 'dup', 7, 204, 'Recorporeal Incarnation'),
        (9508, 'Interplanetary Teleport', 'dup', 9, 1687, 'Interplanetary Teleport'),
        (9521, 'Flurry of Snowballs', 'dup', 2, 538, 'Flurry of Snowballs'),
        (9524, 'Snowball', 'dup', 1, 540, 'Snowball'),
        (9548, 'Infernal Healing', 'dup', 1, 52, 'Infernal Healing'),
        (9549, 'Infernal Healing (Greater)', 'dup', 4, 53, 'Infernal Healing (Greater)');

    -- 3a. class lists first, so a kept row is final before its duplicates go
    UPDATE spells AS s
       SET class = e.new_class::varchar[]
      FROM _spell_class_edits AS e
     WHERE s.id = e.id
       AND s.name = e.name
       AND s.class = e.old_class::varchar[];
    GET DIAGNOSTICS n_class_edits = ROW_COUNT;

    -- 3b. no-class/no-level rows, .MOD rows and the emptied row: by id and, unless a castable spell of the same
    --     name survives, also by exact name
    WITH del AS (
        DELETE FROM spells AS s
         USING _spell_deletes AS d
         WHERE s.id = d.id
           AND s.name = d.name
           AND d.kind IN ('junk', 'mod', 'emptied')
           AND s.spelllevel IS NOT DISTINCT FROM d.level
           AND (d.kind NOT IN ('junk', 'emptied') OR s.class = '{}'::varchar[])
           AND (d.kind <> 'mod' OR s.name ~* '\.MOD\s*$')
           AND NOT EXISTS (SELECT 1 FROM spellbook_spell b WHERE b.spell_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM spellcasting_service c WHERE c.spell_id = s.id)
           AND (NOT (EXISTS (SELECT 1 FROM spellbook_spell b WHERE lower(btrim(b.spell_name)) = lower(btrim(s.name)))
                     OR EXISTS (SELECT 1 FROM spellcasting_service c WHERE lower(btrim(c.spell_name)) = lower(btrim(s.name))))
                OR EXISTS (SELECT 1 FROM spells k
                            WHERE k.id <> s.id
                              AND lower(btrim(k.name)) = lower(btrim(s.name))
                              AND k.spelllevel IS NOT NULL
                              AND COALESCE(cardinality(k.class), 0) > 0
                              AND k.name !~* '\.MOD\s*$'))
        RETURNING d.kind
    )
    SELECT count(*) FILTER (WHERE kind = 'junk'),
           count(*) FILTER (WHERE kind = 'mod'),
           count(*) FILTER (WHERE kind = 'emptied')
      INTO n_del_junk, n_del_mod, n_del_emptied
      FROM del;

    -- 3c. duplicate names: only while the planned kept row (same id and name) still exists with a level and classes
    DELETE FROM spells AS s
     USING _spell_deletes AS d
     WHERE s.id = d.id
       AND s.name = d.name
       AND d.kind = 'dup'
       AND s.spelllevel IS NOT DISTINCT FROM d.level
       AND EXISTS (SELECT 1 FROM spells k
                    WHERE k.id = d.keeper_id AND k.name = d.keeper_name
                      AND k.spelllevel IS NOT NULL AND COALESCE(cardinality(k.class), 0) > 0)
       AND NOT EXISTS (SELECT 1 FROM spellbook_spell b WHERE b.spell_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM spellcasting_service c WHERE c.spell_id = s.id);
    GET DIAGNOSTICS n_del_dup = ROW_COUNT;

    -- planned rows that are still there because something references them
    SELECT string_agg(s.id || ' ' || s.name, '; ' ORDER BY s.id) INTO kept_spells
      FROM spells s
      JOIN _spell_deletes d ON d.id = s.id AND d.name = s.name
     WHERE EXISTS (SELECT 1 FROM spellbook_spell b WHERE b.spell_id = s.id)
        OR EXISTS (SELECT 1 FROM spellcasting_service c WHERE c.spell_id = s.id)
        OR (d.kind <> 'dup'
            AND (EXISTS (SELECT 1 FROM spellbook_spell b WHERE lower(btrim(b.spell_name)) = lower(btrim(s.name)))
                 OR EXISTS (SELECT 1 FROM spellcasting_service c WHERE lower(btrim(c.spell_name)) = lower(btrim(s.name)))));

    RAISE NOTICE 'Migration 075: items changed % of 105; mod duplicates merged % of 1 (loot rows rewritten %, item searches rewritten %, mod rows deleted %)',
        n_items, n_mod_pairs, n_loot_rows, n_search_rows, n_mods_deleted;
    RAISE NOTICE 'Migration 075: spell class lists edited % of 16; deleted: no class/level rows % of 345, .MOD rows % of 5, emptied rows % of 1, duplicate-name rows % of 57',
        n_class_edits, n_del_junk, n_del_mod, n_del_emptied, n_del_dup;
    IF kept_spells IS NOT NULL THEN
        RAISE NOTICE 'Migration 075: spell rows kept because a spellbook, a spellcasting record or a saved name references them: %', kept_spells;
    END IF;
END
$$;

COMMIT;
