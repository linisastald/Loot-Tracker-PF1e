// backend/src/models/SessionTask.js
//
// Data access for DM-editable session task definitions (the pre/during/post
// task pools dealt out by the Tasks page).
//
// Row-Level Security on session_task_definition scopes every query to the
// request's campaign (dbUtils sets the app.current_campaign GUC). Every query
// here ALSO carries an explicit campaign_id predicate (from req.campaignId) as
// defence in depth: migration 058 seeded every campaign, so an unscoped read
// on an owner/admin connection would deal out every campaign's tasks at once.

const dbUtils = require('../utils/dbUtils');
const { DEFAULT_SESSION_TASKS } = require('../constants/sessionTaskDefaults');

const COLUMNS = 'id, phase, name, quantity, min_characters, is_snack_master, sort_order, created_at, updated_at';

/**
 * All task definitions for a campaign, ordered by phase then sort order.
 * @param {number} campaignId
 * @return {Promise<Array<Object>>}
 */
exports.getAll = async (campaignId) => {
  const result = await dbUtils.executeQuery(
    `SELECT ${COLUMNS}
     FROM session_task_definition
     WHERE campaign_id = $1
     ORDER BY CASE phase WHEN 'pre' THEN 1 WHEN 'during' THEN 2 ELSE 3 END, sort_order, id`,
    [campaignId]
  );
  return result.rows;
};

/**
 * One task definition in the campaign, or null.
 * @param {number} campaignId
 * @param {number} id
 */
exports.getById = async (campaignId, id) => {
  const result = await dbUtils.executeQuery(
    `SELECT ${COLUMNS} FROM session_task_definition WHERE campaign_id = $1 AND id = $2`,
    [campaignId, id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Create a task at the end of its phase's list.
 * @param {number} campaignId
 * @param {{phase:string, name:string, quantity:number, min_characters:number|null, is_snack_master:boolean}} data
 */
exports.create = async (campaignId, { phase, name, quantity, min_characters, is_snack_master }) => {
  const result = await dbUtils.executeQuery(
    `INSERT INTO session_task_definition (campaign_id, phase, name, quantity, min_characters, is_snack_master, sort_order)
     VALUES ($1::int, $2::text, $3, $4, $5, $6,
             (SELECT COALESCE(MAX(sort_order), 0) + 1
              FROM session_task_definition
              WHERE campaign_id = $1::int AND phase = $2::text))
     RETURNING ${COLUMNS}`,
    [campaignId, phase, name, quantity, min_characters, is_snack_master]
  );
  return result.rows[0];
};

/**
 * Update a task's editable fields. Returns the updated row or null if the id
 * is not in the campaign.
 * @param {number} campaignId
 * @param {number} id
 * @param {{phase:string, name:string, quantity:number, min_characters:number|null, is_snack_master:boolean}} data
 */
exports.update = async (campaignId, id, { phase, name, quantity, min_characters, is_snack_master }) => {
  const result = await dbUtils.executeQuery(
    `UPDATE session_task_definition
     SET phase = $3, name = $4, quantity = $5, min_characters = $6, is_snack_master = $7, updated_at = NOW()
     WHERE campaign_id = $1 AND id = $2
     RETURNING ${COLUMNS}`,
    [campaignId, id, phase, name, quantity, min_characters, is_snack_master]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete a task definition. Returns true when a row was removed.
 * @param {number} campaignId
 * @param {number} id
 */
exports.remove = async (campaignId, id) => {
  const result = await dbUtils.executeQuery(
    'DELETE FROM session_task_definition WHERE campaign_id = $1 AND id = $2 RETURNING id',
    [campaignId, id]
  );
  return result.rows.length > 0;
};

/**
 * Clear the snack-master flag from every task in the campaign except the
 * given id, so at most one task designates the Snack Master.
 * @param {number} campaignId
 * @param {number|null} keepId - id to leave flagged (null = clear all)
 */
exports.clearSnackMasterExcept = async (campaignId, keepId) => {
  await dbUtils.executeQuery(
    `UPDATE session_task_definition
     SET is_snack_master = false, updated_at = NOW()
     WHERE campaign_id = $1 AND is_snack_master = true AND ($2::int IS NULL OR id <> $2::int)`,
    [campaignId, keepId]
  );
};

/**
 * Re-sequence a phase's tasks to match the given id order. Ids outside the
 * campaign or phase affect 0 rows.
 * @param {number} campaignId
 * @param {string} phase
 * @param {number[]} orderedIds
 */
exports.reorder = async (campaignId, phase, orderedIds) => {
  await dbUtils.executeTransaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE session_task_definition
         SET sort_order = $1, updated_at = NOW()
         WHERE campaign_id = $2 AND id = $3 AND phase = $4`,
        [i + 1, campaignId, orderedIds[i], phase]
      );
    }
  });
};

/**
 * Insert the stock task list for one campaign. Used inside Campaign.create()'s
 * transaction (explicit campaign_id - the GUC may not point at the new
 * campaign) and by resetDefaults().
 * @param {import('pg').PoolClient} client
 * @param {number} campaignId
 */
exports.seedDefaults = async (client, campaignId) => {
  for (const task of DEFAULT_SESSION_TASKS) {
    await client.query(
      `INSERT INTO session_task_definition (campaign_id, phase, name, quantity, min_characters, is_snack_master, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [campaignId, task.phase, task.name, task.quantity, task.min_characters, task.is_snack_master, task.sort_order]
    );
  }
};

/**
 * Replace a campaign's task list with the stock defaults.
 * @param {number} campaignId
 */
exports.resetDefaults = async (campaignId) => {
  await dbUtils.executeTransaction(async (client) => {
    await client.query('DELETE FROM session_task_definition WHERE campaign_id = $1', [campaignId]);
    await exports.seedDefaults(client, campaignId);
  });
  return exports.getAll(campaignId);
};
