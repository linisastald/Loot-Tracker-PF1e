-- Migration: 049_apl_per_campaign.sql
-- Description: Multi-campaign refactor Phase 5b - make average_party_level a
--   per-campaign setting (it drives per-campaign game math: the infamy check
--   DC is 15 + 2 x APL, and the APL endpoint feeds city-services lookups).
--
--   Seeds campaign_settings for EVERY existing campaign with the current
--   global average_party_level value, so each campaign keeps today's
--   behavior after application code switches to per-campaign reads
--   (backend/src/utils/campaignSettings.js, same pattern as migration 048).
--
--   The global settings row is intentionally LEFT IN PLACE (deprecated): it
--   serves as the transition fallback for campaigns with no campaign_settings
--   row (campaigns created after this migration inherit the global value
--   until a DM configures their own).
--
--   IMPORTANT for future code: application code must read/write
--   average_party_level through backend/src/utils/campaignSettings.js —
--   NEVER from the global settings table directly. The generic global
--   update-setting endpoints reject the name (PER_CAMPAIGN_SETTINGS guard);
--   it is written via PUT /api/campaigns/current/settings, which validates an
--   integer 1-30 and stores value_type 'integer'.
--
-- This migration is IDEMPOTENT: ON CONFLICT (campaign_id, name) DO NOTHING
-- skips campaigns that already have a per-campaign row, and the description
-- update is guarded. The migration runner wraps this file in a transaction
-- automatically.

-- ============================================================================
-- 1. Seed per-campaign rows from the current global value
--    (value_type is copied as-is, like 048; new writes through the campaign
--    endpoint store 'integer')
-- ============================================================================

INSERT INTO campaign_settings (campaign_id, name, value, value_type, description)
SELECT c.id, s.name, s.value, s.value_type, s.description
FROM campaigns c
CROSS JOIN settings s
WHERE s.name = 'average_party_level'
ON CONFLICT (campaign_id, name) DO NOTHING;

-- ============================================================================
-- 2. Mark the superseded global row as deprecated (the row is kept as the
--    transition fallback for campaigns without a per-campaign row)
-- ============================================================================

UPDATE settings
SET description = 'DEPRECATED (moved to campaign_settings; kept only as the per-campaign fallback): '
                  || COALESCE(description, '')
WHERE name = 'average_party_level'
AND (description IS NULL OR description NOT LIKE 'DEPRECATED (moved to campaign_settings%');

COMMENT ON TABLE campaign_settings IS 'Per-campaign settings (campaign_timezone, region, weather_forecast_days, treasure_track, treasure_modifier, average_party_level, infamy_system_enabled, auto_appraisal_enabled, auto_task_generation, discord_integration_enabled, discord_channel_id, campaign_role_id, theme). Read/write via backend/src/utils/campaignSettings.js, never via the global settings table.';
