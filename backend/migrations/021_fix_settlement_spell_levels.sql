-- Migration: Fix settlement max spell levels to match official Pathfinder 1e rules
-- Source: Pathfinder 1e Core Rulebook / GameMastery Guide / d20pfsrd / Archives of Nethys
--
-- Official rules state:
-- - Village: No guaranteed spellcasters
-- - Small Town: 1st-level spells
-- - Large Town: 2nd-level spells
-- - Small City: 3rd or 4th-level spells
-- - Large City: 5th or 6th-level spells
-- - Metropolis: 7th or 8th-level guaranteed, 9th-level not guaranteed (special 1% logic)

-- Update max_spell_level for all settlements based on size
UPDATE city SET max_spell_level = 0 WHERE size = 'Village';
UPDATE city SET max_spell_level = 1 WHERE size = 'Small Town';
UPDATE city SET max_spell_level = 2 WHERE size = 'Large Town';
UPDATE city SET max_spell_level = 4 WHERE size = 'Small City';
UPDATE city SET max_spell_level = 6 WHERE size = 'Large City';
UPDATE city SET max_spell_level = 9 WHERE size = 'Metropolis';

-- Add comment documenting the change
COMMENT ON COLUMN city.max_spell_level IS 'Highest level of spellcasting services available. Village=0 (none), Small Town=1, Large Town=2, Small City=4, Large City=6, Metropolis=9 (9th level has 1% availability). Based on official Pathfinder 1e rules.';
