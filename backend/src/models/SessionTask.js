// backend/src/models/SessionTask.js
//
// Data access for DM-editable session task definitions (the pre/during/post
// task pools dealt out by the Tasks page) and their per-task options.
//
// Row-Level Security on session_task_definition scopes every query to the
// request's campaign (dbUtils sets the app.current_campaign GUC). Every query
// here ALSO carries an explicit campaign_id predicate (from req.campaignId) as
// defence in depth: migration 058 seeded every campaign, so an unscoped read
// on an owner/admin connection would deal out every campaign's tasks at once.

const dbUtils = require('../utils/dbUtils');
const {
  DEFAULT_SESSION_TASKS,
  TASK_OPTION_DEFAULTS,
  TASK_OPTION_FIELDS,
} = require('../constants/sessionTaskDefaults');

// Everything the DM can edit: phase, name, then every option column.
const EDITABLE_FIELDS = ['phase', 'name', ...TASK_OPTION_FIELDS];

const COLUMNS = ['id', ...EDITABLE_FIELDS, 'sort_order', 'created_at', 'updated_at'].join(', ');

/** Fill in defaults so callers can pass a partial option set. */
const withDefaults = (data) => ({ ...TASK_OPTION_DEFAULTS, ...data });

/** Values for EDITABLE_FIELDS in order. */
const editableValues = (data) => {
  const full = withDefaults(data);
  return EDITABLE_FIELDS.map((field) => full[field]);
};

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
 * Whether another task in the same phase and campaign already has this name
 * (trimmed, case-insensitive). `excludeId` is the task being edited, so a row
 * may keep its own name; pass null when creating.
 * @param {number} campaignId
 * @param {string} phase
 * @param {string} name
 * @param {number|null} excludeId
 * @return {Promise<boolean>}
 */
exports.nameExists = async (campaignId, phase, name, excludeId) => {
  const result = await dbUtils.executeQuery(
    `SELECT id FROM session_task_definition
     WHERE campaign_id = $1 AND phase = $2
       AND LOWER(BTRIM(name)) = LOWER(BTRIM($3))
       AND ($4::int IS NULL OR id <> $4)
     LIMIT 1`,
    [campaignId, phase, name.trim(), excludeId]
  );
  return result.rows.length > 0;
};

/**
 * Create a task at the end of its phase's list. Any option left out of
 * `data` takes its default from TASK_OPTION_DEFAULTS.
 * @param {number} campaignId
 * @param {Object} data - { phase, name, ...options }
 */
exports.create = async (campaignId, data) => {
  const values = editableValues(data);
  // $1 campaign, $2 phase, $3 name, $4.. options, then the sort_order subquery
  // $2 (phase) is reused in the sort_order subquery cast to text; the VALUES
  // occurrence must carry the same cast or Postgres reports "inconsistent types
  // deduced for parameter $2" (VARCHAR(10) column vs text).
  const placeholders = values.map((_, i) => (i === 0 ? `$${i + 2}::text` : `$${i + 2}`)).join(', ');
  const result = await dbUtils.executeQuery(
    `INSERT INTO session_task_definition (campaign_id, ${EDITABLE_FIELDS.join(', ')}, sort_order)
     VALUES ($1::int, ${placeholders},
             (SELECT COALESCE(MAX(sort_order), 0) + 1
              FROM session_task_definition
              WHERE campaign_id = $1::int AND phase = $2::text))
     RETURNING ${COLUMNS}`,
    [campaignId, ...values]
  );
  return result.rows[0];
};

/**
 * Update a task's editable fields. A task moved to another phase goes to the
 * end of that phase's list (it would otherwise keep its old-phase sort_order
 * and land at an arbitrary position). Returns the updated row or null if the
 * id is not in the campaign.
 * @param {number} campaignId
 * @param {number} id
 * @param {Object} data - { phase, name, ...options }
 */
exports.update = async (campaignId, id, data) => {
  const values = editableValues(data);
  // $3 (phase) is read in three places; every use carries the same ::text cast
  // so Postgres deduces one parameter type. In SET expressions the bare column
  // names still refer to the OLD row, which is what the CASE compares against.
  const assignments = EDITABLE_FIELDS
    .map((field, i) => `${field} = $${i + 3}${i === 0 ? '::text' : ''}`)
    .join(', ');
  const result = await dbUtils.executeQuery(
    `UPDATE session_task_definition
     SET ${assignments},
         sort_order = CASE WHEN phase = $3::text THEN sort_order
                           ELSE (SELECT COALESCE(MAX(t.sort_order), 0) + 1
                                 FROM session_task_definition t
                                 WHERE t.campaign_id = $1 AND t.phase = $3::text)
                      END,
         updated_at = NOW()
     WHERE campaign_id = $1 AND id = $2
     RETURNING ${COLUMNS}`,
    [campaignId, id, ...values]
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
 * Whether a character id belongs to the campaign (for fixed_character_id).
 * The characters table is RLS-scoped, so a foreign campaign's id is invisible.
 * @param {number} characterId
 */
exports.characterExists = async (characterId) => {
  const result = await dbUtils.executeQuery(
    'SELECT id FROM characters WHERE id = $1',
    [characterId]
  );
  return result.rows.length > 0;
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
  // One multi-row INSERT: $1 is the campaign, then (options..., sort_order) per task.
  const width = EDITABLE_FIELDS.length + 1;
  const params = [campaignId];
  const tuples = DEFAULT_SESSION_TASKS.map((task, row) => {
    params.push(...editableValues(task), task.sort_order);
    const slots = Array.from({ length: width }, (_, i) => `$${2 + row * width + i}`);
    return `($1, ${slots.join(', ')})`;
  });
  await client.query(
    `INSERT INTO session_task_definition (campaign_id, ${EDITABLE_FIELDS.join(', ')}, sort_order)
     VALUES ${tuples.join(', ')}`,
    params
  );
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

exports.EDITABLE_FIELDS = EDITABLE_FIELDS;
