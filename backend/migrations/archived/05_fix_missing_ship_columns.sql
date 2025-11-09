-- Fix missing ship columns that should have been added by previous migrations
-- This migration ensures all expected ship columns exist
-- Run this migration to fix issues where previous migrations may not have applied correctly

-- Function to safely add columns
CREATE OR REPLACE FUNCTION add_column_if_not_exists(tbl_name text, col_name text, col_definition text)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = tbl_name AND column_name = col_name
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', tbl_name, col_name, col_definition);
        RAISE NOTICE 'Added column % to table %', col_name, tbl_name;
    ELSE
        RAISE NOTICE 'Column % already exists in table %', col_name, tbl_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add ship type and basic fields from migration 02
SELECT add_column_if_not_exists('ships', 'ship_type', 'VARCHAR(50)');
SELECT add_column_if_not_exists('ships', 'size', 'VARCHAR(20) DEFAULT ''Colossal''');
SELECT add_column_if_not_exists('ships', 'cost', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'max_speed', 'INTEGER DEFAULT 30');
SELECT add_column_if_not_exists('ships', 'acceleration', 'INTEGER DEFAULT 15');
SELECT add_column_if_not_exists('ships', 'propulsion', 'VARCHAR(100)');
SELECT add_column_if_not_exists('ships', 'min_crew', 'INTEGER DEFAULT 1');
SELECT add_column_if_not_exists('ships', 'max_crew', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'cargo_capacity', 'INTEGER DEFAULT 10000');
SELECT add_column_if_not_exists('ships', 'max_passengers', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'decks', 'INTEGER DEFAULT 1');
SELECT add_column_if_not_exists('ships', 'ramming_damage', 'VARCHAR(20) DEFAULT ''1d8''');

-- Add combat stat columns from migration 02
SELECT add_column_if_not_exists('ships', 'base_ac', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'touch_ac', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'hardness', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'max_hp', 'INTEGER DEFAULT 100');
SELECT add_column_if_not_exists('ships', 'current_hp', 'INTEGER DEFAULT 100');
SELECT add_column_if_not_exists('ships', 'cmb', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'cmd', 'INTEGER DEFAULT 10');
SELECT add_column_if_not_exists('ships', 'saves', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'initiative', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'legacy_damage', 'INTEGER');

-- Add pirate campaign fields from migration 03
SELECT add_column_if_not_exists('ships', 'plunder', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'infamy', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'disrepute', 'INTEGER DEFAULT 0');
SELECT add_column_if_not_exists('ships', 'sails_oars', 'VARCHAR(100)');
SELECT add_column_if_not_exists('ships', 'sailing_check_bonus', 'INTEGER DEFAULT 0');

-- Add JSON fields from migration 03
SELECT add_column_if_not_exists('ships', 'weapons', 'JSONB DEFAULT ''[]''::jsonb');
SELECT add_column_if_not_exists('ships', 'officers', 'JSONB DEFAULT ''[]''::jsonb');
SELECT add_column_if_not_exists('ships', 'improvements', 'JSONB DEFAULT ''[]''::jsonb');
SELECT add_column_if_not_exists('ships', 'cargo_manifest', 'JSONB DEFAULT ''{\"items\": [], \"passengers\": [], \"impositions\": []}''::jsonb');

-- Add additional ship details from migration 03
SELECT add_column_if_not_exists('ships', 'ship_notes', 'TEXT');
SELECT add_column_if_not_exists('ships', 'captain_name', 'VARCHAR(255)');
SELECT add_column_if_not_exists('ships', 'flag_description', 'TEXT');

-- Convert existing damage to HP system if needed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'damage')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'current_hp') THEN
        -- Only update if current_hp equals max_hp (indicating it hasn't been set from damage yet)
        UPDATE ships 
        SET current_hp = GREATEST(0, max_hp - ROUND((damage / 100.0) * max_hp)),
            legacy_damage = damage
        WHERE damage IS NOT NULL AND damage > 0 AND current_hp = max_hp;
        
        RAISE NOTICE 'Converted legacy damage values to HP system';
    END IF;
END $$;

-- Add constraints if they don't exist
DO $$
BEGIN
    -- Ships HP check constraint
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
        RAISE NOTICE 'Added ships_hp_check constraint';
    END IF;

    -- Ships AC check constraint
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
        RAISE NOTICE 'Added ships_ac_check constraint';
    END IF;

    -- Ships crew check constraint
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
        RAISE NOTICE 'Added ships_crew_check constraint';
    END IF;

    -- Ships capacity check constraint
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
        RAISE NOTICE 'Added ships_capacity_check constraint';
    END IF;

    -- Ships campaign stats check constraint
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
        RAISE NOTICE 'Added ships_campaign_stats_check constraint';
    END IF;
END $$;

-- Add indexes for JSON fields if they don't exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'weapons')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_weapons') THEN
        CREATE INDEX idx_ships_weapons ON ships USING GIN (weapons);
        RAISE NOTICE 'Added idx_ships_weapons index';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'officers')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_officers') THEN
        CREATE INDEX idx_ships_officers ON ships USING GIN (officers);
        RAISE NOTICE 'Added idx_ships_officers index';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'improvements')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_improvements') THEN
        CREATE INDEX idx_ships_improvements ON ships USING GIN (improvements);
        RAISE NOTICE 'Added idx_ships_improvements index';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'cargo_manifest')
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ships_cargo') THEN
        CREATE INDEX idx_ships_cargo ON ships USING GIN (cargo_manifest);
        RAISE NOTICE 'Added idx_ships_cargo index';
    END IF;
END $$;

-- Drop the helper function
DROP FUNCTION IF EXISTS add_column_if_not_exists(text, text, text);

-- Report completion
DO $$
BEGIN
    RAISE NOTICE 'Ship table migration completed successfully';
END $$;
