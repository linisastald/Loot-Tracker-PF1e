-- Add remaining ship sheet fields to complete Pathfinder ship implementation
-- This migration adds weapons, officers, improvements, and pirate campaign fields

-- Add pirate campaign specific fields
ALTER TABLE ships ADD COLUMN plunder INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN infamy INTEGER DEFAULT 0;
ALTER TABLE ships ADD COLUMN disrepute INTEGER DEFAULT 0;

-- Add movement and physical details
ALTER TABLE ships ADD COLUMN sails_oars VARCHAR(100);
ALTER TABLE ships ADD COLUMN sailing_check_bonus INTEGER DEFAULT 0;

-- Add JSON fields for complex data structures
ALTER TABLE ships ADD COLUMN weapons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ships ADD COLUMN officers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ships ADD COLUMN improvements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ships ADD COLUMN cargo_manifest JSONB DEFAULT '{"items": [], "passengers": [], "impositions": []}'::jsonb;

-- Add additional ship details
ALTER TABLE ships ADD COLUMN ship_notes TEXT;
ALTER TABLE ships ADD COLUMN captain_name VARCHAR(255);
ALTER TABLE ships ADD COLUMN flag_description TEXT;

-- Add constraints for campaign fields
ALTER TABLE ships ADD CONSTRAINT ships_campaign_stats_check 
    CHECK (plunder >= 0 AND infamy >= 0 AND disrepute >= 0);

-- Add indexes for performance on JSON fields
CREATE INDEX idx_ships_weapons ON ships USING GIN (weapons);
CREATE INDEX idx_ships_officers ON ships USING GIN (officers);
CREATE INDEX idx_ships_improvements ON ships USING GIN (improvements);
CREATE INDEX idx_ships_cargo ON ships USING GIN (cargo_manifest);

-- Add comments for the new fields
COMMENT ON COLUMN ships.plunder IS 'Current plunder points for pirate campaigns';
COMMENT ON COLUMN ships.infamy IS 'Current infamy score for pirate campaigns';
COMMENT ON COLUMN ships.disrepute IS 'Current disrepute score for pirate campaigns';
COMMENT ON COLUMN ships.sails_oars IS 'Description of sails and oars configuration';
COMMENT ON COLUMN ships.sailing_check_bonus IS 'Bonus to sailing checks from modifications';
COMMENT ON COLUMN ships.weapons IS 'Array of ship weapons with full statistics';
COMMENT ON COLUMN ships.officers IS 'Array of ship officers with positions';
COMMENT ON COLUMN ships.improvements IS 'Array of ship improvements and modifications';
COMMENT ON COLUMN ships.cargo_manifest IS 'Detailed cargo, passengers, and impositions tracking';
COMMENT ON COLUMN ships.ship_notes IS 'General notes about the ship';
COMMENT ON COLUMN ships.captain_name IS 'Name of the current captain';
COMMENT ON COLUMN ships.flag_description IS 'Description of the ship flag or colors';
