-- Migration: 044_add_campaigns.sql
-- Description: Multi-campaign refactor Phase 1 - schema foundation.
--   Adds campaigns, user_campaign, and campaign_settings tables, seeds a
--   default campaign (id 1) and memberships from existing users, adds
--   users.is_superadmin, stamps campaign_id on every campaign-specific table,
--   and reworks per-deployment uniqueness constraints to be campaign-scoped.
-- Author: Database Architect Agent
-- Date: 2026-06-09
--
-- This migration is IDEMPOTENT: on fresh installs database/init.sql already
-- contains most of this schema and this migration becomes a no-op. The
-- migration runner wraps this file in a transaction automatically (no
-- CONCURRENTLY statements here), so no explicit BEGIN/COMMIT.
--
-- NOTE on DEFAULT 1: campaign_id columns default to the seeded campaign 1 so
-- existing code keeps working unchanged during Phase 1. Phase 2 replaces this
-- with a session-GUC-based default; DEFAULT 1 is temporary.

-- ============================================================================
-- 1. Core multi-campaign tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    world VARCHAR(100) NOT NULL DEFAULT 'Golarion',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE campaigns IS 'A campaign (game/party) hosted by this instance. All campaign-specific tables carry a campaign_id referencing this table.';
COMMENT ON COLUMN campaigns.slug IS 'URL-safe unique identifier for the campaign (e.g. "default", "skulls-and-shackles").';
COMMENT ON COLUMN campaigns.world IS 'Game world the campaign is set in (affects calendar/weather features).';
COMMENT ON COLUMN campaigns.is_active IS 'Inactive campaigns are hidden/archived but their data is retained.';

CREATE TABLE IF NOT EXISTS user_campaign (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('DM', 'Player')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, campaign_id)
);

-- PK (user_id, campaign_id) covers user-leading lookups; index the reverse direction.
CREATE INDEX IF NOT EXISTS idx_user_campaign_campaign_id ON user_campaign(campaign_id);

COMMENT ON TABLE user_campaign IS 'Campaign membership: which users belong to which campaigns and with what per-campaign role.';
COMMENT ON COLUMN user_campaign.role IS 'Per-campaign role (DM or Player). Supersedes the deprecated global users.role.';

