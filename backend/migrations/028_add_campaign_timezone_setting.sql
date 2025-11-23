-- Migration: Add campaign timezone setting for configurable time zone support
-- This allows the application to operate in different time zones without hardcoded assumptions

-- Add campaign_timezone setting with default America/New_York
INSERT INTO settings (name, value, value_type, description)
VALUES (
    'campaign_timezone',
    'America/New_York',
    'text',
    'IANA timezone identifier for the campaign (e.g., America/New_York, America/Chicago, America/Los_Angeles). All session times and cron jobs will use this timezone.'
)
ON CONFLICT (name) DO NOTHING;

-- Add comment to settings table to document timezone usage
COMMENT ON TABLE settings IS 'Application configuration settings including campaign timezone for scheduling';
