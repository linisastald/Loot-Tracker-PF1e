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
    discord_id VARCHAR(20),
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create unique constraints for users
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE UNIQUE INDEX users_google_id_key ON users(google_id);
CREATE UNIQUE INDEX users_discord_id_key ON users(discord_id);
CREATE INDEX idx_users_google_id ON users(google_id);

-- Multi-campaign support: campaigns, memberships, and per-campaign settings.
-- Campaign-specific tables below carry campaign_id with a session-GUC default
-- (mirrors migration 047): inserts inherit the request's campaign from
-- app.current_campaign; if the GUC is unset or 'all' the default is NULL and
-- NOT NULL rejects the insert (intentional fail-safe - cross-campaign code and
-- manual sessions must set the GUC or pass campaign_id explicitly). This file
-- contains no INSERTs into campaign-scoped tables, so it needs no GUC itself.
CREATE TABLE campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    world VARCHAR(100) NOT NULL DEFAULT 'Golarion',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default campaign (id 1) before any campaign_id columns reference
-- it, then keep the sequence ahead of the explicit id.
INSERT INTO campaigns (id, name, slug) VALUES (1, 'PF1e Campaign', 'default');
SELECT setval(pg_get_serial_sequence('campaigns', 'id'), GREATEST((SELECT MAX(id) FROM campaigns), 1));

CREATE TABLE user_campaign (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('DM', 'Player')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, campaign_id)
);

CREATE INDEX idx_user_campaign_campaign_id ON user_campaign(campaign_id);

-- Per-campaign settings. Intentionally empty for now: rows migrate from the
-- global settings table in a later phase of the multi-campaign refactor.
CREATE TABLE campaign_settings (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    value TEXT,
    value_type VARCHAR(50) NOT NULL DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, name)
);

CREATE TABLE characters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    appraisal_bonus INTEGER NOT NULL,
    birthday DATE,
    deathday DATE,
    active BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES users(id),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_characters_campaign_id ON characters(campaign_id);

