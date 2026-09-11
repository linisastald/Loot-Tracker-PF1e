// backend/src/models/SessionTask.js
//
// Data access for DM-editable session task definitions (the pre/during/post
// task pools dealt out by the Tasks page). All queries go through dbUtils,
// which sets the app.current_campaign GUC per request, so Row-Level Security
// scopes every read/write to the active campaign - no explicit campaign_id
// filtering needed. The one exception is seedDefaults(), which runs inside
// Campaign.create()'s transaction for a brand-new campaign and therefore
// passes campaign_id explicitly.

const dbUtils = require('../utils/dbUtils');
const { DEFAULT_SESSION_TASKS } = require('../constants/sessionTaskDefaults');

const COLUMNS = 'id, phase, name, quantity, min_characters, is_snack_master, sort_order, created_at, updated_at';

/**
 * All task definitions for the active campaign, ordered by phase then sort order.
 * @return {Promise<Array<Object>>}
 */
exports.getAll = async () => {
  const result = await dbUtils.executeQuery(
    `SELECT ${COLUMNS}
     FROM session_task_definition
     ORDER BY CASE phase WHEN 'pre' THEN 1 WHEN 'during' THEN 2 ELSE 3 END, sort_order, id`
  );
  return result.rows;
};

/**
 * One task definition (campaign-scoped by RLS), or null.
 * @param {number} id
 */
exports.getById = async (id) => {
  const result = await dbUtils.executeQuery(
    `SELECT ${COLUMNS} FROM session_task_definition WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Create a task at the end of its phase's list.
 * @param {{phase:string, name:string, quantity:number, min_characters:number|null, is_snack_master:boolean}} data
 */
exports.create = async ({ phase, name, quantity, min_characters, is_snack_master }) => {
  const result = await dbUtils.executeQuery(
    `INSERT INTO session_task_definition (phase, name, quantity, min_characters, is_snack_master, sort_order)
     VALUES ($1, $2, $3, $4, $5,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM session_task_definition WHERE phase = $1))
     RETURNING ${COLUMNS}`,
    [phase, name, quantity, min_characters, is_snack_master]
  );
  return result.rows[0];
};

/**
 * Update a task's editable fields. Returns the updated row or null if the id
 * is not visible in the active campaign.
 * @param {number} id
 * @param {{phase:string, name:string, quantity:number, min_characters:number|null, is_snack_master:boolean}} data
 */
exports.update = async (id, { phase, name, quantity, min_characters, is_snack_master }) => {
  const result = await dbUtils.executeQuery(
    `UPDATE session_task_definition
     SET phase = $2, name = $3, quantity = $4, min_characters = $5, is_snack_master = $6, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, phase, name, quantity, min_characters, is_snack_master]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete a task definition. Returns true when a row was removed.
 * @param {number} id
 */
exports.remove = async (id) => {
  const result = await dbUtils.executeQuery(
    'DELETE FROM session_task_definition WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows.length > 0;
};

/**
 * Clear the snack-master flag from every task except the given id, so at most
 * one task designates the Snack Master.
 * @param {number|null} keepId - id to leave flagged (null = clear all)
 */
exports.clearSnackMasterExcept = async (keepId) => {
  await dbUtils.executeQuery(
    'UPDATE session_task_definition SET is_snack_master = false, updated_at = NOW() WHERE is_snack_master = true AND ($1::int IS NULL OR id <> $1)',
    [keepId]
  );
};

/**
 * Re-sequence a phase's tasks to match the given id order. Ids not visible in
 * the active campaign are ignored by RLS (UPDATE affects 0 rows).
 * @param {string} phase
 * @param {number[]} orderedIds
 */
exports.reorder = async (phase, orderedIds) => {
  await dbUtils.executeTransaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE session_task_definition SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND phase = $3',
        [i + 1, orderedIds[i], phase]
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
 * Replace the active campaign's task list with the stock defaults.
 * @param {number} campaignId - the active campaign (from req.campaignId)
 */
exports.resetDefaults = async (campaignId) => {
  await dbUtils.executeTransaction(async (client) => {
    await client.query('DELETE FROM session_task_definition WHERE campaign_id = $1', [campaignId]);
    await exports.seedDefaults(client, campaignId);
  });
  return exports.getAll();
};
