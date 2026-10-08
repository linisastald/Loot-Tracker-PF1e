-- Migration: 084_retire_global_campaign_settings.sql
-- Description: Remove the deprecated per-campaign rows from the global settings table.
--
-- Migration 048 moved the per-campaign settings into campaign_settings but kept the
-- global rows as a "transition fallback" for campaigns with no row of their own. That
-- fallback is now a trap: a campaign created later without a row for, say, region or
-- campaign_timezone silently inherits whatever the ORIGINAL deployment had, and the
-- global discord_channel_id still names a real channel (campaign 2's on the test
-- instance). Reviewing the test database on 2026-10-08 found campaigns 3 and 4
-- inheriting region and timezone this way.
--
-- What this does, in order:
--   1. For every campaign and every per-campaign setting name EXCEPT the Discord
--      trio, copy the global value into campaign_settings where the campaign has no
--      row, so no campaign changes behaviour today.
--   2. The Discord trio (discord_integration_enabled, discord_channel_id,
--      campaign_role_id) must never be inherited: campaign 1 (the original deployment,
--      DEFAULT_BROKER_CAMPAIGN_ID) gets the global values if it somehow lacks them;
--      every other campaign gets the explicit "unset" rows campaign creation seeds
--      ('0', '', '').
--   3. Delete the deprecated global rows, plus the long-unread 'campaign_name' row
--      (superseded by campaigns.name; nothing reads it).
--
-- After this, a campaign with no row for a setting gets the application's coded
-- default (campaignSettings.getCampaignSetting defaultValue) instead of another
-- campaign's value. The code's fallback branch stays but has nothing to find.
--
-- The settings and campaign_settings tables have no row-level security. Idempotent:
-- inserts use ON CONFLICT DO NOTHING; deletes match nothing on a second run. One
-- transaction. UNTESTED against a real database. Roll-back preview (prints the NOTICE
-- counts, then rolls everything back):
--   sed 's/^COMMIT;$/ROLLBACK;/' backend/migrations/084_retire_global_campaign_settings.sql | psql -d <db> -v ON_ERROR_STOP=1

BEGIN;

DO $$
DECLARE
    n_copied INTEGER;
    n_discord_c1 INTEGER;
    n_discord_unset INTEGER;
    n_deleted INTEGER;
BEGIN
    -- 1. Freeze today's effective value for every campaign (non-Discord names).
    INSERT INTO campaign_settings (campaign_id, name, value, value_type, description)
    SELECT c.id, s.name, s.value, s.value_type, s.description
      FROM campaigns c
     CROSS JOIN settings s
     WHERE s.name IN (
        'campaign_timezone', 'region', 'weather_forecast_days', 'treasure_track',
        'treasure_modifier', 'average_party_level', 'infamy_system_enabled',
        'harrow_system_enabled', 'harrow_current_chapter', 'auto_appraisal_enabled',
        'auto_task_generation', 'default_quantity_enabled', 'default_browser_quantity',
        'auto_split_stacks_enabled'
     )
       AND s.value IS NOT NULL
    ON CONFLICT (campaign_id, name) DO NOTHING;
    GET DIAGNOSTICS n_copied = ROW_COUNT;

    -- 2a. The original deployment keeps its Discord configuration.
    INSERT INTO campaign_settings (campaign_id, name, value, value_type, description)
    SELECT 1, s.name, s.value, s.value_type, s.description
      FROM settings s
     WHERE s.name IN ('discord_integration_enabled', 'discord_channel_id', 'campaign_role_id')
       AND s.value IS NOT NULL
       AND EXISTS (SELECT 1 FROM campaigns WHERE id = 1)
    ON CONFLICT (campaign_id, name) DO NOTHING;
    GET DIAGNOSTICS n_discord_c1 = ROW_COUNT;

    -- 2b. Every other campaign is explicitly unset (same rows campaign creation seeds).
    INSERT INTO campaign_settings (campaign_id, name, value, value_type)
    SELECT c.id, v.name, v.value, v.value_type
      FROM campaigns c
     CROSS JOIN (VALUES
        ('discord_integration_enabled', '0', 'boolean'),
        ('discord_channel_id', '', 'string'),
        ('campaign_role_id', '', 'string')
     ) AS v(name, value, value_type)
     WHERE c.id <> 1
    ON CONFLICT (campaign_id, name) DO NOTHING;
    GET DIAGNOSTICS n_discord_unset = ROW_COUNT;

    -- 3. Retire the global rows.
    DELETE FROM settings
     WHERE name IN (
        'campaign_timezone', 'region', 'weather_forecast_days', 'treasure_track',
        'treasure_modifier', 'average_party_level', 'infamy_system_enabled',
        'harrow_system_enabled', 'harrow_current_chapter', 'auto_appraisal_enabled',
        'auto_task_generation', 'discord_integration_enabled', 'discord_channel_id',
        'campaign_role_id', 'default_quantity_enabled', 'default_browser_quantity',
        'auto_split_stacks_enabled', 'campaign_name'
     );
    GET DIAGNOSTICS n_deleted = ROW_COUNT;

    RAISE NOTICE 'Migration 084: % per-campaign rows copied from global, % Discord rows restored to campaign 1, % Discord rows set to unset on other campaigns, % deprecated global rows deleted',
        n_copied, n_discord_c1, n_discord_unset, n_deleted;
END
$$;

COMMENT ON TABLE settings IS 'Instance-wide settings only (registration_mode, frontend_url, discord_bot_token, openai_key, theme, registrations_open, invite_required). Per-campaign settings live in campaign_settings (migration 084 removed the deprecated copies here).';

COMMIT;
