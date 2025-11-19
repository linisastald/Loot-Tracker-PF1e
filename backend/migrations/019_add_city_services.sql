-- Migration: Add City Services tables for item availability and spellcasting services
-- This implements Pathfinder 1e settlement mechanics for tracking item searches
-- and spellcasting service availability

-- City table to store settlement information
CREATE TABLE IF NOT EXISTS city (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    size VARCHAR(20) NOT NULL CHECK (size IN ('Village', 'Small Town', 'Large Town', 'Small City', 'Large City', 'Metropolis')),
    population INTEGER,
    region VARCHAR(255),
    alignment VARCHAR(20),
    base_value INTEGER NOT NULL, -- Base Value in gold pieces
    purchase_limit INTEGER NOT NULL, -- Purchase Limit in gold pieces
    max_spell_level INTEGER NOT NULL, -- Maximum spell level available for casting services
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Item search tracking table
CREATE TABLE IF NOT EXISTS item_search (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES item(id) ON DELETE CASCADE,
    mod_ids INTEGER[], -- Array of mod IDs for custom items
    city_id INTEGER NOT NULL REFERENCES city(id) ON DELETE CASCADE,
    golarion_date DATE, -- In-game date
    search_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
    found BOOLEAN NOT NULL,
    roll_result INTEGER, -- The d100 roll result
    availability_threshold INTEGER, -- What the roll needed to be at or under
    item_value NUMERIC, -- Calculated total value of item+mods
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Spellcasting service request tracking table
CREATE TABLE IF NOT EXISTS spellcasting_service (
    id SERIAL PRIMARY KEY,
    spell_id INTEGER NOT NULL, -- References spells table
    spell_name VARCHAR(255) NOT NULL, -- Denormalized for convenience
    spell_level INTEGER NOT NULL,
    caster_level INTEGER NOT NULL,
    city_id INTEGER NOT NULL REFERENCES city(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    cost NUMERIC NOT NULL, -- Calculated cost in gold pieces
    golarion_date DATE, -- In-game date service was purchased
    request_datetime TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_city_name ON city(name);
CREATE INDEX IF NOT EXISTS idx_city_size ON city(size);
CREATE INDEX IF NOT EXISTS idx_city_region ON city(region);

CREATE INDEX IF NOT EXISTS idx_item_search_city ON item_search(city_id);
CREATE INDEX IF NOT EXISTS idx_item_search_item ON item_search(item_id);
CREATE INDEX IF NOT EXISTS idx_item_search_character ON item_search(character_id);
CREATE INDEX IF NOT EXISTS idx_item_search_date ON item_search(golarion_date);
CREATE INDEX IF NOT EXISTS idx_item_search_found ON item_search(found);

CREATE INDEX IF NOT EXISTS idx_spellcasting_city ON spellcasting_service(city_id);
CREATE INDEX IF NOT EXISTS idx_spellcasting_character ON spellcasting_service(character_id);
CREATE INDEX IF NOT EXISTS idx_spellcasting_date ON spellcasting_service(golarion_date);

-- Comments
COMMENT ON TABLE city IS 'Settlement/city information for Pathfinder 1e campaigns';
COMMENT ON COLUMN city.base_value IS 'Base Value: Maximum value of commonly available items (75% availability)';
COMMENT ON COLUMN city.purchase_limit IS 'Purchase Limit: Maximum value a shop will pay for items from PCs';
COMMENT ON COLUMN city.max_spell_level IS 'Highest level of spellcasting services available';

COMMENT ON TABLE item_search IS 'Tracks player searches for items in cities with availability rolls';
COMMENT ON COLUMN item_search.mod_ids IS 'Array of modification IDs for custom/enhanced items';
COMMENT ON COLUMN item_search.roll_result IS 'The d100 roll made for availability check';
COMMENT ON COLUMN item_search.availability_threshold IS 'The number the roll needed to meet or be under';

COMMENT ON TABLE spellcasting_service IS 'Tracks spellcasting services purchased in cities';
COMMENT ON COLUMN spellcasting_service.cost IS 'Cost calculated as: spell_level × caster_level × 10 gp (minimum 10 gp for 0-level spells)';

-- Insert well-known Pathfinder 1e Inner Sea cities
INSERT INTO city (name, size, population, region, alignment, base_value, purchase_limit, max_spell_level) VALUES
    -- Varisia
    ('Sandpoint', 'Small Town', 1200, 'Varisia', 'NG', 1000, 5000, 2),
    ('Magnimar', 'Large City', 16000, 'Varisia', 'CN', 12800, 75000, 7),
    ('Korvosa', 'Large City', 18000, 'Varisia', 'LE', 12800, 75000, 7),
    ('Riddleport', 'Large City', 10000, 'Varisia', 'CN', 12800, 75000, 7),

    -- The Shackles (Skulls & Shackles region)
    ('Port Peril', 'Small City', 8300, 'The Shackles', 'CN', 4000, 25000, 5),
    ('Bloodcove', 'Small City', 8000, 'The Shackles', 'CN', 4000, 25000, 5),

    -- Major Inner Sea Cities
    ('Absalom', 'Metropolis', 300000, 'Isle of Kortos', 'N', 16000, 100000, 9),
    ('Oppara', 'Metropolis', 109000, 'Taldor', 'N', 16000, 100000, 9),
    ('Katapesh', 'Metropolis', 85000, 'Katapesh', 'N', 16000, 100000, 9),

    -- Other Notable Cities
    ('Almas', 'Large City', 76600, 'Andoran', 'NG', 12800, 75000, 7),
    ('Westcrown', 'Large City', 60000, 'Cheliax', 'LE', 12800, 75000, 7),
    ('Egorian', 'Large City', 82000, 'Cheliax', 'LE', 12800, 75000, 7),
    ('Ilizmagorti', 'Large Town', 4800, 'Mediogalti Island', 'NE', 2000, 10000, 4)
ON CONFLICT (name) DO NOTHING;
