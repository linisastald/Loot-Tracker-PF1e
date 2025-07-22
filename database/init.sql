-- Create tables

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(7) NOT NULL,
    joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    email VARCHAR(255) NOT NULL,
    google_id VARCHAR(255),
    discord_id VARCHAR(20)
);

-- Create unique constraints for users
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE UNIQUE INDEX users_google_id_key ON users(google_id);
CREATE UNIQUE INDEX users_discord_id_key ON users(discord_id);
CREATE INDEX idx_users_google_id ON users(google_id);

CREATE TABLE characters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    appraisal_bonus INTEGER NOT NULL,
    birthday DATE,
    deathday DATE,
    active BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES users(id)
);

-- Ships, Crew, and Outposts (Base structure)
CREATE TABLE ships (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    is_squibbing BOOLEAN DEFAULT false,
    damage INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outposts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    access_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Indexes for crew performance
CREATE INDEX idx_crew_location ON crew(location_type, location_id);
CREATE INDEX idx_crew_is_alive ON crew(is_alive);
CREATE INDEX idx_crew_ship_position ON crew(ship_position);

-- Add constraints to ensure location_type is valid
ALTER TABLE crew ADD CONSTRAINT crew_location_type_check 
    CHECK (location_type IN ('ship', 'outpost'));

CREATE TABLE item (
    id SERIAL PRIMARY KEY,
    name VARCHAR(127) NOT NULL,
    type VARCHAR(15) NOT NULL,
    value NUMERIC,
    subtype VARCHAR(31),
    weight DOUBLE PRECISION,
    casterlevel INTEGER
);

CREATE TABLE mod (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    plus INTEGER,
    type VARCHAR(31),
    valuecalc VARCHAR(255),
    target VARCHAR(31),
    subtarget VARCHAR(31)
);

CREATE TABLE loot (
    id SERIAL PRIMARY KEY,
    session_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    unidentified BOOLEAN,
    masterwork BOOLEAN,
    type VARCHAR(15),
    size VARCHAR(15),
    status VARCHAR(15),
    itemid INTEGER REFERENCES item(id),
    modids INTEGER[],
    charges INTEGER,
    value NUMERIC,
    whohas INTEGER REFERENCES characters(id),
    whoupdated INTEGER REFERENCES users(id),
    lastupdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes VARCHAR(511),
    spellcraft_dc INTEGER,
    dm_notes TEXT
);

CREATE TABLE appraisal (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    characterid INTEGER REFERENCES characters(id),
    lootid INTEGER REFERENCES loot(id),
    appraisalroll INTEGER,
    believedvalue NUMERIC,
    UNIQUE (characterid, lootid)
);

CREATE TABLE gold (
    id SERIAL PRIMARY KEY,
    session_date TIMESTAMP NOT NULL,
    who INTEGER REFERENCES users(id),
    transaction_type VARCHAR(63) NOT NULL,
    notes VARCHAR(255),
    copper INTEGER,
    silver INTEGER,
    gold INTEGER,
    platinum INTEGER,
    character_id INTEGER REFERENCES characters(id)
);

-- Create gold index
CREATE INDEX idx_gold_character_id ON gold(character_id);

CREATE TABLE sold (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    soldfor NUMERIC,
    soldon DATE
);

CREATE TABLE consumableuse (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    who INTEGER REFERENCES characters(id),
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for consumableuse
CREATE INDEX idx_consumableuse_lootid ON consumableuse(lootid);
CREATE INDEX idx_consumableuse_who ON consumableuse(who);
CREATE INDEX idx_consumableuse_time ON consumableuse(time);

CREATE TABLE identify (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    characterid INTEGER REFERENCES characters(id),
    spellcraft_roll INTEGER NOT NULL,
    identified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    golarion_date TEXT,
    success BOOLEAN DEFAULT true
);

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    value_type VARCHAR(50) NOT NULL DEFAULT 'integer',
    description TEXT
);

CREATE TABLE spells (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(255),
    school VARCHAR(255),
    subschool VARCHAR(255),
    class VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    domain VARCHAR(255),
    spelllevel INTEGER,
    item VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    source VARCHAR(255)
);

CREATE TABLE fame (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (character_id)
);

-- Create fame indexes
CREATE INDEX fame_character_id_idx ON fame(character_id);
CREATE INDEX idx_fame_character_id ON fame(character_id);

CREATE TABLE fame_history (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event VARCHAR(255)
);

-- Create fame_history indexes
CREATE INDEX fame_history_character_id_idx ON fame_history(character_id);
CREATE INDEX idx_fame_history_character_id ON fame_history(character_id);
CREATE INDEX idx_fame_history_created_at ON fame_history(created_at);

CREATE TABLE invites (
    id SERIAL PRIMARY KEY,
    code VARCHAR(255) NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id),
    used_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_used BOOLEAN DEFAULT false
);

