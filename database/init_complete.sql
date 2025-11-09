-- ============================================================================================
-- PATHFINDER 1E LOOT TRACKER - COMPLETE DATABASE SCHEMA
-- ============================================================================================
-- This file contains the complete, consolidated database schema for the Pathfinder 1e
-- Loot and Gold Management System. It includes all changes from migrations 01-013 and
-- the gold_totals_view from migration 20250108_001.
--
-- This schema supports:
-- - Multi-campaign instances (Rise of the Runelords, Skulls & Shackles)
-- - Loot and gold management with appraisal system
-- - Complete ship management system with combat stats
-- - Crew and outpost tracking
-- - Weather system for Golarion
-- - Fame and infamy systems
-- - Discord integration
-- - Performance-optimized indexes
-- ============================================================================================

-- ============================================================================================
-- CORE USER AND CHARACTER TABLES
-- ============================================================================================

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

-- User indexes for authentication and lookups
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

-- ============================================================================================
-- FLEET MANAGEMENT SYSTEM
-- ============================================================================================

-- Complete ships table with all combat stats and pirate campaign fields
CREATE TABLE ships (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    is_squibbing BOOLEAN DEFAULT false,
    damage INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ship type and basic characteristics
    ship_type VARCHAR(50),
    size VARCHAR(20) DEFAULT 'Colossal',
    cost INTEGER DEFAULT 0,
    max_speed INTEGER DEFAULT 30,
    acceleration INTEGER DEFAULT 15,
    propulsion VARCHAR(100),
    min_crew INTEGER DEFAULT 1,
    max_crew INTEGER DEFAULT 10,
    cargo_capacity INTEGER DEFAULT 10000,
    max_passengers INTEGER DEFAULT 10,
    decks INTEGER DEFAULT 1,
    ramming_damage VARCHAR(20) DEFAULT '1d8',

    -- Combat statistics
    base_ac INTEGER DEFAULT 10,
    touch_ac INTEGER DEFAULT 10,
    hardness INTEGER DEFAULT 0,
    max_hp INTEGER DEFAULT 100,
    current_hp INTEGER DEFAULT 100,
    cmb INTEGER DEFAULT 0,
    cmd INTEGER DEFAULT 10,
    saves INTEGER DEFAULT 0,
    initiative INTEGER DEFAULT 0,
    legacy_damage INTEGER,

    -- Pirate campaign specific fields
    plunder INTEGER DEFAULT 0,
    infamy INTEGER DEFAULT 0,
    disrepute INTEGER DEFAULT 0,
    sails_oars VARCHAR(100),
    sailing_check_bonus INTEGER DEFAULT 0,

    -- Complex data structures stored as JSON
    weapons JSONB DEFAULT '[]'::jsonb,
    officers JSONB DEFAULT '[]'::jsonb,
    improvements JSONB DEFAULT '[]'::jsonb,
    cargo_manifest JSONB DEFAULT '{"items": [], "passengers": [], "impositions": []}'::jsonb,

    -- Additional ship details
    ship_notes TEXT,
    captain_name VARCHAR(255),
    flag_description TEXT,

    -- Ship status (replaces legacy pc_active column)
    status VARCHAR(20) DEFAULT 'Active'
);

-- Ship constraints
ALTER TABLE ships ADD CONSTRAINT ships_hp_check
    CHECK (current_hp >= 0 AND current_hp <= max_hp);
ALTER TABLE ships ADD CONSTRAINT ships_ac_check
    CHECK (base_ac >= 0 AND base_ac <= 50 AND touch_ac >= 0 AND touch_ac <= 50);
ALTER TABLE ships ADD CONSTRAINT ships_crew_check
    CHECK (min_crew >= 0 AND max_crew >= min_crew);
ALTER TABLE ships ADD CONSTRAINT ships_capacity_check
    CHECK (cargo_capacity >= 0 AND max_passengers >= 0);
ALTER TABLE ships ADD CONSTRAINT ships_campaign_stats_check
    CHECK (plunder >= 0 AND infamy >= 0 AND disrepute >= 0);
