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
      type, size, itemid, modids, value, whoupdated, notes, charges, cursed
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
    entry.charges || null,  // Add charges, ensure null if empty
    entry.cursed || false   // Add cursed, default false
  ];

  const result = await dbUtils.executeQuery(query, values, 'Error creating loot entry');
  return result.rows[0];
};

/**
 * Find loot by status - handles both unprocessed and specific status cases
 * @param {string|null} status - The status to filter by (null means unprocessed)
 * @param {number|null} activeCharacterId - Active character ID
 * @return {Promise<Object>} - Summary and individual loot entries
 */
exports.findByStatus = async (status, activeCharacterId = null) => {
  try {
    // Build the WHERE clause based on status
    let whereClause;
    const params = [];

    if (status === null) {
      // For unprocessed items (null status or Pending Sale)
      whereClause = "(statuspage IS NULL OR statuspage = 'Pending Sale')";
    } else {
      // For specific status
      whereClause = "statuspage = $1";
      params.push(status);
    }

    // Query using the view
    const query = `
      SELECT * FROM loot_view
      WHERE ${whereClause}
      ORDER BY row_type, name, id
    `;

    const result = await dbUtils.executeQuery(query, params);

    // Process the results to extract the correct believedvalue for the character
    const processedRows = result.rows.map(item => {
      // If we have an active character and appraisals, find the specific appraisal
      if (activeCharacterId && item.appraisals && Array.isArray(item.appraisals)) {
        const characterAppraisal = item.appraisals.find(a => {
          return a.character_id === activeCharacterId ||
                 (a.character_name && a.character_id?.toString() === activeCharacterId.toString());
        });

        if (characterAppraisal) {
          item.believedvalue = characterAppraisal.believedvalue;
        }
      }

      return item;
    });

    return {
      summary: processedRows.filter(row => row.row_type === 'summary'),
      individual: processedRows.filter(row => row.row_type === 'individual')
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
        INSERT INTO loot (session_date, quantity, name, unidentified, masterwork, type, size, status, whoupdated, lastupdate, whohas, notes, itemid, modids, value, charges, cursed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12, $13, $14, $15, $16)
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
          originalItem.charges,
          originalItem.cursed
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
        lastupdate = CURRENT_TIMESTAMP, whohas = $12, notes = $13, cursed = $14
    WHERE id = $15
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
    mergedEntry.cursed,
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