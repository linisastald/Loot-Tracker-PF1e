-- Add combat stats to ships table
-- This migration adds proper combat statistics based on the Pathfinder ship sheet
-- Updated to safely add columns only if they don't exist

-- Function to safely add columns
CREATE OR REPLACE FUNCTION add_column_if_not_exists(table_name text, column_name text, column_definition text)
RETURNS void AS $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', $1, $2, $3);
    END IF;
END;
$ LANGUAGE plpgsql;

-- Add ship type and additional fields
SELECT add_column_if_not_exists('ships', 'ship_type', 'VARCHAR(50)');
SELECT add_column_if_not_exists('ships', 'size', 'VARCHAR(20) DEFAULT ''Colossal''');
SELECT add_column_if_not_exists('ships', 'cost', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'max_speed', 'INTEGER DEFAULT 30');
SELECT add_column_if_not_exists('ships', 'acceleration', 'INTEGER DEFAULT 15');
SELECT add_column_if_not_exists('ships', 'propulsion', 'VARCHAR(100)');
SELECT add_column_if_not_exists('ships', 'min_crew', 'INTEGER DEFAULT 1');
SELECT add_column_if_not_exists('ships', 'max_crew', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'cargo_capacity', 'INTEGER DEFAULT 10000'); -- in pounds
SELECT add_column_if_not_exists('ships', 'max_passengers', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'decks', 'INTEGER DEFAULT 1');
SELECT add_column_if_not_exists('ships', 'weapons', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'ramming_damage', 'VARCHAR(20) DEFAULT ''1d8''');

-- Add new combat stat columns
SELECT add_column_if_not_exists('ships', 'base_ac', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'touch_ac', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'hardness', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'max_hp', 'INTEGER DEFAULT 100');
SELECT add_column_if_not_exists('ships', 'current_hp', 'INTEGER DEFAULT 100');
SELECT add_column_if_not_exists('ships', 'cmb', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'cmd', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'saves', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'initiative', 'INTEGER DEFAULT 0');

-- Convert existing damage percentage to HP system (only if current_hp exists and damage exists)
DO $
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'damage')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'current_hp') THEN
        UPDATE ships 
        SET current_hp = GREATEST(0, max_hp - ROUND((damage / 100.0) * max_hp))
        WHERE damage IS NOT NULL AND damage > 0;
    END IF;
END $;

-- Create a backup of old damage values in case we need to revert
SELECT add_column_if_not_exists('ships', 'legacy_damage', 'INTEGER');
DO $
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'damage')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'legacy_damage') THEN
        UPDATE ships SET legacy_damage = damage;
    END IF;
END $;

-- Add constraints to ensure HP values are logical (only if columns exist)
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ships_hp_check' AND table_name = 'ships'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ships' AND column_name IN ('current_hp', 'max_hp')
        GROUP BY table_name HAVING COUNT(*) = 2
    ) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_hp_check 
            CHECK (current_hp >= 0 AND current_hp <= max_hp);
    END IF;
END $;

-- Add constraints for reasonable AC values
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ships_ac_check' AND table_name = 'ships'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ships' AND column_name IN ('base_ac', 'touch_ac')
        GROUP BY table_name HAVING COUNT(*) = 2
    ) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_ac_check 
            CHECK (base_ac >= 0 AND base_ac <= 50 AND touch_ac >= 0 AND touch_ac <= 50);
    END IF;
END $;

-- Add constraints for crew and capacity
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ships_crew_check' AND table_name = 'ships'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ships' AND column_name IN ('min_crew', 'max_crew')
        GROUP BY table_name HAVING COUNT(*) = 2
    ) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_crew_check 
            CHECK (min_crew >= 0 AND max_crew >= min_crew);
    END IF;
END $;

DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ships_capacity_check' AND table_name = 'ships'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ships' AND column_name IN ('cargo_capacity', 'max_passengers')
        GROUP BY table_name HAVING COUNT(*) = 2
    ) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_capacity_check 
            CHECK (cargo_capacity >= 0 AND max_passengers >= 0);
    END IF;
END $;

-- Drop the helper function
DROP FUNCTION add_column_if_not_exists(text, text, text);
