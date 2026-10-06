// src/models/Infamy.js
//
// Data access for the Skulls & Shackles infamy system (ship_infamy,
// infamy_history, port_visits, favored_ports, imposition_uses, impositions and
// the Plunder stacks in loot). Every function takes an optional transaction
// `client` as its first argument; pass null for a plain read. Mutations that
// must be atomic run inside dbUtils.executeTransaction after taking the
// ship_infamy row lock via getOrCreate(client, { lock: true }).

const dbUtils = require('../utils/dbUtils');

/** Item id of "Plunder" in the item catalog. */
const PLUNDER_ITEM_ID = 7807;

const run = (client, sql, params) =>
  client ? client.query(sql, params) : dbUtils.executeQuery(sql, params);

/**
 * Read the campaign's ship_infamy row, creating a zero row when missing.
 * With `lock` (needs a transaction client) the row is locked FOR UPDATE so
 * concurrent mutations serialize.
 * @return {Promise<{infamy: number, disrepute: number}>}
 */
exports.getOrCreate = async (client, { lock = false } = {}) => {
  const select = `SELECT infamy, disrepute FROM ship_infamy WHERE id = 1${lock ? ' FOR UPDATE' : ''}`;
  let result = await run(client, select);
  if (result.rows.length === 0) {
    await run(
      client,
      'INSERT INTO ship_infamy (id, infamy, disrepute) VALUES (1, 0, 0) ON CONFLICT (campaign_id) DO NOTHING'
    );
    result = await run(client, select);
  }
  return result.rows[0] || { infamy: 0, disrepute: 0 };
};

/**
 * The ship_infamy row, or null when none exists yet (read-only).
 * @return {Promise<{infamy: number, disrepute: number}|null>}
 */
exports.find = async (client) => {
  const result = await run(client, 'SELECT infamy, disrepute FROM ship_infamy WHERE id = 1');
  return result.rows[0] || null;
};

/**
 * Apply relative changes to infamy and disrepute (never below 0).
 * @return {Promise<{infamy: number, disrepute: number}>} The new values
 */
exports.applyChange = async (client, infamyDelta, disreputeDelta) => {
  const result = await run(
    client,
    `UPDATE ship_infamy
        SET infamy = GREATEST(0, infamy + $1),
            disrepute = GREATEST(0, disrepute + $2),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING infamy, disrepute`,
    [infamyDelta, disreputeDelta]
  );
  return result.rows[0];
};

/** Current Golarion date row ({year, month, day, ...}) or null when uninitialised. */
exports.getCurrentGolarionDate = async (client) => {
  const result = await run(client, 'SELECT * FROM golarion_current_date LIMIT 1');
  return result.rows[0] || null;
};

/** The unpadded 'Y-M-D' string infamy_history.golarion_date stores. */
exports.formatGolarionDate = ({ year, month, day }) => `${year}-${month}-${day}`;

/** Today's attempts with the given reason ('Boasting at port' / 'Reroll for Infamy'). */
exports.getAttemptsOnDate = async (client, reason, golarionDate) => {
  const result = await run(
    client,
    'SELECT infamy_change FROM infamy_history WHERE reason = $1 AND golarion_date = $2',
    [reason, golarionDate]
  );
  return result.rows;
};

/** Infamy already gained at a port during a threshold. */
exports.getPortTotal = async (client, port, threshold) => {
  const result = await run(
    client,
    'SELECT COALESCE(SUM(infamy_gained), 0) AS total_gained FROM port_visits WHERE port_name = $1 AND threshold = $2',
    [port, threshold]
  );
  return parseInt(result.rows[0]?.total_gained, 10) || 0;
};

/** Favored-port bonus for a port (0 when not favored). */
exports.getFavoredBonus = async (client, port) => {
  const result = await run(client, 'SELECT bonus FROM favored_ports WHERE port_name = $1', [port]);
  return result.rows[0]?.bonus || 0;
};

/** All favored ports, best bonus first. */
exports.getFavoredPorts = async (client) => {
  const result = await run(client, 'SELECT * FROM favored_ports ORDER BY bonus DESC');
  return result.rows;
};

exports.addFavoredPort = (client, port, bonus, userId) =>
  run(client, 'INSERT INTO favored_ports (port_name, bonus, user_id) VALUES ($1, $2, $3)', [port, bonus, userId]);

