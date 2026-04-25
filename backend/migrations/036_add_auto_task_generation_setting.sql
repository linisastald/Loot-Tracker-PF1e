-- Migration: Add auto_task_generation_enabled setting
-- Controls whether the hourly cron in SessionSchedulerService.checkTaskGeneration
-- generates per-session task assignments and posts the Discord embed.
-- Default '0' (disabled) so existing installs don't get unexpected behavior;
-- DMs opt in via the Campaign Settings toggle.

INSERT INTO settings (name, value, value_type, description)
VALUES (
    'auto_task_generation_enabled',
    '0',
    'boolean',
    'When enabled (1), the scheduler auto-assigns pre/during/post-session tasks for confirmed sessions starting within the next 4 hours and posts them to the configured Discord channel. Default off.'
)
ON CONFLICT (name) DO NOTHING;
