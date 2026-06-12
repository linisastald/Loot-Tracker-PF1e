// src/utils/campaignSettings.js
//
// Per-campaign settings access (multi-campaign refactor Phase 4c).
//
// Campaign-scoped settings live in campaign_settings(campaign_id, name, value,
// value_type) — see migration 048. The table has NO row-level security, so
// every query here filters by an explicit campaign_id. The campaign id is
// resolved from the active campaignContext when the caller does not pass one
// explicitly; background code running in cross-campaign ('all') mode MUST pass
// an explicit campaignId (per-row, from the row it is processing) — resolving
// 'all' implicitly is a programming error and throws.
//
// Transition safety: when a campaign has NO row for a setting (a campaign
// created before the split, or a deployment whose migration 048 missed a
// name), reads FALL BACK to the deprecated global settings table, then to the
// caller's defaultValue. A row that exists — even with an empty-string value —
// is authoritative and suppresses the global fallback.
//
// All application code must read/write the per-campaign setting names through
// this helper; never query the global settings table for them directly.

const dbUtils = require('./dbUtils');
const campaignContext = require('./campaignContext');

/**
 * Setting names that are per-campaign (stored in campaign_settings).
 * Generic global-settings write endpoints reject these names so a DM can
 * never silently change another campaign's behavior through a global row.
 *
 * NOTE: 'theme' is also a per-campaign setting (campaign_settings, value_type
 * 'json') but is intentionally NOT in this list: the global 'theme' row is the
 * legitimate global default and must stay writable through the old endpoints.
 * 'campaign_name' is deprecated (superseded by campaigns.name, renamed via
 * PATCH /api/campaigns/current) and handled separately.
 *
 * @type {Array<string>}
 */
const PER_CAMPAIGN_SETTINGS = [
  'campaign_timezone',
  'region',
  'weather_forecast_days',
  'treasure_track',
  'treasure_modifier',
  'average_party_level',
  'infamy_system_enabled',
  'harrow_system_enabled',
  'harrow_current_chapter',
  'auto_appraisal_enabled',
  'auto_task_generation',
  'discord_integration_enabled',
  'discord_channel_id',
  'campaign_role_id',
];

/**
 * Resolve the campaign id to use for a settings query.
 *
 * @param {number|string} [campaignId] - Explicit campaign id; when omitted the
 *   active campaignContext is used
 * @return {string} A digit-string campaign id
 * @throws {Error} When an explicit id is malformed, or when no explicit id was
 *   given and the active context is the cross-campaign 'all' sentinel —
 *   background jobs must pass the campaign id of the row they are processing
 */
const resolveCampaignId = (campaignId) => {
  if (campaignId !== undefined && campaignId !== null) {
    const id = String(campaignId);
    if (!/^\d+$/.test(id)) {
      throw new Error(`Invalid campaign id for campaign settings: ${id}`);
    }
    return id;
  }

  const contextId = campaignContext.getCampaignId();
  if (contextId === 'all') {
    throw new Error(
      "Cannot resolve a campaign setting in cross-campaign ('all') context: " +
      'pass an explicit campaignId (background jobs must use the campaign id of the row being processed)'
    );
  }
  return contextId;
};

/**
 * Read one per-campaign setting value.
 *
 * Resolution order:
 *  1. campaign_settings row for the campaign (a row with a non-NULL value is
 *     authoritative, even when the value is an empty string);
 *  2. the deprecated global settings row (transition fallback);
 *  3. defaultValue.
 *
 * @param {string} name - Setting name
 * @param {Object} [options]
 * @param {number|string} [options.campaignId] - Explicit campaign id; defaults
 *   to the active campaign context (throws in 'all' context — see resolveCampaignId)
 * @param {*} [options.defaultValue] - Returned when neither table has a value
 * @return {Promise<*>} The setting value (raw stored string) or defaultValue
 */
const getCampaignSetting = async (name, { campaignId, defaultValue } = {}) => {
  const id = resolveCampaignId(campaignId);

  const result = await dbUtils.executeQuery(
    'SELECT value FROM campaign_settings WHERE campaign_id = $1 AND name = $2',
    [id, name]
  );
  if (result.rows.length > 0 && result.rows[0].value !== null) {
    return result.rows[0].value;
  }

  // Transition fallback: deprecated global settings row
  const globalResult = await dbUtils.executeQuery(
    'SELECT value FROM settings WHERE name = $1',
    [name]
  );
  if (globalResult.rows.length > 0 && globalResult.rows[0].value !== null) {
    return globalResult.rows[0].value;
  }

  return defaultValue;
};

/**
 * Batch read of per-campaign settings (one campaign_settings query plus, when
 * some names are missing, one global-fallback query). Names with no value in
 * either table are absent from the returned map.
 *
 * @param {Array<string>} names - Setting names to read
 * @param {Object} [options]
 * @param {number|string} [options.campaignId] - Explicit campaign id; defaults
 *   to the active campaign context (throws in 'all' context)
 * @return {Promise<Object>} Map of setting name to raw stored string value
 */
const getCampaignSettings = async (names, { campaignId } = {}) => {
  const id = resolveCampaignId(campaignId);
  const map = {};

  if (!Array.isArray(names) || names.length === 0) {
    return map;
  }

  const result = await dbUtils.executeQuery(
    'SELECT name, value FROM campaign_settings WHERE campaign_id = $1 AND name = ANY($2)',
    [id, names]
  );
  for (const row of result.rows) {
    if (row.value !== null) {
      map[row.name] = row.value;
    }
  }

  // Transition fallback for the names with no per-campaign row
  const missing = names.filter((name) => !(name in map));
  if (missing.length > 0) {
    const globalResult = await dbUtils.executeQuery(
      'SELECT name, value FROM settings WHERE name = ANY($1)',
      [missing]
    );
    for (const row of globalResult.rows) {
      if (row.value !== null) {
        map[row.name] = row.value;
      }
    }
  }

  return map;
};

/**
 * Upsert one per-campaign setting (UNIQUE (campaign_id, name) is the conflict
 * target). Values are stored as strings; pass '' (not null) to record an
 * explicit "unset" that suppresses the global fallback.
 *
 * @param {string} name - Setting name
 * @param {*} value - Value to store (coerced to string)
 * @param {string} [valueType='string'] - Type hint for parsing on read
 * @param {Object} [options]
 * @param {number|string} [options.campaignId] - Explicit campaign id; defaults
 *   to the active campaign context (throws in 'all' context)
 * @return {Promise<Object>} { name, value, value_type } as stored
 */
const setCampaignSetting = async (name, value, valueType = 'string', { campaignId } = {}) => {
  const id = resolveCampaignId(campaignId);

  const result = await dbUtils.executeQuery(
    `INSERT INTO campaign_settings (campaign_id, name, value, value_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id, name)
     DO UPDATE SET value = EXCLUDED.value, value_type = EXCLUDED.value_type, updated_at = NOW()
     RETURNING name, value, value_type`,
    [id, name, String(value), valueType]
  );
  return result.rows[0];
};

module.exports = {
  PER_CAMPAIGN_SETTINGS,
  resolveCampaignId,
  getCampaignSetting,
  getCampaignSettings,
  setCampaignSetting,
};
