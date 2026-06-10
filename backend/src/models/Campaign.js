// src/models/Campaign.js
const dbUtils = require('../utils/dbUtils');

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

    return campaign;
  });
};

module.exports = exports;
