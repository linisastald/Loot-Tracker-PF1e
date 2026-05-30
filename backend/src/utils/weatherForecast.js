// src/utils/weatherForecast.js
//
// Shared configuration for the weather forecast horizon (how many days ahead
// of the current Golarion date weather is pre-generated and shown to DMs).
// Centralised so the default, the clamp bound, and the setting reader cannot
// drift between the calendar, weather, and settings controllers.

const dbUtils = require('./dbUtils');

// Forecast horizon used when the setting is missing or invalid.
const DEFAULT_FORECAST_DAYS = 7;

// Upper bound on how far ahead weather may be pre-generated.
const MAX_FORECAST_DAYS = 60;

/**
 * Read the configured weather forecast horizon (days ahead of the current
 * date) from settings, clamped to [0, MAX_FORECAST_DAYS]. Falls back to the
 * default if unset/invalid.
 * @returns {Promise<number>}
 */
const getForecastDays = async () => {
  const result = await dbUtils.executeQuery(
    'SELECT value FROM settings WHERE name = $1',
    ['weather_forecast_days']
  );
  const parsed = parseInt(result.rows[0]?.value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_FORECAST_DAYS;
  }
  return Math.min(parsed, MAX_FORECAST_DAYS);
};

module.exports = {
  DEFAULT_FORECAST_DAYS,
  MAX_FORECAST_DAYS,
  getForecastDays,
};
