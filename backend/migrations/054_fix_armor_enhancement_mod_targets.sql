-- Migration 054: repair mislabeled +4 / +5 armor enhancement mods (prod drift)
--
-- The mod catalog seeds one armor and one weapon "+N" Power enhancement per
-- bonus level (database/mod_data.sql):
--   533 '+4' armor   534 '+4' weapon
--   545 '+5' armor   546 '+5' weapon
-- The seed file is correct, but production drifted: the +4 and +5 armor rows
-- carry target='weapon' instead of 'armor'. The effect is that "+4" and "+5"
-- each appear twice in the weapon mod list and never in the armor list, so a
-- DM can't apply a +4 or +5 enhancement to armor.
--
-- The fix is symptom-driven rather than keyed on hard-coded ids: for each of
-- +4 / +5, when the armor enhancement is MISSING and two weapon-labeled rows
-- exist (the exact drift signature), flip the lowest-id weapon row back to
-- 'armor' (the seed's armor row has the lower id). This is:
--   - idempotent and a no-op on fresh installs, where the armor row already
--     exists so the guard is false;
--   - safe against id drift, since it matches on (name, plus, type), not id;
--   - incapable of creating a duplicate armor row, since it only acts when no
--     armor row is present and flips exactly one weapon row.

DO $$
DECLARE
    bonus RECORD;
    fixed_count integer := 0;
BEGIN
    FOR bonus IN
        SELECT * FROM (VALUES ('+4', 4), ('+5', 5)) AS b(name, plus)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.mod
             WHERE name = bonus.name AND plus = bonus.plus
               AND type = 'Power' AND target = 'armor'
        ) AND (
            SELECT COUNT(*) FROM public.mod
             WHERE name = bonus.name AND plus = bonus.plus
               AND type = 'Power' AND target = 'weapon'
        ) >= 2 THEN
            UPDATE public.mod
               SET target = 'armor'
             WHERE id = (
                 SELECT MIN(id) FROM public.mod
                  WHERE name = bonus.name AND plus = bonus.plus
                    AND type = 'Power' AND target = 'weapon'
             );
            fixed_count := fixed_count + 1;
            RAISE NOTICE 'Migration 054: restored % armor enhancement mod', bonus.name;
        END IF;
    END LOOP;

    RAISE NOTICE 'Migration 054: corrected % mislabeled armor enhancement mod row(s)', fixed_count;
END $$;
