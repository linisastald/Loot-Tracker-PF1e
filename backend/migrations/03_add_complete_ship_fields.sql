-- Add remaining ship sheet fields to complete Pathfinder ship implementation
-- This migration adds weapons, officers, improvements, and pirate campaign fields
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

-- Add pirate campaign specific fields
SELECT add_column_if_not_exists('ships', 'plunder', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'infamy', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'disrepute', 'INTEGER DEFAULT 0');

-- Add movement and physical details
SELECT add_column_if_not_exists('ships', 'sails_oars', 'VARCHAR(100)');
SELECT add_column_if_not_exists('ships', 'sailing_check_bonus', 'INTEGER DEFAULT 0');

-- Add JSON fields for complex data structures
SELECT add_column_if_not_exists('ships', 'weapons', 'JSONB DEFAULT ''[]''::jsonb');
SELECT add_column_if_not_exists('ships', 'officers', 'JSONB DEFAULT ''[]''::jsonb');
SELECT add_column_if_not_exists('ships', 'improvements', 'JSONB DEFAULT ''[]''::jsonb');
SELECT add_column_if_not_exists('ships', 'cargo_manifest', 'JSONB DEFAULT ''{"items": [], "passengers": [], "impositions": []}''::jsonb');

-- Add additional ship details
SELECT add_column_if_not_exists('ships', 'ship_notes', 'TEXT');
SELECT add_column_if_not_exists('ships', 'captain_name', 'VARCHAR(255)');
SELECT add_column_if_not_exists('ships', 'flag_description', 'TEXT');

-- Add constraints for campaign fields (only if columns exist)
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ships_campaign_stats_check' AND table_name = 'ships'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ships' AND column_name IN ('plunder', 'infamy', 'disrepute')
        GROUP BY table_name HAVING COUNT(*) = 3
    ) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_campaign_stats_check 
            CHECK (plunder >= 0 AND infamy >= 0 AND disrepute >= 0);
    END IF;
END $;

-- Add indexes for performance on JSON fields (only if columns exist)
DO $
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'weapons')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_weapons') THEN
        CREATE INDEX idx_ships_weapons ON ships USING GIN (weapons);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'officers')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_officers') THEN
        CREATE INDEX idx_ships_officers ON ships USING GIN (officers);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'improvements')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_improvements') THEN
        CREATE INDEX idx_ships_improvements ON ships USING GIN (improvements);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'cargo_manifest')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_cargo') THEN
        CREATE INDEX idx_ships_cargo ON ships USING GIN (cargo_manifest);
    END IF;
END $;

-- Drop the helper function
DROP FUNCTION add_column_if_not_exists(text, text, text);
