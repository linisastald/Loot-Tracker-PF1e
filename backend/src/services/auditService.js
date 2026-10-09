// backend/src/services/auditService.js
//
// Recording helpers for the write paths (each takes the transaction client of
// the change it describes) and the undo of an entry from the History page.
//
// Undo rules:
//   - DM only (route layer) and only for UNDOABLE_ACTIONS;
//   - an entry is undone at most once, and an undo is never undone (no redo);
//   - refused while a later, not-undone entry touched any of the same rows, so
//     changes come off newest first and a snapshot never overwrites a later edit;
//   - gold rows are removed under the ledger lock and refused when a
//     denomination would go negative, same rule as creating an entry.

const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const AuditLog = require('../models/AuditLog');
const Gold = require('../models/Gold');

const CURRENCIES = ['platinum', 'gold', 'silver', 'copper'];
const UNPROCESSED = 'Unprocessed';

const statusLabel = (status) => status || UNPROCESSED;

/** "Sword, Shield, Rope (+4 more)" cut to a sensible length for a summary. */
const nameList = (names, shown = 3) => {
  const list = names.slice(0, shown).join(', ');
  const hidden = names.length - shown;
  return hidden > 0 ? `${list} (+${hidden} more)` : list;
};

const countOf = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const coinText = (row) => {
  const parts = CURRENCIES
    .filter((c) => Number(row[c]) !== 0)
    .map((c) => `${Number(row[c])} ${{ platinum: 'pp', gold: 'gp', silver: 'sp', copper: 'cp' }[c]}`);
  return parts.length ? parts.join(', ') : '0 gp';
};

const snapshotLoot = (row) => ({
  id: row.id, name: row.name, status: row.status ?? null, whohas: row.whohas ?? null,
});

// --- recording -------------------------------------------------------------

/**
 * Loot submitted on the Loot Entry page or committed by the loot generator.
 * `rows` are the inserted loot rows; `source` is 'entry' or 'generator'.
 */
exports.recordLootCreate = (client, { userId, rows, source = 'entry' }) => {
  const names = rows.map((row) => row.name);
  const verb = source === 'generator' ? 'Generated' : 'Entered';
  return AuditLog.record(client, {
    userId,
    action: 'loot.create',
    entityType: 'loot',
    entityIds: rows.map((row) => row.id),
    before: null,
    after: rows.map((row) => ({
      id: row.id, name: row.name, quantity: row.quantity, value: row.value ?? null,
      status: row.status ?? null, unidentified: row.unidentified ?? null,
    })),
    summary: `${verb} ${countOf(rows.length, 'item')}: ${nameList([...new Set(names)])}`,
  });
};

/**
 * Bulk status change. `beforeRows` are the rows as read (id, name, status,
 * whohas) before the UPDATE; `after` is what was set.
 */
exports.recordStatusChange = (client, { userId, beforeRows, status, characterId, restore = false }) => {
  const changed = beforeRows.filter((row) => row.status !== status || (characterId && row.whohas !== characterId));
  const rows = changed.length ? changed : beforeRows;
  const names = rows.map((row) => row.name);
  const summary = restore
    ? `Restored ${countOf(rows.length, 'item')} from Trashed: ${nameList(names)}`
    : `Moved ${countOf(rows.length, 'item')} to ${statusLabel(status)}: ${nameList(names)}`;
  return AuditLog.record(client, {
    userId,
    action: restore ? 'loot.restore' : 'loot.status',
    entityType: 'loot',
    entityIds: rows.map((row) => row.id),
    before: rows.map(snapshotLoot),
    after: { status, ...(characterId ? { whohas: characterId } : {}) },
    summary,
  });
};

/** Restore from trash: each row goes back to its own earlier status. */
exports.recordRestore = (client, { userId, beforeRows, targets }) =>
  AuditLog.record(client, {
    userId,
    action: 'loot.restore',
    entityType: 'loot',
    entityIds: beforeRows.map((row) => row.id),
    before: beforeRows.map(snapshotLoot),
    after: targets,
    summary: `Restored ${countOf(beforeRows.length, 'item')} from Trashed: ${nameList(beforeRows.map((r) => r.name))}`,
  });

/**
 * Field edit of one row. `beforeRow` is the full row before the UPDATE,
 * `fields` the column -> value map written.
 */
exports.recordLootUpdate = (client, { userId, beforeRow, fields }) => {
  const changedColumns = Object.keys(fields).filter((col) => !sameValue(beforeRow[col], fields[col]));
  const columns = changedColumns.length ? changedColumns : Object.keys(fields);
  const before = { id: beforeRow.id, name: beforeRow.name };
  const after = {};
  for (const col of columns) {
    before[col] = beforeRow[col] ?? null;
    after[col] = fields[col] ?? null;
  }
  return AuditLog.record(client, {
    userId,
    action: 'loot.update',
    entityType: 'loot',
    entityIds: [beforeRow.id],
    before,
    after,
    summary: `Edited ${beforeRow.name}: ${columns.join(', ')}`,
  });
};