ALTER TABLE ships ADD CONSTRAINT ships_status_check
    CHECK (status IN ('PC Active', 'Active', 'Docked', 'Lost', 'Sunk'));

-- Ship indexes for performance
CREATE INDEX idx_ships_status ON ships(status);
CREATE INDEX idx_ships_weapons ON ships USING GIN (weapons);
CREATE INDEX idx_ships_officers ON ships USING GIN (officers);
CREATE INDEX idx_ships_improvements ON ships USING GIN (improvements);
CREATE INDEX idx_ships_cargo ON ships USING GIN (cargo_manifest);

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

-- Crew constraints and indexes
ALTER TABLE crew ADD CONSTRAINT crew_location_type_check
    CHECK (location_type IN ('ship', 'outpost'));

CREATE INDEX idx_crew_location ON crew(location_type, location_id);
CREATE INDEX idx_crew_is_alive ON crew(is_alive);
CREATE INDEX idx_crew_ship_position ON crew(ship_position);
CREATE INDEX idx_crew_location_id ON crew(location_id) WHERE location_type = 'ship';

-- ============================================================================================
-- LOOT AND ITEM MANAGEMENT SYSTEM
-- ============================================================================================

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

-- Note: Column renamed from 'time' to 'appraised_on' per migration 012
CREATE TABLE appraisal (
    id SERIAL PRIMARY KEY,
    appraised_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    characterid INTEGER REFERENCES characters(id),
    lootid INTEGER REFERENCES loot(id),
    appraisalroll INTEGER,
    believedvalue NUMERIC,
    UNIQUE (characterid, lootid)
);

CREATE TABLE sold (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    soldfor NUMERIC,
    soldon DATE
);

-- Note: Column renamed from 'time' to 'consumed_on' per migration 012
CREATE TABLE consumableuse (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    who INTEGER REFERENCES characters(id),
    consumed_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE identify (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    characterid INTEGER REFERENCES characters(id),
    spellcraft_roll INTEGER NOT NULL,
    identified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    golarion_date TEXT,
    success BOOLEAN DEFAULT true
);

-- ============================================================================================
-- GOLD AND FINANCIAL SYSTEM
-- ============================================================================================

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

-- ============================================================================================
-- FAME AND INFAMY SYSTEMS
-- ============================================================================================

CREATE TABLE fame (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (character_id)
);

CREATE TABLE fame_history (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event VARCHAR(255)
);

-- Ship infamy system (separate from character fame)
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

-- ============================================================================================
-- WEATHER SYSTEM
-- ============================================================================================

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

-- ============================================================================================
-- CALENDAR AND TIME SYSTEM
-- ============================================================================================

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

-- ============================================================================================
-- SYSTEM CONFIGURATION AND UTILITIES
-- ============================================================================================

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    value_type VARCHAR(50) NOT NULL DEFAULT 'integer',
    description TEXT
);

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

-- ============================================================================================
-- SPELL AND MAGIC ITEM SYSTEM
-- ============================================================================================

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

-- ============================================================================================
-- DISCORD INTEGRATION
-- ============================================================================================

