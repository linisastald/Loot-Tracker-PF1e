-- Migration: 048_campaign_settings_split.sql
-- Description: Multi-campaign refactor Phase 4c - split per-campaign settings
--   out of the global settings table into campaign_settings.
--
--   Seeds campaign_settings for EVERY existing campaign with the current
--   global values of the per-campaign setting names, so each campaign keeps
--   today's behavior after application code switches to per-campaign reads.
--
--   The global settings rows are intentionally LEFT IN PLACE (deprecated):
--   they serve as the transition fallback for campaigns with no
--   campaign_settings row (e.g. campaigns created after this migration get no
--   rows here and inherit the global value until a DM configures them).
--
--   IMPORTANT for future code: application code must read/write these setting
--   names through backend/src/utils/campaignSettings.js (which scopes by
--   campaign_id and implements the global fallback) — NEVER from the global
--   settings table directly.
--
--   NOTE: campaign_name is NOT seeded here. It is superseded by
--   campaigns.name (renamed via PATCH /api/campaigns/current); the global
--   campaign_name row stays as deprecated deployment branding.
--
-- This migration is IDEMPOTENT: ON CONFLICT (campaign_id, name) DO NOTHING
-- skips campaigns/names that already have a per-campaign row, and the
-- description updates are guarded. The migration runner wraps this file in a
-- transaction automatically.

-- ============================================================================
-- 1. Seed per-campaign rows from the current global values
-- ============================================================================

INSERT INTO campaign_settings (campaign_id, name, value, value_type, description)
SELECT c.id, s.name, s.value, s.value_type, s.description
FROM campaigns c
CROSS JOIN settings s
WHERE s.name IN (
    'campaign_timezone',
    'region',
    'weather_forecast_days',
    'treasure_track',
    'treasure_modifier',
    'infamy_system_enabled',
    'auto_appraisal_enabled',
    'auto_task_generation',
    'discord_integration_enabled',
    'discord_channel_id',
    'campaign_role_id'
)
ON CONFLICT (campaign_id, name) DO NOTHING;

-- ============================================================================
-- 2. Mark the superseded global rows as deprecated (rows are kept as the
--    transition fallback for campaigns without per-campaign rows)
-- ============================================================================

UPDATE settings
SET description = 'DEPRECATED (moved to campaign_settings; kept only as the per-campaign fallback): '
                  || COALESCE(description, '')
WHERE name IN (
    'campaign_timezone',
    'region',
    'weather_forecast_days',
    'treasure_track',
    'treasure_modifier',
    'infamy_system_enabled',
    'auto_appraisal_enabled',
    'auto_task_generation',
    'discord_integration_enabled',
    'discord_channel_id',
    'campaign_role_id'
)
AND (description IS NULL OR description NOT LIKE 'DEPRECATED (moved to campaign_settings%');

COMMENT ON TABLE campaign_settings IS 'Per-campaign settings (campaign_timezone, region, weather_forecast_days, treasure_track, treasure_modifier, infamy_system_enabled, auto_appraisal_enabled, auto_task_generation, discord_integration_enabled, discord_channel_id, campaign_role_id, theme). Read/write via backend/src/utils/campaignSettings.js, never via the global settings table.';