CREATE TABLE IF NOT EXISTS campaign_settings (
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

-- The UNIQUE (campaign_id, name) constraint doubles as the campaign_id-leading index.
COMMENT ON TABLE campaign_settings IS 'Per-campaign settings. Intentionally left EMPTY in Phase 1: per-campaign rows migrate from the global settings table in a later phase, when application code switches to reading this table.';
COMMENT ON COLUMN campaign_settings.value_type IS 'Type hint for value parsing (string, integer, boolean, etc.).';

-- ============================================================================
-- 2. Seed default campaign and memberships (idempotent)
-- ============================================================================

-- Default campaign id 1, named after the existing campaign_name setting when
-- present. Only inserted when the campaigns table is completely empty, so
-- re-runs and fresh installs (where init.sql seeds it) are no-ops.
INSERT INTO campaigns (id, name, slug)
SELECT 1,
       COALESCE(
           (SELECT NULLIF(LEFT(value, 255), '') FROM settings WHERE name = 'campaign_name'),
           'Default Campaign'
       ),
       'default'
WHERE NOT EXISTS (SELECT 1 FROM campaigns);

-- Keep the sequence ahead of explicitly-inserted ids.
SELECT setval(pg_get_serial_sequence('campaigns', 'id'), GREATEST((SELECT MAX(id) FROM campaigns), 1));

-- Every existing user becomes a member of campaign 1, mapping the legacy
-- global users.role: 'DM' stays DM, everything else becomes Player.
INSERT INTO user_campaign (user_id, campaign_id, role)
SELECT u.id, 1, CASE WHEN u.role = 'DM' THEN 'DM' ELSE 'Player' END
FROM users u
WHERE EXISTS (SELECT 1 FROM campaigns WHERE id = 1)
ON CONFLICT (user_id, campaign_id) DO NOTHING;

-- ============================================================================
-- 3. Global superadmin flag on users (users.role is NOT touched; it is
--    deprecated in a later phase)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.is_superadmin IS 'Global operator flag above all campaigns (instance administration). Independent of per-campaign roles in user_campaign.';

-- ============================================================================
-- 4. campaign_id on campaign-specific tables (39 tables)
--    DEFAULT 1 is temporary (see header note); Phase 2 swaps it for a
--    session-GUC default. Existing rows are stamped with campaign 1.
-- ============================================================================

-- Characters and loot management
ALTER TABLE characters ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_characters_campaign_id ON characters(campaign_id);

ALTER TABLE loot ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_loot_campaign_id ON loot(campaign_id);

ALTER TABLE appraisal ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_appraisal_campaign_id ON appraisal(campaign_id);

ALTER TABLE gold ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_gold_campaign_id ON gold(campaign_id);

ALTER TABLE sold ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_sold_campaign_id ON sold(campaign_id);

ALTER TABLE consumableuse ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_consumableuse_campaign_id ON consumableuse(campaign_id);

ALTER TABLE identify ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_identify_campaign_id ON identify(campaign_id);

ALTER TABLE fame ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_fame_campaign_id ON fame(campaign_id);

ALTER TABLE fame_history ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_fame_history_campaign_id ON fame_history(campaign_id);

ALTER TABLE invites ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_invites_campaign_id ON invites(campaign_id);

-- Ships, outposts, and crew
ALTER TABLE ships ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_ships_campaign_id ON ships(campaign_id);

ALTER TABLE outposts ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_outposts_campaign_id ON outposts(campaign_id);

ALTER TABLE crew ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_crew_campaign_id ON crew(campaign_id);

-- Calendar and weather
ALTER TABLE golarion_current_date ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_golarion_current_date_campaign_id ON golarion_current_date(campaign_id);

ALTER TABLE golarion_calendar_notes ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_golarion_calendar_notes_campaign_id ON golarion_calendar_notes(campaign_id);

ALTER TABLE golarion_notes ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_golarion_notes_campaign_id ON golarion_notes(campaign_id);

ALTER TABLE golarion_weather ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_golarion_weather_campaign_id ON golarion_weather(campaign_id);

-- Infamy system (Skulls & Shackles)
ALTER TABLE ship_infamy ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_ship_infamy_campaign_id ON ship_infamy(campaign_id);

ALTER TABLE infamy_history ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_infamy_history_campaign_id ON infamy_history(campaign_id);

ALTER TABLE favored_ports ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_favored_ports_campaign_id ON favored_ports(campaign_id);

ALTER TABLE port_visits ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_port_visits_campaign_id ON port_visits(campaign_id);

ALTER TABLE imposition_uses ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_imposition_uses_campaign_id ON imposition_uses(campaign_id);

-- Generated spellbooks (loot generator)
ALTER TABLE spellbook ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_spellbook_campaign_id ON spellbook(campaign_id);

ALTER TABLE spellbook_spell ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_spellbook_spell_campaign_id ON spellbook_spell(campaign_id);

-- Session management
ALTER TABLE session_messages ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_messages_campaign_id ON session_messages(campaign_id);

ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_campaign_id ON game_sessions(campaign_id);

ALTER TABLE session_attendance ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_campaign_id ON session_attendance(campaign_id);

ALTER TABLE session_reminders ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_reminders_campaign_id ON session_reminders(campaign_id);

ALTER TABLE session_notes ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_notes_campaign_id ON session_notes(campaign_id);

ALTER TABLE session_tasks ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_campaign_id ON session_tasks(campaign_id);

ALTER TABLE session_task_assignments ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_task_assignments_campaign_id ON session_task_assignments(campaign_id);

ALTER TABLE session_task_history ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_task_history_campaign_id ON session_task_history(campaign_id);

ALTER TABLE session_completions ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_completions_campaign_id ON session_completions(campaign_id);

ALTER TABLE session_automations ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_automations_campaign_id ON session_automations(campaign_id);

ALTER TABLE session_config ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_session_config_campaign_id ON session_config(campaign_id);

-- Discord integration
ALTER TABLE discord_reaction_tracking ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_discord_reaction_tracking_campaign_id ON discord_reaction_tracking(campaign_id);

ALTER TABLE discord_outbox ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_discord_outbox_campaign_id ON discord_outbox(campaign_id);

-- City services
ALTER TABLE item_search ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_item_search_campaign_id ON item_search(campaign_id);

ALTER TABLE spellcasting_service ADD COLUMN IF NOT EXISTS campaign_id INTEGER NOT NULL DEFAULT 1 REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_spellcasting_service_campaign_id ON spellcasting_service(campaign_id);

-- ============================================================================
-- 5. Rework per-deployment uniqueness to be campaign-scoped
--    Each DO block checks pg_constraint so re-runs and fresh installs
--    (init.sql already in final shape) are no-ops.
-- ============================================================================

-- golarion_current_date: previously a PK-less singleton-by-convention table.
-- One row per campaign, enforced by PRIMARY KEY (campaign_id).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'golarion_current_date'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE golarion_current_date
            ADD CONSTRAINT golarion_current_date_pkey PRIMARY KEY (campaign_id);
    END IF;
END $$;

-- golarion_weather: PK (year, month, day, region) -> (campaign_id, year, month, day, region).
-- The constraint name golarion_weather_pkey MUST be preserved: weatherController.js
-- uses ON CONFLICT ON CONSTRAINT golarion_weather_pkey.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'golarion_weather'::regclass
          AND c.contype = 'p'
          AND a.attname = 'campaign_id'
    ) THEN
        ALTER TABLE golarion_weather DROP CONSTRAINT IF EXISTS golarion_weather_pkey;
        ALTER TABLE golarion_weather
            ADD CONSTRAINT golarion_weather_pkey PRIMARY KEY (campaign_id, year, month, day, region);
    END IF;