exports.setFavoredPortBonus = (client, port, bonus) =>
  run(client, 'UPDATE favored_ports SET bonus = $1 WHERE port_name = $2', [bonus, port]);

/**
 * Spend `amount` plunder from the unspent Plunder stacks. Stacks are locked
 * FOR UPDATE; whole stacks are marked spent and a partly used stack is split.
 * Must run in a transaction.
 * @return {Promise<{ok: boolean, available: number}>} ok=false when there is
 *   not enough plunder (nothing is changed)
 */
exports.spendPlunder = async (client, amount, userId) => {
  const stacks = await client.query(
    `SELECT id, quantity FROM loot WHERE itemid = ${PLUNDER_ITEM_ID} AND status IS NULL ORDER BY id ASC FOR UPDATE`
  );
  const available = stacks.rows.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);
  if (available < amount) return { ok: false, available };

  let remaining = amount;
  for (const item of stacks.rows) {
    if (remaining <= 0) break;
    const quantity = parseInt(item.quantity, 10) || 0;
    if (quantity <= remaining) {
      await client.query("UPDATE loot SET status = 'Spent on Infamy' WHERE id = $1", [item.id]);
      remaining -= quantity;
    } else {
      await client.query('UPDATE loot SET quantity = $1 WHERE id = $2', [quantity - remaining, item.id]);
      await client.query(
        'INSERT INTO loot (name, itemid, quantity, session_date, status, whoupdated) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)',
        ['Plunder', PLUNDER_ITEM_ID, remaining, 'Spent on Infamy', userId]
      );
      remaining = 0;
    }
  }
  return { ok: true, available };
};

/** Append an infamy_history entry. */
exports.addHistory = (client, { infamyChange = 0, disreputeChange = 0, reason, port = null, userId, golarionDate = null }) =>
  run(
    client,
    `INSERT INTO infamy_history (infamy_change, disrepute_change, reason, port, user_id, golarion_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [infamyChange, disreputeChange, reason, port, userId, golarionDate]
  );

exports.addPortVisit = (client, { port, threshold, infamyGained, skillUsed, plunderSpent, userId }) =>
  run(
    client,
    'INSERT INTO port_visits (port_name, threshold, infamy_gained, skill_used, plunder_spent, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [port, threshold, infamyGained, skillUsed, plunderSpent, userId]
  );

exports.getImposition = async (client, id) => {
  const result = await run(client, 'SELECT * FROM impositions WHERE id = $1', [id]);
  return result.rows[0] || null;
};

/** Impositions unlocked at this infamy, highest tier first. */
exports.getImpositionsUpTo = async (client, infamy) => {
  const result = await run(
    client,
    'SELECT * FROM impositions WHERE threshold_required <= $1 ORDER BY threshold_required DESC, cost ASC',
    [infamy]
  );
  return result.rows;
};

exports.recordImpositionUse = (client, impositionId, costPaid, userId) =>
  run(client, 'INSERT INTO imposition_uses (imposition_id, cost_paid, user_id) VALUES ($1, $2, $3)', [
    impositionId,
    costPaid,
    userId,
  ]);

/** Golarion dates of recent crew sacrifices, newest first. */
exports.getRecentSacrificeDates = async (client) => {
  const result = await run(
    client,
    `SELECT golarion_date FROM infamy_history
      WHERE reason LIKE 'Sacrificed crew member%' AND golarion_date IS NOT NULL
      ORDER BY id DESC LIMIT 20`
  );
  return result.rows.map((row) => row.golarion_date);
};

/** One page of history (with usernames) and the total row count. */
exports.getHistoryPage = async (limit, offset) => {
  const history = await dbUtils.executeQuery(
    `SELECT ih.*, u.username as username
       FROM infamy_history ih
       LEFT JOIN users u ON ih.user_id = u.id
      ORDER BY ih.created_at DESC, ih.id DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const count = await dbUtils.executeQuery('SELECT COUNT(*) as total FROM infamy_history');
  return { rows: history.rows, total: parseInt(count.rows[0].total, 10) };
};

/** Infamy gained per port and threshold. */
exports.getPortTotals = async () => {
  const result = await dbUtils.executeQuery(
    `SELECT port_name, threshold, SUM(infamy_gained) as total_gained
       FROM port_visits
      GROUP BY port_name, threshold
      ORDER BY port_name, threshold`
  );
  return result.rows;
};
