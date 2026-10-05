-- Migration: 063_default_quantity_settings_per_campaign.sql
-- Purpose: Move the three non-secret "item entry" defaults out of the
--   deployment-global settings table into campaign_settings, so a per-campaign
--   DM can change them for their own campaign without write access to global
--   settings (global settings are superadmin-only; code-review package S3).
--
-- Seeds one campaign_settings row per existing campaign from the current global
-- value (when a global row exists). Existing global rows are left in place as
-- the transition fallback (campaignSettings.getCampaignSetting falls back to
-- them). Re-running is a no-op (ON CONFLICT DO NOTHING).
--
-- Rollback: DELETE FROM campaign_settings WHERE name IN
--   ('default_quantity_enabled', 'default_browser_quantity', 'auto_split_stacks_enabled');

INSERT INTO campaign_settings (campaign_id, name, value, value_type, description)
SELECT c.id, s.name, s.value, COALESCE(s.value_type, 'string'), s.description
FROM campaigns c
CROSS JOIN settings s
WHERE s.name IN (
    'default_quantity_enabled',
    'default_browser_quantity',
    'auto_split_stacks_enabled'
)
AND s.value IS NOT NULL
ON CONFLICT (campaign_id, name) DO NOTHING;