const sameValue = (a, b) => {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined || a === '') && (b === null || b === undefined || b === '');
  }
  if (a instanceof Date || b instanceof Date) return String(a) === String(b);
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
};

/** Successful identification of one item. */
exports.recordIdentify = (client, { userId, beforeRow, newName }) =>
  AuditLog.record(client, {
    userId,
    action: 'loot.identify',
    entityType: 'loot',
    entityIds: [beforeRow.id],
    before: { id: beforeRow.id, name: beforeRow.name, unidentified: beforeRow.unidentified ?? null },
    after: { id: beforeRow.id, name: newName, unidentified: false },
    summary: `Identified ${beforeRow.name} as ${newName}`,
  });

/** Consumable use (wand charge or one potion/scroll). */
exports.recordConsume = (client, { userId, beforeRow, afterRow, useId, type }) =>
  AuditLog.record(client, {
    userId,
    action: 'loot.consume',
    entityType: 'loot',
    entityIds: [beforeRow.id],
    before: lootQuantitySnapshot(beforeRow),
    after: { ...lootQuantitySnapshot(afterRow), use_id: useId ?? null },
    summary: type === 'wand'
      ? `Used a charge of ${beforeRow.name} (${afterRow.charges} left)`
      : `Used ${beforeRow.name} (${afterRow.quantity} left)`,
  });

/** DM edit of a wand's charges. */
exports.recordCharges = (client, { userId, beforeRow, afterRow }) =>
  AuditLog.record(client, {
    userId,
    action: 'loot.charges',
    entityType: 'loot',
    entityIds: [beforeRow.id],
    before: lootQuantitySnapshot(beforeRow),
    after: lootQuantitySnapshot(afterRow),
    summary: `Set charges of ${beforeRow.name} from ${beforeRow.charges ?? 0} to ${afterRow.charges}`,
  });

const lootQuantitySnapshot = (row) => ({
  id: row.id, name: row.name, charges: row.charges ?? null, quantity: row.quantity, status: row.status ?? null,
});

/** Gold rows written by one request (entry, distribution or balance). */
exports.recordGold = (client, { userId, action, rows }) => {
  const total = {};
  for (const c of CURRENCIES) total[c] = rows.reduce((sum, row) => sum + Number(row[c] || 0), 0);
  let summary;
  if (action === 'gold.distribute') {
    summary = `Distributed ${coinText({ ...total, ...negate(total) })} to ${countOf(rows.length, 'character')}`;
  } else if (action === 'gold.balance') {
    summary = `Balanced currencies (${coinText(total)})`;
  } else {
    const types = [...new Set(rows.map((row) => row.transaction_type))];
    summary = `${types.join('/')} of ${coinText(total)}`;
    const note = rows.length === 1 && rows[0].notes ? `: ${rows[0].notes}` : '';
    summary += note;
  }
  return AuditLog.record(client, {
    userId,
    action,
    entityType: 'gold',
    entityIds: rows.map((row) => row.id),
    before: null,
    after: rows.map(goldSnapshot),
    summary,
  });
};

const negate = (total) => Object.fromEntries(CURRENCIES.map((c) => [c, -total[c]]));

const goldSnapshot = (row) => ({
  id: row.id,
  transaction_type: row.transaction_type,
  platinum: Number(row.platinum || 0),
  gold: Number(row.gold || 0),
  silver: Number(row.silver || 0),
  copper: Number(row.copper || 0),
  notes: row.notes ?? null,
  character_id: row.character_id ?? null,
});

/** A sale: the sold loot rows, their sold-table rows and the gold credit. */
exports.recordSale = (client, { userId, soldItems, soldRowIds, goldRow, totalSold }) =>
  AuditLog.record(client, {
    userId,
    action: 'sale',
    entityType: 'loot',
    entityIds: soldItems.map((item) => item.id),
    before: soldItems.map((item) => ({ id: item.id, name: item.name, status: 'Pending Sale' })),
    after: {
      status: 'Sold',
      sold_ids: soldRowIds,
      gold: goldRow ? goldSnapshot(goldRow) : null,
      total: totalSold,
    },
    summary: `Sold ${countOf(soldItems.length, 'item')} for ${Number(totalSold).toFixed(2)} gp: ${nameList(soldItems.map((i) => i.name))}`,
  });

// --- undo ------------------------------------------------------------------

const asArray = (value) => (Array.isArray(value) ? value : [value]);

/** Put each snapshotted loot row back to its recorded status and holder. */
const restoreLootStatuses = async (client, snapshots) => {
  for (const row of snapshots) {
    await client.query('UPDATE loot SET status = $1, whohas = $2 WHERE id = $3', [row.status ?? null, row.whohas ?? null, row.id]);
  }
};