-- Create invites index
CREATE INDEX idx_invites_code ON invites(code);

CREATE TABLE min_caster_levels (
    spell_level INTEGER PRIMARY KEY,
    min_caster_level INTEGER
);

CREATE TABLE min_costs (
    item_type VARCHAR(10) NOT NULL,
    spell_level INTEGER NOT NULL,
    min_cost NUMERIC,
    PRIMARY KEY (item_type, spell_level)
);

CREATE TABLE session_messages (
    message_id VARCHAR(20) PRIMARY KEY,
    channel_id VARCHAR(20) NOT NULL,
    session_date TIMESTAMP NOT NULL,
    session_time TIMESTAMP NOT NULL,
    responses JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE golarion_current_date (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL
);

CREATE TABLE golarion_calendar_notes (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    note TEXT NOT NULL,
    UNIQUE (year, month, day)
);

CREATE TABLE weather_regions (
    region_name VARCHAR(100) PRIMARY KEY,
    base_temp_low INTEGER NOT NULL,
    base_temp_high INTEGER NOT NULL,
    temp_variance INTEGER NOT NULL DEFAULT 15,
    precipitation_chance NUMERIC(3,2) NOT NULL DEFAULT 0.30,
    storm_chance NUMERIC(3,2) NOT NULL DEFAULT 0.05,
    storm_season_months INTEGER[] DEFAULT ARRAY[0, 1, 2, 9, 10, 11],
    hurricane_chance NUMERIC(3,2) DEFAULT 0.02,
    hurricane_season_months INTEGER[] DEFAULT ARRAY[5, 6, 7, 8],
    seasonal_temp_adjustment JSON NOT NULL
);

CREATE TABLE golarion_weather (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    region VARCHAR(100) NOT NULL REFERENCES weather_regions(region_name),
    condition VARCHAR(50) NOT NULL,
    temp_low INTEGER NOT NULL,
    temp_high INTEGER NOT NULL,
    precipitation_type VARCHAR(20),
    wind_speed INTEGER DEFAULT 5,
    humidity INTEGER DEFAULT 50,
    visibility VARCHAR(20) DEFAULT 'Clear',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (year, month, day, region)
);

-- Create weather index
CREATE INDEX idx_weather_date_region ON golarion_weather(year, month, day, region);

CREATE TABLE ship_infamy (
    id INTEGER PRIMARY KEY,
    infamy INTEGER NOT NULL DEFAULT 0,
    disrepute INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infamy_history (
    id SERIAL PRIMARY KEY,
    infamy_change INTEGER DEFAULT 0,
    disrepute_change INTEGER DEFAULT 0,
    reason TEXT,
    port VARCHAR(255),
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    golarion_date VARCHAR(20)
);

CREATE TABLE favored_ports (
    id SERIAL PRIMARY KEY,
    port_name VARCHAR(255) NOT NULL UNIQUE,
    bonus INTEGER NOT NULL DEFAULT 2,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE port_visits (
    id SERIAL PRIMARY KEY,
    port_name VARCHAR(255) NOT NULL,
    threshold INTEGER NOT NULL,
    infamy_gained INTEGER NOT NULL,
    skill_used VARCHAR(50),
    plunder_spent INTEGER DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE impositions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cost INTEGER NOT NULL,
    effect TEXT NOT NULL,
    description TEXT,
    threshold_required INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE imposition_uses (
    id SERIAL PRIMARY KEY,
    imposition_id INTEGER REFERENCES impositions(id),
    cost_paid INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial data for settings
INSERT INTO settings (name, value, value_type, description) VALUES ('registrations_open', '1', 'boolean', 'Whether new user registrations are allowed (1=open, 0=closed)');
INSERT INTO settings (name, value, value_type, description) VALUES ('campaign_name', 'PF1e Campaign', 'string', 'Name of the current campaign/group');
INSERT INTO settings (name, value, value_type, description) VALUES ('discord_integration_enabled', '0', 'boolean', 'Whether Discord integration is enabled (1=enabled, 0=disabled)');
INSERT INTO settings (name, value, value_type, description) VALUES ('infamy_system_enabled', '0', 'boolean', 'Whether infamy system is enabled (1=enabled, 0=disabled)');
INSERT INTO settings (name, value, value_type, description) VALUES ('auto_appraisal_enabled', '0', 'boolean', 'Whether automatic appraisal is enabled (1=enabled, 0=disabled)');
INSERT INTO settings (name, value, value_type, description) VALUES ('theme', 'dark', 'string', 'Default UI theme (dark/light)');