CREATE TABLE session_messages (
    message_id VARCHAR(20) PRIMARY KEY,
    channel_id VARCHAR(20) NOT NULL,
    session_date TIMESTAMP NOT NULL,
    session_time TIMESTAMP NOT NULL,
    responses JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================================
-- VIEWS FOR COMPLEX QUERIES
-- ============================================================================================

-- Comprehensive loot view that provides both summary and individual row data
CREATE VIEW loot_view AS
 WITH quantity_sums AS (
         SELECT loot.name,
            loot.type,
            loot.size,
            loot.unidentified,
            loot.masterwork,
            loot.status,
            sum(loot.quantity) AS total_quantity
           FROM loot
          GROUP BY loot.name, loot.type, loot.size, loot.unidentified, loot.masterwork, loot.status
        ), loot_summary AS (
         SELECT min(l.id) AS summary_id,
            l.name,
            l.type,
            l.size,
            l.unidentified,
            l.masterwork,
            qs.total_quantity,
            NULL::numeric AS average_value,
            round(COALESCE(avg(a.believedvalue), NULL::numeric), 2) AS average_appraisal,
            array_agg(DISTINCT c_whohas.name) AS character_names,
            string_agg(DISTINCT (l.notes)::text, ' | '::text) AS notes,
            array_agg(json_build_object('character_name', c_appraisal.name, 'believedvalue', a.believedvalue)) AS appraisals,
            NULL::integer AS id,
            max(l.session_date) AS session_date,
            min(l.itemid) AS itemid,
            min(l.modids) AS modids,
            max(l.lastupdate) AS lastupdate,
                CASE
                    WHEN bool_or(((l.status)::text = 'Pending Sale'::text)) THEN 'Pending Sale'::text
                    ELSE NULL::text
                END AS status,
            l.status AS statuspage
           FROM ((((loot l
             LEFT JOIN characters c_whohas ON ((l.whohas = c_whohas.id)))
             LEFT JOIN appraisal a ON ((l.id = a.lootid)))
             LEFT JOIN characters c_appraisal ON ((a.characterid = c_appraisal.id)))
             LEFT JOIN quantity_sums qs ON ((((l.name)::text = (qs.name)::text) AND ((l.type)::text = (qs.type)::text) AND (((l.size)::text = (qs.size)::text) OR ((l.size IS NULL) AND (qs.size IS NULL))) AND ((l.unidentified = qs.unidentified) OR ((l.unidentified IS NULL) AND (qs.unidentified IS NULL))) AND ((l.masterwork = qs.masterwork) OR ((l.masterwork IS NULL) AND (qs.masterwork IS NULL))) AND (((l.status)::text = (qs.status)::text) OR ((l.status IS NULL) AND (qs.status IS NULL))))))
          GROUP BY l.name, l.type, l.size, l.unidentified, l.masterwork, l.status, qs.total_quantity
        ), individual_rows AS (
         SELECT l.id,
            l.session_date,
            l.quantity,
            l.name,
            l.unidentified,
            l.masterwork,
            l.type,
            l.size,
            l.status,
            l.itemid,
            l.modids,
            l.charges,
            l.value,
            l.whohas,
            l.whoupdated,
            l.lastupdate,
            l.notes,
            l.spellcraft_dc,
            l.dm_notes,
            c_whohas.name AS character_name,
            round(COALESCE(avg(a.believedvalue), NULL::numeric), 2) AS average_appraisal,
            array_agg(json_build_object('character_name', c_appraisal.name, 'believedvalue', a.believedvalue)) AS appraisals
           FROM (((loot l
             LEFT JOIN characters c_whohas ON ((l.whohas = c_whohas.id)))
             LEFT JOIN appraisal a ON ((l.id = a.lootid)))
             LEFT JOIN characters c_appraisal ON ((a.characterid = c_appraisal.id)))
          GROUP BY l.id, c_whohas.name
        )
 SELECT 'summary'::text AS row_type,
    ls.summary_id AS id,
    ls.session_date,
    ls.total_quantity AS quantity,
    ls.name,
    ls.unidentified,
    ls.masterwork,
    ls.type,
    ls.size,
    ls.average_value AS value,
    ls.itemid,
    ls.modids,
    ls.status,
    ls.statuspage,
    ls.character_names[1] AS character_name,
    NULL::integer AS whoupdated,
    ls.lastupdate,
    ls.average_appraisal,
    ls.notes,
    ls.appraisals
   FROM loot_summary ls
UNION ALL
 SELECT 'individual'::text AS row_type,
    ir.id,
    ir.session_date,
    ir.quantity,
    ir.name,
    ir.unidentified,
    ir.masterwork,
    ir.type,
    ir.size,
    ir.value,
    ir.itemid,
    ir.modids,
    ir.status,
    ir.status AS statuspage,
    ir.character_name,
    ir.whoupdated,
    ir.lastupdate,
    ir.average_appraisal,
    ir.notes,
    ir.appraisals
   FROM individual_rows ir
  ORDER BY 1, 5, 2;

-- Gold totals view for efficient overview display
CREATE VIEW gold_totals_view AS
SELECT
    COALESCE(SUM(platinum), 0) as total_platinum,
    COALESCE(SUM(gold), 0) as total_gold,
    COALESCE(SUM(silver), 0) as total_silver,
    COALESCE(SUM(copper), 0) as total_copper,
    COALESCE(
        (10 * SUM(platinum)) +
        SUM(gold) +
        (SUM(silver) / 10.0) +
        (SUM(copper) / 100.0),
        0
    ) as total_value_in_gold,
    COUNT(*) as total_transactions,
    MAX(session_date) as last_transaction_date
FROM gold;

-- Performance monitoring view for database administration
CREATE VIEW index_usage_stats AS
SELECT
    schemaname,
    relname as tablename,
    indexrelname as indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 100 THEN 'LOW_USAGE'
        WHEN idx_scan < 1000 THEN 'MODERATE_USAGE'
        ELSE 'HIGH_USAGE'
    END as usage_level
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ============================================================================================
-- PERFORMANCE INDEXES
-- ============================================================================================

-- Core loot table indexes for high-performance queries
CREATE INDEX idx_loot_status ON loot(status);
CREATE INDEX idx_loot_status_identified ON loot(status, unidentified) WHERE unidentified IS NOT NULL;
CREATE INDEX idx_loot_status_value ON loot(status, value) WHERE value IS NOT NULL;
CREATE INDEX idx_loot_session_date ON loot(session_date);
CREATE INDEX idx_loot_whohas ON loot(whohas) WHERE whohas IS NOT NULL;
CREATE INDEX idx_loot_type ON loot(type);
CREATE INDEX idx_loot_lastupdate ON loot(lastupdate);
CREATE INDEX idx_loot_grouping ON loot(name, type, size, unidentified, masterwork, status);
CREATE INDEX idx_loot_status_character ON loot(status, whohas);
CREATE INDEX idx_loot_status_session ON loot(status, session_date);
CREATE INDEX idx_loot_unidentified ON loot(itemid, session_date) WHERE unidentified = true;

-- Gold table indexes for financial queries
CREATE INDEX idx_gold_character_id ON gold(character_id);
CREATE INDEX idx_gold_session_date ON gold(session_date);
CREATE INDEX idx_gold_transaction_type ON gold(transaction_type);
CREATE INDEX idx_gold_who ON gold(who) WHERE who IS NOT NULL;
CREATE INDEX idx_gold_character_session ON gold(character_id, session_date);
CREATE INDEX idx_gold_session_character ON gold(session_date, character_id);

-- Character table indexes
CREATE INDEX idx_characters_active ON characters(active);
CREATE INDEX idx_characters_user_id ON characters(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_characters_name_lower ON characters(lower(name));
CREATE INDEX idx_characters_active_user ON characters(active, user_id);
CREATE INDEX idx_characters_active_only ON characters(user_id, name) WHERE active = true;

-- Appraisal table indexes (updated column names from migration 012)
CREATE INDEX idx_appraisal_characterid ON appraisal(characterid);
CREATE INDEX idx_appraisal_lootid ON appraisal(lootid);
CREATE INDEX idx_appraisal_appraised_on ON appraisal(appraised_on);
CREATE INDEX idx_appraisal_character_time ON appraisal(characterid, appraised_on);

-- Consumable use table indexes (updated column names from migration 012)
CREATE INDEX idx_consumableuse_lootid ON consumableuse(lootid);
CREATE INDEX idx_consumableuse_who ON consumableuse(who);
CREATE INDEX idx_consumableuse_consumed_on ON consumableuse(consumed_on);

-- Sold table indexes
CREATE INDEX idx_sold_soldon ON sold(soldon);
CREATE INDEX idx_sold_lootid ON sold(lootid);
CREATE INDEX idx_sold_loot_date ON sold(lootid, soldon);

-- Identify table indexes
CREATE INDEX idx_identify_lootid ON identify(lootid);
CREATE INDEX idx_identify_characterid ON identify(characterid);
CREATE INDEX idx_identify_identified_at ON identify(identified_at);

-- Item and mod table indexes
CREATE INDEX idx_item_type ON item(type);
CREATE INDEX idx_item_name_lower ON item(lower(name));
CREATE INDEX idx_mod_type ON mod(type);
CREATE INDEX idx_mod_name_lower ON mod(lower(name));

-- Fame system indexes
CREATE INDEX fame_character_id_idx ON fame(character_id);
CREATE INDEX idx_fame_character_id ON fame(character_id);
CREATE INDEX fame_history_character_id_idx ON fame_history(character_id);
CREATE INDEX idx_fame_history_character_id ON fame_history(character_id);
CREATE INDEX idx_fame_history_created_at ON fame_history(created_at);

-- System table indexes
CREATE INDEX idx_settings_name ON settings(name);
CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_session_messages_session_date ON session_messages(session_date);
CREATE INDEX idx_session_messages_session_created ON session_messages(session_date, created_at);

-- Weather system indexes
CREATE INDEX idx_weather_date_region ON golarion_weather(year, month, day, region);

-- ============================================================================================
-- INITIAL DATA AND SETTINGS
-- ============================================================================================

-- Insert default weather regions
INSERT INTO weather_regions (region_name, base_temp_low, base_temp_high, temp_variance, precipitation_chance, storm_chance, storm_season_months, seasonal_temp_adjustment)
VALUES ('Varisia', 40, 65, 20, 0.35, 0.08, ARRAY[0,1,2,9,10,11],
       '{"0": -25, "1": -20, "2": -10, "3": 5, "4": 15, "5": 25, "6": 30, "7": 25, "8": 15, "9": 5, "10": -10, "11": -20}');

INSERT INTO weather_regions (region_name, base_temp_low, base_temp_high, temp_variance, precipitation_chance, storm_chance, storm_season_months, hurricane_chance, hurricane_season_months, seasonal_temp_adjustment)
VALUES ('The Shackles', 65, 85, 15, 0.45, 0.06, ARRAY[0,1,10,11], 0.03, ARRAY[5,6,7,8],
       '{"0": 0, "1": 0, "2": 5, "3": 10, "4": 15, "5": 20, "6": 20, "7": 20, "8": 15, "9": 10, "10": 5, "11": 0}');

-- Insert system settings
INSERT INTO settings (name, value, value_type, description) VALUES
('registrations_open', '1', 'boolean', 'Whether new user registrations are allowed (1=open, 0=closed)'),
('campaign_name', 'PF1e Campaign', 'string', 'Name of the current campaign/group'),
('discord_integration_enabled', '0', 'boolean', 'Whether Discord integration is enabled (1=enabled, 0=disabled)'),
('infamy_system_enabled', '0', 'boolean', 'Whether infamy system is enabled (1=enabled, 0=disabled)'),
('auto_appraisal_enabled', '0', 'boolean', 'Whether automatic appraisal is enabled (1=enabled, 0=disabled)'),
('theme', 'dark', 'string', 'Default UI theme (dark/light)'),
('default_region', 'Varisia', 'string', 'Default weather region for the campaign');

-- Add comments to document important views
COMMENT ON VIEW gold_totals_view IS 'Provides current gold totals and overview statistics for efficient display in the overview page';
COMMENT ON COLUMN appraisal.appraised_on IS 'Timestamp when the item was appraised';
COMMENT ON COLUMN consumableuse.consumed_on IS 'Timestamp when the consumable was used';

-- ============================================================================================
-- SCHEMA COMPLETE
-- ============================================================================================
-- This schema represents the complete, consolidated state of the database
-- as of migration 20250108_001. It includes:
--
-- ✓ All base tables from init.sql
-- ✓ Complete fleet management system (ships, crew, outposts)
-- ✓ Weather system for Golarion
-- ✓ Fame and infamy systems
-- ✓ Column standardization (appraised_on, consumed_on)
-- ✓ All performance indexes from migrations 011 and 013
-- ✓ Gold totals view for efficient calculations
-- ✓ Ship status system with proper constraints
-- ✓ All JSON fields for complex ship data
--
-- No schema_migrations table is included since this represents the complete
-- consolidated state and migrations should no longer be needed.
-- ============================================================================================