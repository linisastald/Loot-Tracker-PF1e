-- Migration: Weather forecast support
-- Description: Adds DM-controlled weather forecasting. A lock flag protects
-- manually set (story) weather from being overwritten by automatic generation
-- or forecast regeneration, and a configurable setting controls how many days
-- ahead of the current date weather is pre-generated (and shown to DMs only).

-- Lock flag: when true, the weather row was set manually by a DM and must
-- never be replaced by automatic generation or forecast regeneration.
ALTER TABLE golarion_weather
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN golarion_weather.is_locked IS
    'When true, this weather was set manually by a DM (story weather) and must not be overwritten by automatic generation or forecast regeneration.';

-- Forecast horizon: number of days ahead of the current Golarion date for
-- which weather is pre-generated. Visible to DMs only; players see weather
-- only up to the current date.
INSERT INTO settings (name, value, value_type, description)
VALUES (
    'weather_forecast_days',
    '7',
    'integer',
    'Number of days ahead of the current Golarion date to pre-generate weather. Visible to DMs only; players see weather only up to the current date.'
)
ON CONFLICT (name) DO NOTHING;