END $$;

-- golarion_calendar_notes: UNIQUE (year, month, day) -> UNIQUE (campaign_id, year, month, day)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'golarion_calendar_notes'::regclass
          AND c.contype = 'u'
          AND a.attname = 'campaign_id'
    ) THEN
        ALTER TABLE golarion_calendar_notes
            DROP CONSTRAINT IF EXISTS golarion_calendar_notes_year_month_day_key;
        ALTER TABLE golarion_calendar_notes
            ADD CONSTRAINT golarion_calendar_notes_campaign_year_month_day_key
            UNIQUE (campaign_id, year, month, day);
    END IF;
END $$;

-- favored_ports: UNIQUE (port_name) -> UNIQUE (campaign_id, port_name)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'favored_ports'::regclass
          AND c.contype = 'u'
          AND a.attname = 'campaign_id'
    ) THEN
        ALTER TABLE favored_ports DROP CONSTRAINT IF EXISTS favored_ports_port_name_key;
        ALTER TABLE favored_ports
            ADD CONSTRAINT favored_ports_campaign_port_name_key UNIQUE (campaign_id, port_name);
    END IF;
END $$;

-- session_config: UNIQUE (setting_name) -> UNIQUE (campaign_id, setting_name)
-- (Migrations 014/017 use ON CONFLICT (setting_name); they always run before
-- this migration, so reworking the constraint here is safe.)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'session_config'::regclass
          AND c.contype = 'u'
          AND a.attname = 'campaign_id'
    ) THEN
        ALTER TABLE session_config DROP CONSTRAINT IF EXISTS session_config_setting_name_key;
        ALTER TABLE session_config
            ADD CONSTRAINT session_config_campaign_setting_name_key UNIQUE (campaign_id, setting_name);
    END IF;
END $$;

-- ship_infamy: keep the existing id PK (singleton row id = 1 per legacy code);
-- add UNIQUE (campaign_id) so each campaign has at most one infamy row.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'ship_infamy'::regclass
          AND c.contype = 'u'
          AND a.attname = 'campaign_id'
    ) THEN
        ALTER TABLE ship_infamy
            ADD CONSTRAINT ship_infamy_campaign_id_key UNIQUE (campaign_id);
    END IF;
END $$;

-- ============================================================================
-- 6. Reference tables with per-campaign override support
--    Nullable campaign_id: NULL = global/official row shared by all campaigns,
--    non-NULL = campaign-specific override/addition. No DEFAULT on purpose.
-- ============================================================================

ALTER TABLE item ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_item_campaign_id ON item(campaign_id) WHERE campaign_id IS NOT NULL;
COMMENT ON COLUMN item.campaign_id IS 'NULL = global reference item shared by all campaigns; non-NULL = campaign-specific custom item.';

ALTER TABLE mod ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_mod_campaign_id ON mod(campaign_id) WHERE campaign_id IS NOT NULL;
COMMENT ON COLUMN mod.campaign_id IS 'NULL = global reference mod shared by all campaigns; non-NULL = campaign-specific custom mod.';

-- golarion_holidays: official holidays stay globally unique by name (campaign_id
-- IS NULL); two campaigns may define same-named custom holidays. The plain
-- UNIQUE (name) constraint is dropped AFTER migration 041 (which relies on
-- ON CONFLICT (name) for its seed data) has run.
ALTER TABLE golarion_holidays ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES campaigns(id);
CREATE INDEX IF NOT EXISTS idx_golarion_holidays_campaign_id ON golarion_holidays(campaign_id) WHERE campaign_id IS NOT NULL;
COMMENT ON COLUMN golarion_holidays.campaign_id IS 'NULL = official/global holiday shared by all campaigns; non-NULL = campaign-specific custom holiday.';

ALTER TABLE golarion_holidays DROP CONSTRAINT IF EXISTS golarion_holidays_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS golarion_holidays_global_name_key
    ON golarion_holidays(name) WHERE campaign_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS golarion_holidays_campaign_name_key
    ON golarion_holidays(campaign_id, name) WHERE campaign_id IS NOT NULL;
