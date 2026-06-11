// src/models/Campaign.js
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

/**
 * Get all campaigns a user is a member of, with the user's per-campaign role.
 * @param {number} userId
 * @return {Promise<Array>} [{ id, name, slug, world, is_active, role }] ordered by campaign id
 */
exports.getForUser = async (userId) => {
  const query = `
    SELECT c.id, c.name, c.slug, c.world, c.is_active, uc.role
    FROM user_campaign uc
    JOIN campaigns c ON c.id = uc.campaign_id
    WHERE uc.user_id = $1
    ORDER BY c.id
  `;
  const result = await dbUtils.executeQuery(query, [userId]);
  return result.rows;
};

/**
 * Get all campaigns (superadmin listing).
 * @return {Promise<Array>} All campaign rows ordered by id
 */
exports.getAll = async () => {
  const query = `
    SELECT id, name, slug, world, is_active
    FROM campaigns
    ORDER BY id
  `;
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};

/**
 * Get a campaign by ID.
 * @param {number} id
 * @return {Promise<Object|null>} Campaign or null
 */
exports.getById = async (id) => {
  const query = 'SELECT id, name, slug, world, is_active FROM campaigns WHERE id = $1';
  const result = await dbUtils.executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Get a campaign's display name (campaigns.name) by id.
 *
 * Branding helper for Discord embed titles etc. Callers must resolve the
 * campaign id explicitly (req.campaignId in request paths, the per-row
 * campaignContext id in background paths) and fall back to the static
 * APP_NAME when this returns null (campaign row missing).
 *
 * @param {number|string} id - Campaign id
 * @return {Promise<string|null>} The campaign name, or null when not found
 */
exports.getNameById = async (id) => {
  const result = await dbUtils.executeQuery(
    'SELECT name FROM campaigns WHERE id = $1',
    [id]
  );
  return result.rows.length > 0 ? result.rows[0].name : null;
};

/**
 * Get a user's membership row for a specific campaign.
 *
 * user_campaign has no RLS, so this works regardless of the active campaign
 * context (in particular when checking membership in a campaign other than
 * the requester's current one, e.g. during invite redemption).
 *
 * @param {number} userId
 * @param {number} campaignId
 * @return {Promise<Object|null>} { role, joined_at } or null when not a member
 */
exports.getMembership = async (userId, campaignId) => {
  const result = await dbUtils.executeQuery(
    'SELECT role, joined_at FROM user_campaign WHERE user_id = $1 AND campaign_id = $2',
    [userId, campaignId]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Get a campaign's member roster (user_campaign joined with users), ordered
 * by username.
 *
 * Neither table has RLS — the explicit campaign_id predicate is the scope.
 *
 * @param {number} campaignId
 * @return {Promise<Array>} [{ user_id, username, email, role, joined_at }]
 */
exports.getMembers = async (campaignId) => {
  const result = await dbUtils.executeQuery(
    `SELECT uc.user_id, u.username, u.email, uc.role, uc.joined_at
     FROM user_campaign uc
     JOIN users u ON u.id = uc.user_id
     WHERE uc.campaign_id = $1
       AND u.role != 'deleted'
     ORDER BY u.username`,
    [campaignId]
  );
  return result.rows;
};

/**
 * Remove a user's membership in a campaign (deletes the user_campaign row
 * only — the user ACCOUNT is never touched).
 *
 * @param {number} campaignId
 * @param {number} userId
 * @return {Promise<boolean>} True when a membership row was deleted
 */
exports.removeMember = async (campaignId, userId) => {
  const result = await dbUtils.executeQuery(
    'DELETE FROM user_campaign WHERE campaign_id = $1 AND user_id = $2',
    [campaignId, userId]
  );
  return result.rowCount > 0;
};

/**
 * Get a campaign's settings as a { name: value } map.
 *
 * Rows with value_type 'json' are JSON.parsed; a row whose value fails to
 * parse is skipped with a warning (a corrupt setting must not break the
 * endpoint). All other value_types are returned as the raw stored string.
 * campaign_settings has no RLS — the explicit campaign_id predicate is the
 * scope.
 *
 * @param {number} campaignId
 * @return {Promise<Object>} Map of setting name to (parsed) value; {} when none
 */
exports.getSettingsMap = async (campaignId) => {
  const result = await dbUtils.executeQuery(
    'SELECT name, value, value_type FROM campaign_settings WHERE campaign_id = $1',
    [campaignId]
  );

  const settings = {};
  for (const row of result.rows) {
    // A NULL value carries no usable setting (clears are DELETEs, so this
    // only happens via manual edits) — treat as absent
    if (row.value === null) {
      continue;
    }
    if (row.value_type === 'json') {
      try {
        settings[row.name] = JSON.parse(row.value);
      } catch (error) {
        logger.warn(`Skipping unparseable JSON campaign setting '${row.name}' for campaign ${campaignId}: ${error.message}`);
      }
    } else {
      settings[row.name] = row.value;
    }
  }
  return settings;
};

/**
 * Upsert a campaign setting (UNIQUE (campaign_id, name) is the conflict target).
 *
 * @param {number} campaignId
 * @param {string} name - Setting name (whitelisted by the controller)
 * @param {string} value - Stored value (already serialized by the caller)
 * @param {string} valueType - Type hint for parsing on read ('string', 'json', ...)
 * @return {Promise<Object>} { name, value, value_type } as stored
 */
exports.upsertSetting = async (campaignId, name, value, valueType = 'string') => {
  const result = await dbUtils.executeQuery(
    `INSERT INTO campaign_settings (campaign_id, name, value, value_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id, name)
     DO UPDATE SET value = EXCLUDED.value, value_type = EXCLUDED.value_type, updated_at = NOW()
     RETURNING name, value, value_type`,
    [campaignId, name, value, valueType]
  );
  return result.rows[0];
};

/**
 * Delete a campaign setting (absence of a row = "use the global default").
 *
 * @param {number} campaignId
 * @param {string} name
 * @return {Promise<boolean>} True when a row was deleted
 */
exports.deleteSetting = async (campaignId, name) => {
  const result = await dbUtils.executeQuery(
    'DELETE FROM campaign_settings WHERE campaign_id = $1 AND name = $2',
    [campaignId, name]
  );
  return result.rowCount > 0;
};

/**
 * Rename a campaign (campaigns.name only — the slug is stable and unchanged).
 *
 * @param {number} id - Campaign id
 * @param {string} name - New display name (validated by the controller)
 * @return {Promise<Object|null>} The updated campaign row, or null when the
 *   campaign does not exist
 */
exports.updateName = async (id, name) => {
  const result = await dbUtils.executeQuery(
    `UPDATE campaigns
     SET name = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, slug, world, is_active`,
    [name, id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Create a campaign and grant the creator DM membership, atomically.
 *
 * The slug must already be normalized (lowercase, alphanumeric + hyphens) by
 * the caller; a duplicate slug surfaces as a UNIQUE violation
 * (error.code === '23505') for the controller to translate into a
 * validation error.
 *
 * @param {Object} data
 * @param {string} data.name - Campaign name
 * @param {string} data.slug - URL-safe unique identifier
 * @param {string} data.world - Game world (e.g. 'Golarion')
 * @param {number} data.createdById - User ID of the creator (becomes DM)
 * @return {Promise<Object>} The created campaign row
 */
exports.create = async ({ name, slug, world, createdById }) => {
  return await dbUtils.executeTransaction(async (client) => {
    const insertResult = await client.query(
      `INSERT INTO campaigns (name, slug, world, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, world, is_active, created_by, created_at`,
      [name, slug, world, createdById]
    );
    const campaign = insertResult.rows[0];

    // The creator is always a DM in the campaign they create
    await client.query(
      `INSERT INTO user_campaign (user_id, campaign_id, role)
       VALUES ($1, $2, 'DM')`,
      [createdById, campaign.id]
    );

    // Seed explicit EMPTY Discord settings: without rows, the
    // campaignSettings global fallback would resolve the ORIGINAL
    // deployment's discord_channel_id / campaign_role_id / integration flag
    // for this brand-new campaign — its session announcements would post
    // into another campaign's Discord channel. An '' / '0' row is
    // authoritative ("explicitly unset"), so the fallback never fires.
    await client.query(
      `INSERT INTO campaign_settings (campaign_id, name, value, value_type)
       VALUES
         ($1, 'discord_integration_enabled', '0', 'boolean'),
         ($1, 'discord_channel_id', '', 'string'),
         ($1, 'campaign_role_id', '', 'string')
       ON CONFLICT (campaign_id, name) DO NOTHING`,
      [campaign.id]
    );

    return campaign;
  });
};

module.exports = exports;
