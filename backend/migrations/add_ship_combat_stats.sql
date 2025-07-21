-- Add combat stats to ships table
-- This migration adds proper combat statistics based on the Pathfinder ship sheet

-- Add new combat stat columns
ALTER TABLE ships ADD COLUMN base_ac INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN touch_ac INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN hardness INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN max_hp INTEGER DEFAULT 100;
ALTER TABLE ships ADD COLUMN current_hp INTEGER DEFAULT 100;
ALTER TABLE ships ADD COLUMN cmb INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN cmd INTEGER DEFAULT 10;
ALTER TABLE ships ADD COLUMN saves INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN initiative INTEGER DEFAULT 0;

-- Convert existing damage percentage to HP system
-- Assuming damage was a percentage (0-100), convert to current_hp
UPDATE ships 
SET current_hp = GREATEST(0, max_hp - ROUND((damage / 100.0) * max_hp))
WHERE damage IS NOT NULL AND damage > 0;

-- Create a backup of old damage values in case we need to revert
ALTER TABLE ships ADD COLUMN legacy_damage INTEGER;
UPDATE ships SET legacy_damage = damage;

-- We'll keep the damage column for now but it will be deprecated
-- TODO: Remove damage column in future migration once system is stable

-- Add constraints to ensure HP values are logical
ALTER TABLE ships ADD CONSTRAINT ships_hp_check 
    CHECK (current_hp >= 0 AND current_hp <= max_hp);

-- Add constraints for reasonable AC values  
ALTER TABLE ships ADD CONSTRAINT ships_ac_check 
    CHECK (base_ac >= 0 AND base_ac <= 50 AND touch_ac >= 0 AND touch_ac <= 50);

-- Add comment to track migration
COMMENT ON COLUMN ships.current_hp IS 'Current hit points of the ship';
COMMENT ON COLUMN ships.max_hp IS 'Maximum hit points of the ship'; 
COMMENT ON COLUMN ships.base_ac IS 'Base armor class (before pilot bonuses)';
COMMENT ON COLUMN ships.touch_ac IS 'Touch armor class';
COMMENT ON COLUMN ships.hardness IS 'Damage reduction from hardness';
COMMENT ON COLUMN ships.cmb IS 'Combat Maneuver Bonus';
COMMENT ON COLUMN ships.cmd IS 'Combat Maneuver Defense';
COMMENT ON COLUMN ships.saves IS 'Base save bonus';
COMMENT ON COLUMN ships.initiative IS 'Initiative modifier';
COMMENT ON COLUMN ships.legacy_damage IS 'Backup of old damage percentage system';
