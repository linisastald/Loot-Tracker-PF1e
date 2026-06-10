-- Migration: Loot generator tuning settings
-- Description: Adds the two campaign-level knobs used by the loot generator.
-- The canonical treasure tables themselves live in code
-- (backend/src/services/lootGenerator/treasureTables.js); these settings only
-- tune which track is used and an overall low/high-fantasy multiplier.

-- Progression track for treasure amounts (slow | medium | fast).
INSERT INTO settings (name, value, value_type, description)
VALUES (
    'treasure_track',
    'medium',
    'string',
    'Treasure progression track used by the loot generator (slow, medium, or fast). Medium is the Pathfinder default.'
)
ON CONFLICT (name) DO NOTHING;

-- Overall treasure multiplier (e.g. 0.5 low-fantasy, 1 standard, 2 high-fantasy).
INSERT INTO settings (name, value, value_type, description)
VALUES (
    'treasure_modifier',
    '1',
    'string',
    'Overall multiplier applied to generated treasure amounts (0.5 = low fantasy, 1 = standard, 2 = high fantasy).'
)
ON CONFLICT (name) DO NOTHING;