/** Remove gold rows under the ledger lock, refusing a negative result. */
const removeGoldRows = async (client, ids) => {
  if (!ids.length) return;
  await Gold.lockLedger(client);
  const rows = await client.query('SELECT platinum, gold, silver, copper FROM gold WHERE id = ANY($1)', [ids]);
  const balance = await Gold.getBalance(client);
  for (const c of CURRENCIES) {
    const removed = rows.rows.reduce((sum, row) => sum + Number(row[c] || 0), 0);
    if (balance[c] - removed < 0) {
      throw controllerFactory.createValidationError(
        'Undoing this would make the party gold negative; undo the later withdrawals first'
      );
    }
  }
  await client.query('DELETE FROM gold WHERE id = ANY($1)', [ids]);
};

const UNDO_HANDLERS = {
  // A mistaken submission is removed outright. Rows that reference the loot
  // and are not themselves audited (appraisals, failed identify attempts) go
  // first; audited references (sales, consumable use) would have blocked the
  // undo as later changes. spellbook rows cascade.
  'loot.create': async (client, entry) => {
    const ids = entry.entity_ids;
    if (!ids.length) return;
    await client.query('DELETE FROM appraisal WHERE lootid = ANY($1)', [ids]);
    await client.query('DELETE FROM identify WHERE lootid = ANY($1)', [ids]);
    await client.query('DELETE FROM consumableuse WHERE lootid = ANY($1)', [ids]);
    await client.query('DELETE FROM loot WHERE id = ANY($1)', [ids]);
  },

  'loot.status': (client, entry) => restoreLootStatuses(client, asArray(entry.before)),
  'loot.restore': (client, entry) => restoreLootStatuses(client, asArray(entry.before)),

  'loot.update': async (client, entry) => {
    // `name` is always in the snapshot for display; restore it only when the edit changed it
    const { id, ...fields } = entry.before;
    const columns = Object.keys(fields).filter((col) => col !== 'name' || entry.after.name !== undefined);
    if (!columns.length) return;
    const sets = columns.map((col, i) => `"${col}" = $${i + 2}`);
    await client.query(`UPDATE loot SET ${sets.join(', ')} WHERE id = $1`, [id, ...columns.map((col) => fields[col])]);
  },

  'loot.identify': async (client, entry) => {
    await client.query('UPDATE loot SET name = $1, unidentified = $2 WHERE id = $3',
      [entry.before.name, entry.before.unidentified, entry.before.id]);
  },

  'loot.consume': async (client, entry) => {
    const b = entry.before;
    await client.query('UPDATE loot SET charges = $1, quantity = $2, status = $3 WHERE id = $4',
      [b.charges, b.quantity, b.status, b.id]);
    if (entry.after && entry.after.use_id) {
      await client.query('DELETE FROM consumableuse WHERE id = $1', [entry.after.use_id]);
    }
  },

  'loot.charges': async (client, entry) => {
    const b = entry.before;
    await client.query('UPDATE loot SET charges = $1, status = $2 WHERE id = $3', [b.charges, b.status, b.id]);
  },

  'gold.create': (client, entry) => removeGoldRows(client, entry.entity_ids),
  'gold.distribute': (client, entry) => removeGoldRows(client, entry.entity_ids),
  'gold.balance': (client, entry) => removeGoldRows(client, entry.entity_ids),

  sale: async (client, entry) => {
    const goldId = entry.after && entry.after.gold && entry.after.gold.id;
    if (goldId) await removeGoldRows(client, [goldId]);
    const soldIds = (entry.after && entry.after.sold_ids) || [];
    if (soldIds.length) await client.query('DELETE FROM sold WHERE id = ANY($1)', [soldIds]);
    await client.query("UPDATE loot SET status = 'Pending Sale' WHERE id = ANY($1)", [entry.entity_ids]);
  },
};

/**
 * Reverse one entry. Returns the new 'undo' entry.
 * @param {number} entryId
 * @param {number} userId - the DM doing it
 */
exports.undo = async (entryId, userId) =>
  dbUtils.executeTransaction(async (client) => {
    const entry = await AuditLog.getForUpdate(client, entryId);
    if (!entry) throw controllerFactory.createNotFoundError('History entry not found');
    if (entry.undone_at) throw controllerFactory.createValidationError('This change has already been undone');
    if (!AuditLog.UNDOABLE_ACTIONS.includes(entry.action)) {
      throw controllerFactory.createValidationError('This kind of change cannot be undone');
    }
    const later = await AuditLog.laterEntriesOn(client, entry);
    if (later.length) {
      throw controllerFactory.createValidationError(
        `Undo the later change first: ${later[later.length - 1].summary}`
      );
    }

    await UNDO_HANDLERS[entry.action](client, entry);
    await AuditLog.markUndone(client, entry.id, userId);
    return AuditLog.record(client, {
      userId,
      action: 'undo',
      entityType: entry.entity_type,
      entityIds: entry.entity_ids,
      before: entry.after,
      after: entry.before,
      summary: `Undid: ${entry.summary}`,
      undoOf: entry.id,
    });
  }, 'Error undoing change');

exports.CURRENCIES = CURRENCIES;