-- Ships, Crew, and Outposts (Base structure)
CREATE TABLE ships (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    is_squibbing BOOLEAN DEFAULT false,
    damage INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_ships_campaign_id ON ships(campaign_id);

CREATE TABLE outposts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    access_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_outposts_campaign_id ON outposts(campaign_id);

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

-- Indexes for crew performance
CREATE INDEX idx_crew_campaign_id ON crew(campaign_id);
CREATE INDEX idx_crew_location ON crew(location_type, location_id);
CREATE INDEX idx_crew_is_alive ON crew(is_alive);
CREATE INDEX idx_crew_ship_position ON crew(ship_position);

-- Add constraints to ensure location_type is valid
ALTER TABLE crew ADD CONSTRAINT crew_location_type_check 
    CHECK (location_type IN ('ship', 'outpost'));

-- item/mod are shared reference data: campaign_id NULL = global row visible to
-- all campaigns; non-NULL = campaign-specific custom item/mod.
CREATE TABLE item (
    id SERIAL PRIMARY KEY,
    name VARCHAR(127) NOT NULL,
    type VARCHAR(15) NOT NULL,
    value NUMERIC,
    subtype VARCHAR(31),
    weight DOUBLE PRECISION,
    casterlevel INTEGER,
    campaign_id INTEGER REFERENCES campaigns(id)
);

CREATE INDEX idx_item_campaign_id ON item(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE TABLE mod (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    plus INTEGER,
    type VARCHAR(31),
    valuecalc VARCHAR(255),
    target VARCHAR(31),
    subtarget VARCHAR(31),
    campaign_id INTEGER REFERENCES campaigns(id)
);

CREATE INDEX idx_mod_campaign_id ON mod(campaign_id) WHERE campaign_id IS NOT NULL;

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
    dm_notes TEXT,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_loot_campaign_id ON loot(campaign_id);

CREATE TABLE appraisal (
    id SERIAL PRIMARY KEY,
    appraised_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    characterid INTEGER REFERENCES characters(id),
    lootid INTEGER REFERENCES loot(id),
    appraisalroll INTEGER,
    believedvalue NUMERIC,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    UNIQUE (characterid, lootid)
);

CREATE INDEX idx_appraisal_campaign_id ON appraisal(campaign_id);

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
    character_id INTEGER REFERENCES characters(id),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

-- Create gold indexes
CREATE INDEX idx_gold_character_id ON gold(character_id);
CREATE INDEX idx_gold_campaign_id ON gold(campaign_id);

CREATE TABLE sold (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    soldfor NUMERIC,
    soldon DATE,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_sold_campaign_id ON sold(campaign_id);

CREATE TABLE consumableuse (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    who INTEGER REFERENCES characters(id),
    consumed_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

-- Create indexes for consumableuse
CREATE INDEX idx_consumableuse_campaign_id ON consumableuse(campaign_id);
CREATE INDEX idx_consumableuse_lootid ON consumableuse(lootid);
CREATE INDEX idx_consumableuse_who ON consumableuse(who);
CREATE INDEX idx_consumableuse_consumed_on ON consumableuse(consumed_on);

CREATE TABLE identify (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    characterid INTEGER REFERENCES characters(id),
    spellcraft_roll INTEGER NOT NULL,
    identified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    golarion_date TEXT,
    success BOOLEAN DEFAULT true,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_identify_campaign_id ON identify(campaign_id);

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

-- Generated spellbooks (loot generator). A spellbook is attached to a loot item;
-- its spells are stored denormalized so the viewer needs no join.
CREATE TABLE spellbook (
    id SERIAL PRIMARY KEY,
    loot_id INTEGER NOT NULL REFERENCES loot(id) ON DELETE CASCADE,
    caster_class VARCHAR(20) NOT NULL,
    caster_level INTEGER NOT NULL,
    school VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE TABLE spellbook_spell (
    id SERIAL PRIMARY KEY,
    spellbook_id INTEGER NOT NULL REFERENCES spellbook(id) ON DELETE CASCADE,
    spell_id INTEGER REFERENCES spells(id),
    spell_name VARCHAR(255) NOT NULL,
    spell_level INTEGER NOT NULL,
    school VARCHAR(50),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_spellbook_loot ON spellbook(loot_id);
CREATE INDEX IF NOT EXISTS idx_spellbook_spell_book ON spellbook_spell(spellbook_id);
CREATE INDEX idx_spellbook_campaign_id ON spellbook(campaign_id);
CREATE INDEX idx_spellbook_spell_campaign_id ON spellbook_spell(campaign_id);

CREATE TABLE fame (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    UNIQUE (character_id)
);

-- Create fame indexes
CREATE INDEX idx_fame_campaign_id ON fame(campaign_id);
CREATE INDEX fame_character_id_idx ON fame(character_id);
CREATE INDEX idx_fame_character_id ON fame(character_id);

CREATE TABLE fame_history (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event VARCHAR(255),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

-- Create fame_history indexes
CREATE INDEX idx_fame_history_campaign_id ON fame_history(campaign_id);
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
    is_used BOOLEAN NOT NULL DEFAULT false,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

-- Create invites indexes
CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_campaign_id ON invites(campaign_id);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_session_messages_campaign_id ON session_messages(campaign_id);

-- One current-date row per campaign (PK on campaign_id).
CREATE TABLE golarion_current_date (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    CONSTRAINT golarion_current_date_pkey PRIMARY KEY (campaign_id)
);

CREATE INDEX idx_golarion_current_date_campaign_id ON golarion_current_date(campaign_id);

CREATE TABLE golarion_calendar_notes (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    note TEXT NOT NULL,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    CONSTRAINT golarion_calendar_notes_campaign_year_month_day_key UNIQUE (campaign_id, year, month, day)
);

CREATE INDEX idx_golarion_calendar_notes_campaign_id ON golarion_calendar_notes(campaign_id);

-- Rich calendar notes: multi-day (spanning) notes, multiple notes per day,
-- DM-only visibility, and authorship. A note spans start..end inclusive;
-- single-day notes have end = start.
CREATE TABLE golarion_notes (
    id SERIAL PRIMARY KEY,
    start_year INTEGER NOT NULL,
    start_month INTEGER NOT NULL,
    start_day INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    end_month INTEGER NOT NULL,
    end_day INTEGER NOT NULL,
    note TEXT NOT NULL,
    dm_only BOOLEAN NOT NULL DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_golarion_notes_campaign_id ON golarion_notes (campaign_id);
CREATE INDEX idx_golarion_notes_start ON golarion_notes (start_year, start_month, start_day);
CREATE INDEX idx_golarion_notes_created_by ON golarion_notes (created_by);

-- In-game Golarion holidays/festivals. Dated holidays have month+day; movable
-- ones (solstices, weekday-anchored, etc.) use movable_rule with null month/day.
-- The official holiday rows are seeded by migration 041 (which also runs on
-- fresh installs), so no seed data lives here.
-- campaign_id NULL = official/global holiday; non-NULL = campaign custom holiday.
-- NOTE: the plain UNIQUE on name is required by migration 041's
-- ON CONFLICT (name) seed; migration 044 drops it after 041 has run, leaving
-- the two partial unique indexes below as the final uniqueness shape.
CREATE TABLE golarion_holidays (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    month INTEGER,
    day INTEGER,
    category VARCHAR(50) NOT NULL DEFAULT 'Cultural',
    deity VARCHAR(100),
    region VARCHAR(100),
    description TEXT,
    movable_rule VARCHAR(255),
    is_custom BOOLEAN NOT NULL DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    campaign_id INTEGER REFERENCES campaigns(id)
);

CREATE UNIQUE INDEX golarion_holidays_global_name_key ON golarion_holidays(name) WHERE campaign_id IS NULL;
CREATE UNIQUE INDEX golarion_holidays_campaign_name_key ON golarion_holidays(campaign_id, name) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_golarion_holidays_campaign_id ON golarion_holidays (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_golarion_holidays_month_day ON golarion_holidays (month, day);
CREATE INDEX idx_golarion_holidays_created_by ON golarion_holidays (created_by);

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
    is_locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    -- Name must stay golarion_weather_pkey: weatherController.js uses
    -- ON CONFLICT ON CONSTRAINT golarion_weather_pkey.
    CONSTRAINT golarion_weather_pkey PRIMARY KEY (campaign_id, year, month, day, region)
);

-- Create weather indexes
CREATE INDEX idx_weather_date_region ON golarion_weather(year, month, day, region);
CREATE INDEX idx_golarion_weather_campaign_id ON golarion_weather(campaign_id);

-- One infamy row per campaign (UNIQUE on campaign_id); legacy id PK retained.
CREATE TABLE ship_infamy (
    id INTEGER PRIMARY KEY,
    infamy INTEGER NOT NULL DEFAULT 0,
    disrepute INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    CONSTRAINT ship_infamy_campaign_id_key UNIQUE (campaign_id)
);

CREATE INDEX idx_ship_infamy_campaign_id ON ship_infamy(campaign_id);

CREATE TABLE infamy_history (
    id SERIAL PRIMARY KEY,
    infamy_change INTEGER DEFAULT 0,
    disrepute_change INTEGER DEFAULT 0,
    reason TEXT,
    port VARCHAR(255),
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    golarion_date VARCHAR(20),
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_infamy_history_campaign_id ON infamy_history(campaign_id);

CREATE TABLE favored_ports (
    id SERIAL PRIMARY KEY,
    port_name VARCHAR(255) NOT NULL,
    bonus INTEGER NOT NULL DEFAULT 2,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id),
    CONSTRAINT favored_ports_campaign_port_name_key UNIQUE (campaign_id, port_name)
);

CREATE INDEX idx_favored_ports_campaign_id ON favored_ports(campaign_id);

CREATE TABLE port_visits (
    id SERIAL PRIMARY KEY,
    port_name VARCHAR(255) NOT NULL,
    threshold INTEGER NOT NULL,
    infamy_gained INTEGER NOT NULL,
    skill_used VARCHAR(50),
    plunder_spent INTEGER DEFAULT 0,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_port_visits_campaign_id ON port_visits(campaign_id);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    campaign_id INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_campaign', true), 'all')::int) REFERENCES campaigns(id)
);

CREATE INDEX idx_imposition_uses_campaign_id ON imposition_uses(campaign_id);

-- Insert initial data for settings
INSERT INTO settings (name, value, value_type, description) VALUES ('registrations_open', '1', 'boolean', 'DEPRECATED (superseded by registration_mode): whether new user registrations are allowed (1=open, 0=closed)');
INSERT INTO settings (name, value, value_type, description) VALUES ('registration_mode', 'open', 'string', 'How new accounts may register: open (anyone), invite-only (a valid invite code is required), or closed (no new registrations)');
INSERT INTO settings (name, value, value_type, description) VALUES ('campaign_name', 'PF1e Campaign', 'string', 'Name of the current campaign/group');
INSERT INTO settings (name, value, value_type, description) VALUES ('discord_integration_enabled', '0', 'boolean', 'Whether Discord integration is enabled (1=enabled, 0=disabled)');
INSERT INTO settings (name, value, value_type, description) VALUES ('infamy_system_enabled', '0', 'boolean', 'Whether infamy system is enabled (1=enabled, 0=disabled)');
INSERT INTO settings (name, value, value_type, description) VALUES ('auto_appraisal_enabled', '0', 'boolean', 'Whether automatic appraisal is enabled (1=enabled, 0=disabled)');
INSERT INTO settings (name, value, value_type, description) VALUES ('theme', 'dark', 'string', 'Default UI theme (dark/light)');
INSERT INTO settings (name, value, value_type, description) VALUES ('weather_forecast_days', '7', 'integer', 'Number of days ahead of the current Golarion date to pre-generate weather (DM-visible forecast; players see only up to the current date)');
INSERT INTO settings (name, value, value_type, description) VALUES ('treasure_track', 'medium', 'string', 'Treasure progression track used by the loot generator (slow, medium, or fast)');
INSERT INTO settings (name, value, value_type, description) VALUES ('treasure_modifier', '1', 'string', 'Overall multiplier applied to generated treasure amounts (0.5 low fantasy, 1 standard, 2 high fantasy)');

-- ============================================================================
-- Row-Level Security (multi-campaign refactor Phase 2a, mirrors migration
-- 045_enable_rls.sql for the tables created in this file; tables created by
-- migrations and the security_invoker view changes are covered by migration
-- 045's guarded statements, which also run on fresh installs).
--
-- NOT ENFORCED until the app connects as a non-owner role (table owners
-- bypass non-FORCE RLS; see database/setup_app_role.sql). Policy semantics
-- for the GUC app.current_campaign: unset/'' -> no rows (fail closed);
-- an integer -> that campaign only; 'all' -> cross-campaign mode for
-- background jobs/superadmin (the double NULLIF avoids an int-cast error
-- on 'all'). Default policy type FOR ALL covers all DML.
-- ============================================================================

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY characters_tenant ON characters
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY ships_tenant ON ships
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE outposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY outposts_tenant ON outposts
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
CREATE POLICY crew_tenant ON crew
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE loot ENABLE ROW LEVEL SECURITY;
CREATE POLICY loot_tenant ON loot
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE appraisal ENABLE ROW LEVEL SECURITY;
CREATE POLICY appraisal_tenant ON appraisal
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE gold ENABLE ROW LEVEL SECURITY;
CREATE POLICY gold_tenant ON gold
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE sold ENABLE ROW LEVEL SECURITY;
CREATE POLICY sold_tenant ON sold
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE consumableuse ENABLE ROW LEVEL SECURITY;
CREATE POLICY consumableuse_tenant ON consumableuse
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE identify ENABLE ROW LEVEL SECURITY;
CREATE POLICY identify_tenant ON identify
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE spellbook ENABLE ROW LEVEL SECURITY;
CREATE POLICY spellbook_tenant ON spellbook
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE spellbook_spell ENABLE ROW LEVEL SECURITY;
CREATE POLICY spellbook_spell_tenant ON spellbook_spell
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE fame ENABLE ROW LEVEL SECURITY;
CREATE POLICY fame_tenant ON fame
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE fame_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY fame_history_tenant ON fame_history
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_tenant ON invites
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_messages_tenant ON session_messages
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_current_date ENABLE ROW LEVEL SECURITY;
CREATE POLICY golarion_current_date_tenant ON golarion_current_date
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_calendar_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY golarion_calendar_notes_tenant ON golarion_calendar_notes
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY golarion_notes_tenant ON golarion_notes
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_weather ENABLE ROW LEVEL SECURITY;
CREATE POLICY golarion_weather_tenant ON golarion_weather
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE ship_infamy ENABLE ROW LEVEL SECURITY;
CREATE POLICY ship_infamy_tenant ON ship_infamy
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE infamy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY infamy_history_tenant ON infamy_history
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE favored_ports ENABLE ROW LEVEL SECURITY;
CREATE POLICY favored_ports_tenant ON favored_ports
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE port_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY port_visits_tenant ON port_visits
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE imposition_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY imposition_uses_tenant ON imposition_uses
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );
