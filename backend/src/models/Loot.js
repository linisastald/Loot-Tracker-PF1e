const dbUtils = require('../utils/dbUtils');

/**
 * Create a new loot entry
 * @param {Object} entry - The loot entry data
 * @return {Promise<Object>} - The created loot entry
 */
exports.create = async (entry) => {
  const query = `
    INSERT INTO loot (
      session_date, quantity, name, unidentified, masterwork, 
      type, size, itemid, modids, value, whoupdated, notes, charges
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;

  const values = [
    entry.sessionDate,
    entry.quantity,
    entry.name,
    entry.unidentified,
    entry.masterwork,
    entry.type,
    entry.size,
    entry.itemid || null,  // Ensure null if empty
    entry.modids || null,  // Ensure null if empty
    entry.value || null,   // Ensure null if empty
    entry.whoupdated,
    entry.notes,
    entry.charges || null  // Add charges, ensure null if empty
  ];

  const result = await dbUtils.executeQuery(query, values, 'Error creating loot entry');
  return result.rows[0];
};

/**
 * Find all loot entries, optionally filtered by character
 * @param {number|null} activeCharacterId - Active character ID for filtering, null for DM
 * @return {Promise<Object>} - Summary and individual loot entries
 */
exports.findAll = async (activeCharacterId = null) => {
  const isDM = activeCharacterId === null;

  const summaryQuery = `
    SELECT 
      CASE
        WHEN l.masterwork = true AND (l.modids IS NULL OR l.modids = '{}')
        THEN 'Well Made ' || l.name
        ELSE l.name
      END AS name,
      SUM(l.quantity) AS quantity, 
      l.unidentified, 
      l.masterwork, 
      l.type, 
      l.size, 
      COALESCE(ROUND(AVG(a.believedvalue)::numeric, 2), NULL) AS average_appraisal,
      ${isDM ? 'NULL' : 'MAX(CASE WHEN a.characterid = $1 THEN a.believedvalue END)'} AS believedvalue,
      MIN(l.session_date) AS session_date,
      MAX(l.lastupdate) AS lastupdate,
      CASE 
        WHEN COUNT(CASE WHEN l.status = 'Pending Sale' THEN 1 END) > 0 THEN 'Pending Sale'
        ELSE NULL
      END AS status,
      STRING_AGG(DISTINCT l.notes, ' | ') AS notes
    FROM 
      loot l
    LEFT JOIN 
      appraisal a ON l.id = a.lootid
    WHERE 
      l.status IS NULL OR l.status = 'Pending Sale'
    GROUP BY 
      l.name, l.unidentified, l.masterwork, l.type, l.size, l.modids;
  `;

  const individualQuery = `
    SELECT 
      l.id, 
      l.session_date, 
      l.quantity, 
      CASE
        WHEN l.masterwork = true AND (l.modids IS NULL OR l.modids = '{}')
        THEN 'Well Made ' || l.name
        ELSE l.name
      END AS name,
      l.unidentified, 
      l.masterwork, 
      l.type, 
      l.size, 
      l.status, 
      ${isDM ? 'NULL' : 'a.believedvalue'} AS believedvalue,
      (SELECT COALESCE(ROUND(AVG(a2.believedvalue)::numeric, 2), NULL) FROM appraisal a2 WHERE a2.lootid = l.id) AS average_appraisal,
      l.notes,
      l.lastupdate
    FROM 
      loot l
    ${isDM ? '' : 'LEFT JOIN appraisal a ON l.id = a.lootid AND a.characterid = $1'}
    WHERE 
      l.status IS NULL OR l.status = 'Pending Sale';
  `;

  try {
    const summaryResult = await dbUtils.executeQuery(
      summaryQuery,
      isDM ? [] : [activeCharacterId],
      'Error fetching loot summary'
    );

    const individualResult = await dbUtils.executeQuery(
      individualQuery,
      isDM ? [] : [activeCharacterId],
      'Error fetching individual loot items'
    );

    return {
      summary: summaryResult.rows,
      individual: individualResult.rows,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Find loot by status
 * @param {string} status - The status to filter by
 * @param {number} activeCharacterId - Active character ID
 * @return {Promise<Object>} - Summary and individual loot entries with the given status
 */
exports.findByStatus = async (status, activeCharacterId) => {
  const summaryQuery = `
    SELECT 
      CASE
        WHEN l.masterwork = true AND (l.modids IS NULL OR l.modids = '{}')
        THEN 'Well Made ' || l.name
        ELSE l.name
      END AS name,
      SUM(l.quantity) AS quantity, 
      l.unidentified, 
      l.masterwork, 
      l.type, 
      l.size, 
      COALESCE(ROUND(AVG(a.believedvalue)::numeric, 2), NULL) AS average_appraisal, 
      MAX(CASE WHEN a.characterid = $2 THEN a.believedvalue END) AS believedvalue,
      MIN(l.session_date) AS session_date,
      MAX(l.lastupdate) AS lastupdate,
      STRING_AGG(DISTINCT c.name, ', ') AS character_names,
      STRING_AGG(DISTINCT l.notes, ' | ') AS notes
    FROM 
      loot l
    LEFT JOIN 
      appraisal a ON l.id = a.lootid
    LEFT JOIN 
      characters c ON l.whohas = c.id
    WHERE 
      l.status = $1
    GROUP BY 
      l.name, l.unidentified, l.masterwork, l.type, l.size, l.modids;
  `;

  const individualQuery = `
    SELECT 
      l.id, 
      l.session_date, 
      l.quantity, 
      CASE
        WHEN l.masterwork = true AND (l.modids IS NULL OR l.modids = '{}')
        THEN 'Well Made ' || l.name
        ELSE l.name
      END AS name,
      l.unidentified, 
      l.masterwork, 
      l.type, 
      l.size, 
      l.status, 
      a.believedvalue,
      (SELECT COALESCE(ROUND(AVG(a2.believedvalue)::numeric, 2), NULL) FROM appraisal a2 WHERE a2.lootid = l.id) AS average_appraisal,
      c.name AS character_name,
      l.notes
    FROM 
      loot l
    LEFT JOIN 
      appraisal a ON l.id = a.lootid AND a.characterid = $2
    LEFT JOIN 
      characters c ON l.whohas = c.id
    WHERE 
      l.status = $1;
  `;

  try {
    const summaryResult = await dbUtils.executeQuery(
      summaryQuery,
      [status, activeCharacterId],
      'Error fetching loot summary by status'
    );

    const individualResult = await dbUtils.executeQuery(
      individualQuery,
      [status, activeCharacterId],
      'Error fetching individual loot items by status'
    );

    return {
      summary: summaryResult.rows,
      individual: individualResult.rows,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update status of loot items
 * @param {Array<number>} ids - Array of loot item IDs
 * @param {string} status - New status value
 * @param {number|null} whohas - ID of character who has the item (for Kept Self status)
 * @return {Promise<void>}
 */
exports.updateStatus = async (ids, status, whohas) => {
  let query;
  let values;

  if (status === 'Kept Self' && whohas) {
    query = `
      UPDATE loot
      SET status = $1, whohas = $2, lastupdate = CURRENT_TIMESTAMP
      WHERE id = ANY($3::int[])
    `;
    values = [status, whohas, ids];
  } else {
    query = `
      UPDATE loot
      SET status = $1, lastupdate = CURRENT_TIMESTAMP
      WHERE id = ANY($2::int[])
    `;
    values = [status, ids];
  }

  await dbUtils.executeQuery(query, values, 'Error updating loot status');
};

/**
 * Split a stack of items
 * @param {number} id - ID of the loot item to split
 * @param {Array<Object>} splits - Array of split objects with quantities
 * @param {number} userId - ID of the user making the change
 * @return {Promise<void>}
 */
exports.splitStack = async (id, splits, userId) => {
  return await dbUtils.executeTransaction(async (client) => {
    // Fetch the original item
    const originalItemQuery = 'SELECT * FROM loot WHERE id = $1';
    const originalItemResult = await client.query(originalItemQuery, [id]);
    const originalItem = originalItemResult.rows[0];

    // Update the original item with the first split
    const updateOriginalQuery = `
      UPDATE loot 
      SET quantity = $1, whoupdated = $2, lastupdate = CURRENT_TIMESTAMP
      WHERE id = $3
    `;
    await client.query(updateOriginalQuery, [splits[0].quantity, userId, id]);

    // Insert new split items for the remaining splits
    if (splits.length > 1) {
      const insertSplitQuery = `
        INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, status, whoupdated, lastupdate, whohas, notes, itemid, modids, value, charges)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12, $13, $14, $15)
      `;

      for (let i = 1; i < splits.length; i++) {
        const values = [
          originalItem.session_date,
          splits[i].quantity,
          originalItem.name,
          originalItem.unidentified,
          originalItem.masterwork,
          originalItem.type,
          originalItem.size,
          originalItem.status,
          userId,
          originalItem.whohas,
          originalItem.notes,
          originalItem.itemid,
          originalItem.modids,
          originalItem.value,
          originalItem.charges
        ];
        await client.query(insertSplitQuery, values);
      }
    }
  }, 'Error splitting loot stack');
};

/**
 * Update a loot entry
 * @param {number} id - ID of the loot item to update
 * @param {Object} updatedEntry - Updated entry data
 * @return {Promise<void>}
 */
exports.updateEntry = async (id, updatedEntry) => {
  // First get the current entry to merge with updated data
  const currentEntryQuery = `SELECT * FROM loot WHERE id = $1`;
  const currentEntryResult = await dbUtils.executeQuery(currentEntryQuery, [id], 'Error fetching loot entry');
  const currentEntry = currentEntryResult.rows[0];

  if (!currentEntry) {
    throw new Error('Loot entry not found');
  }

  // Merge current entry with updates
  const mergedEntry = {
    ...currentEntry,
    ...updatedEntry,
  };

  const query = `
    UPDATE loot
    SET session_date = $1, quantity = $2, name = $3, unidentified = $4, masterwork = $5, 
        type = $6, size = $7, itemid = $8, modids = $9, value = $10, whoupdated = $11, 
        lastupdate = CURRENT_TIMESTAMP, whohas = $12, notes = $13
    WHERE id = $14
  `;

  const values = [
    mergedEntry.session_date,
    mergedEntry.quantity,
    mergedEntry.name,
    mergedEntry.unidentified,
    mergedEntry.masterwork,
    mergedEntry.type,
    mergedEntry.size,
    mergedEntry.itemId,
    mergedEntry.modids,
    mergedEntry.value,
    mergedEntry.whoupdated,
    mergedEntry.whohas,
    mergedEntry.notes,
    id,
  ];

  await dbUtils.executeQuery(query, values, 'Error updating loot entry');
};

/**
 * Get all items
 * @return {Promise<Object>} - Item data
 */
exports.getItems = async () => {
  const query = `SELECT * from item;`;
  const itemsResult = await dbUtils.executeQuery(query, [], 'Error fetching items');

  return {
    summary: itemsResult.rows
  };
};

module.exports = exports;