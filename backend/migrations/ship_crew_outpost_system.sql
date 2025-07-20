-- Ship, Crew, and Outpost Tracking System Migration

-- Ships table
CREATE TABLE ships (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    is_squibbing BOOLEAN DEFAULT false,
    damage INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Outposts table  
CREATE TABLE outposts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    access_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crew table
CREATE TABLE crew (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    race VARCHAR(100),
    age INTEGER,
    description TEXT,
    location_type VARCHAR(20), -- 'ship' or 'outpost'
    location_id INTEGER, -- references ships.id or outposts.id
    ship_position VARCHAR(100), -- captain, first mate, etc (null if at outpost)
    is_alive BOOLEAN DEFAULT true,
    death_date DATE,
    departure_date DATE,
    departure_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_crew_location ON crew(location_type, location_id);
CREATE INDEX idx_crew_is_alive ON crew(is_alive);
CREATE INDEX idx_crew_ship_position ON crew(ship_position);

-- Add constraints to ensure location_type is valid
ALTER TABLE crew ADD CONSTRAINT crew_location_type_check 
    CHECK (location_type IN ('ship', 'outpost'));
