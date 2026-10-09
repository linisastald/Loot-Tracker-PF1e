-- Migration: 077_consumable_price_followup.sql
-- Description: Follow-up to 065 (Opus review 2026-10-06, L-4). Ten catalog rows were skipped by 065 because their
-- costly material component is "variable", so they still carry the component cost alone or a wrong spell level.
-- Existing loot rows are NOT touched; they keep the value recorded when they were created.
--
-- Same rules as 065 (official Paizo PRD, Core Rulebook): scroll = spell level x caster level x 25 gp, wand (per
-- charge) = spell level x caster level x 15 gp, plus the material component cost (once per charge for a wand).
-- "Wizard/cleric first": cleric/druid/wizard caster level = 2 x spell level - 1. Where the component is open-ended
-- ("at least ...") the fixed minimum is used. Spell data: coreRulebook/spells/{restoration,planarAlly,hallow,
-- unhallow,forbiddance,animateDead}.html of the offline PRD.
--
--   Scroll of Restoration            cleric 4, diamond dust 100 gp:   4 x  7 x 25 + 100   =   800  (CL 7)
--   Wand of Restoration (per charge) cleric 4:                        4 x  7 x 15 + 100   =   520  (CL 7)
--   Scroll of Lesser Planar Ally     cleric 4, offerings 500 gp:      4 x  7 x 25 + 500   =  1200  (CL 7)
--   Wand of Lesser Planar Ally       cleric 4 (per charge):           4 x  7 x 15 + 500   =   920  (CL 7)
--   Scroll of Planar Ally            cleric 6, offerings 1,250 gp:    6 x 11 x 25 + 1250  =  2900  (CL 11)
--   Scroll of Greater Planar Ally    cleric 8, offerings 2,500 gp:    8 x 15 x 25 + 2500  =  5500  (CL 15)
--   Scroll of Hallow                 cleric 5, at least 1,000 gp:     5 x  9 x 25 + 1000  =  2125  (CL 9)
--   Scroll of Unhallow               cleric 5, at least 1,000 gp:     5 x  9 x 25 + 1000  =  2125  (CL 9)
--   Scroll of Forbiddance            cleric 6, at least 1,500 gp:     6 x 11 x 25 + 1500  =  3150  (CL 11)
--   Scroll of Animate Dead (Arcane)  sorcerer/wizard 4:               4 x  7 x 25         =   700  (CL 7)
--     (the onyx gem "at least 25 gp per Hit Die" depends on the undead created, so no component is added; the
--      row used the divine level 3 / CL 5 before, which an arcane scroll cannot use)
--
-- Safety (as in 065/073): a row is updated ONLY when its id AND name still match, it is a global row
-- (campaign_id IS NULL) and its value is still exactly the old value listed below. Idempotent. The same
-- corrections are made in database/item_data.sql for fresh installs, where this migration updates 0 rows.

BEGIN;

DO $$
DECLARE
    expected_rows CONSTANT integer := 10;
    updated_rows integer;
BEGIN
    WITH fixes (id, name, old_value, new_value, new_cl) AS (
        VALUES
        (5455, 'Scroll of Animate Dead (Arcane)', 375, 700, 7),
        (5655, 'Scroll of Forbiddance', 500, 3150, 11),
        (5693, 'Scroll of Greater Planar Ally', 2500, 5500, 15),
        (5708, 'Scroll of Hallow', 1000, 2125, 9),
        (5756, 'Scroll of Lesser Planar Ally', 500, 1200, 7),
        (5863, 'Scroll of Planar Ally', 1250, 2900, 11),
        (5925, 'Scroll of Restoration', 100, 800, 7),
        (6050, 'Scroll of Unhallow', 1000, 2125, 9),
        (7481, 'Wand of Lesser Planar Ally', 225, 920, 7),
        (7561, 'Wand of Restoration', 420, 520, 7)
    )
    UPDATE item AS i
    SET value = f.new_value::numeric,
        casterlevel = f.new_cl::integer
    FROM fixes AS f
    WHERE i.id = f.id
      AND i.name = f.name
      AND i.campaign_id IS NULL
      AND i.value IS NOT DISTINCT FROM f.old_value::numeric
      AND (i.value, i.casterlevel) IS DISTINCT FROM (f.new_value::numeric, f.new_cl::integer);

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RAISE NOTICE 'Migration 077: updated % of % expected catalog rows (rows already corrected or edited by an admin are skipped)', updated_rows, expected_rows;
END $$;

COMMIT;
