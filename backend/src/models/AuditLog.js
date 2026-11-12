// backend/src/models/AuditLog.js
//
// Who changed what and when, for loot and gold (migration 086). Entries are
// written on the same client as the change they describe, inside its
// transaction, so an entry never exists without its change or the other way
// round. RLS scopes every read to the active campaign.

const dbUtils = require('../utils/dbUtils');
const campaignContext = require('../utils/campaignContext');

const SUMMARY_MAX = 255;

/** Actions a DM can reverse from the History page (anything else is a record only). */
exports.UNDOABLE_ACTIONS = [
  'loot.create', 'loot.status', 'loot.restore', 'loot.update', 'loot.identify', 'loot.consume', 'loot.charges',
  'gold.create', 'gold.distribute', 'gold.balance', 'sale',
];

const fit = (text) => (text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 3)}...` : text);

/**
 * Write one entry on the given client (inside the caller's transaction).
 * campaign_id is passed explicitly when the context names a campaign, so the
 * row is right even if the GUC default ever changes; in cross-campaign mode
 * ('all') the column default applies and the insert fails, which is intended:
 * nothing audited runs outside a campaign.
 *
 * @param {Object} client - pg client inside a transaction
 * @param {Object} entry - { userId, action, entityType, entityIds, before, after, summary, undoOf }
 * @return {Promise<Object>} the inserted row
 */
exports.record = async (client, entry) => {
  const campaignId = parseInt(campaignContext.getCampaignId(), 10);
  const columns = ['user_id', 'action', 'entity_type', 'entity_ids', 'before', 'after', 'summary', 'undo_of'];
  const values = [
    entry.userId ?? null,
    entry.action,
    entry.entityType,
    entry.entityIds || [],
    entry.before === undefined ? null : JSON.stringify(entry.before),
    entry.after === undefined ? null : JSON.stringify(entry.after),
    fit(entry.summary),
    entry.undoOf ?? null,
  ];
  if (Number.isInteger(campaignId)) {
    columns.push('campaign_id');
    values.push(campaignId);
  }
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const result = await client.query(
    `INSERT INTO audit_log (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );
  return result.rows[0];
};

/**
 * Page of entries, newest first, with the actor's username.
 * @param {Object} options - { limit, offset, entityType, action }
 * @return {Promise<{rows: Array, total: number}>}
 */
exports.list = async ({ limit = 50, offset = 0, entityType, action } = {}) => {
  const where = [];
  const params = [];
  if (entityType) {
    params.push(entityType);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (action) {
    params.push(action);
    where.push(`a.action = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const count = await dbUtils.executeQuery(`SELECT COUNT(*)::int AS total FROM audit_log a ${whereSql}`, params);
  const result = await dbUtils.executeQuery(
    `SELECT a.*, u.username, ub.username AS undone_by_username
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN users ub ON ub.id = a.undone_by
     ${whereSql}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { rows: result.rows, total: count.rows[0].total };
};

/**
 * One entry, locked for the rest of the transaction (undo reads it, checks it,
 * then stamps it; the lock keeps two undo clicks from both succeeding).
 */
exports.getForUpdate = async (client, id) => {
  const result = await client.query('SELECT * FROM audit_log WHERE id = $1 FOR UPDATE', [id]);
  return result.rows[0] || null;
};

/**
 * Entries newer than the given one that touched any of the same rows and have
 * not themselves been undone. The undo of an entry is refused while any exist,
 * so changes are reversed newest first and a snapshot is never written over a
 * later edit.
 */
exports.laterEntriesOn = async (client, entry) => {
  const result = await client.query(
    `SELECT id, action, summary FROM audit_log
     WHERE id > $1 AND entity_type = $2 AND entity_ids && $3::int[]
       AND undone_at IS NULL AND action <> 'undo'
     ORDER BY id`,
    [entry.id, entry.entity_type, entry.entity_ids]
  );
  return result.rows;
};

exports.markUndone = async (client, id, userId) => {
  await client.query('UPDATE audit_log SET undone_at = NOW(), undone_by = $2 WHERE id = $1', [id, userId]);
};

/**
 * For each loot id, the status and holder it had before its most recent
 * (not undone) trashing, read from the log. Ids with no such entry are absent.
 * @return {Promise<Object>} { [lootId]: { status, whohas } }
 */
exports.statusBeforeTrash = async (client, lootIds) => {
  const result = await client.query(
    `SELECT a.id, a.before FROM audit_log a
     WHERE a.entity_type = 'loot' AND a.entity_ids && $1::int[]
       AND a.undone_at IS NULL AND a.action IN ('loot.status', 'loot.update', 'loot.consume', 'loot.charges')
       AND (a.after ->> 'status') = 'Trashed'
     ORDER BY a.id DESC`,
    [lootIds]
  );
  const found = {};
  for (const row of result.rows) {
    const rows = Array.isArray(row.before) ? row.before : [row.before];
    for (const snapshot of rows) {
      if (snapshot && lootIds.includes(snapshot.id) && found[snapshot.id] === undefined) {
        found[snapshot.id] = { status: snapshot.status ?? null, whohas: snapshot.whohas ?? null };
      }
    }
  }
  return found;
};
