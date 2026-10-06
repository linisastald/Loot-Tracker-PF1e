// src/services/salesService.js
const dbUtils = require('../utils/dbUtils');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../utils/saleValueCalculator');
const controllerFactory = require('../utils/controllerFactory');
const Gold = require('../models/Gold');

// COALESCE so DM-linked items inherit the catalog value when the row's own
// value is null (otherwise they would sell for 0 gold).
const SALE_ITEMS_SELECT = `
  SELECT l.*, COALESCE(l.value, i.value) AS value
  FROM loot l
  LEFT JOIN item i ON i.id = l.itemid
`;

/**
 * Service for handling item sales operations.
 *
 * Every sale path runs in one transaction that first takes the per-campaign gold
 * ledger lock (Gold.lockLedger), locks the loot rows it is about to sell, writes
 * the sold rows, flips the loot status with a status-guarded UPDATE and credits
 * the gold through the same client. No path can sell the same row twice.
 */
class SalesService {
  /**
   * Filter valid and invalid sale items
   * @param {Array} items - The items to filter
   * @returns {Object} - Object containing validItems and invalidItems arrays
   */
  static filterValidSaleItems(items) {
    const validItems = [];
    const invalidItems = [];
    for (const item of items) {
      const sellable = item.unidentified !== true && item.value !== null && item.value !== undefined;
      (sellable ? validItems : invalidItems).push(item);
    }
    return { validItems, invalidItems };
  }

  /**
   * Create gold entry for sales
   * @param {number} totalSold - Total amount sold, in gold
   * @param {string} notes - Notes for the transaction
   * @returns {Object} - Gold entry object
   */
  static createGoldEntry(totalSold, notes) {
    // Work in whole copper (1 gp = 100 cp). Rounding to 1e-4 cp first strips the
    // binary floating-point noise (2.3 gp is 229.99999999999997 cp) while keeping
    // the existing convention of dropping any fraction of a copper piece.
    const copper = Math.floor(Math.round(totalSold * 1e6) / 1e4);
    return {
      session_date: new Date(),
      transaction_type: 'Sale',
      platinum: 0,
      gold: Math.floor(copper / 100),
      silver: Math.floor((copper % 100) / 10),
      copper: copper % 10,
      notes
    };
  }

  /**
   * Process sale items common logic. Must run inside a transaction that already
   * holds the gold ledger lock.
   * @param {Object} client - Database client (for transactions)
   * @param {Array} validItems - Valid items to sell
   * @param {string} notes - Notes for the transaction
   * @returns {Promise<Object>} - Sale results
   */
  static async processSaleItems(client, validItems, notes) {
    const totalSold = calculateTotalSaleValue(validItems);
    const validItemIds = validItems.map(item => item.id);
    const now = new Date();

    // sold.soldfor is the line total (unit sale value x quantity) so the sold
    // rows add up to the gold credit.
    const soldItems = validItems.map(item => {
      const quantity = parseInt(item.quantity) || 1;
      return {
        id: item.id,
        name: item.name,
        value: parseFloat(item.value),
        quantity,
        soldFor: parseFloat((calculateItemSaleValue(item) * quantity).toFixed(2))
      };
    });

    // Batch insert all sold records in a single query
    await client.query(
      `INSERT INTO sold (lootid, soldfor, soldon)
       SELECT unnest($1::int[]), unnest($2::numeric[]), $3`,
      [soldItems.map(s => s.id), soldItems.map(s => s.soldFor), now]
    );

    // Update status to Sold. The status guard in the WHERE clause plus the row
    // count check make a double-sale impossible even if a concurrent request
    // slipped past the caller's own status check.
    const updateResult = await client.query(
      "UPDATE loot SET status = 'Sold' WHERE id = ANY($1) AND status = 'Pending Sale'",
      [validItemIds]
    );
    if (updateResult.rowCount !== validItemIds.length) {
      throw controllerFactory.createValidationError(
        'Some items are no longer pending sale (they may have just been sold); no items were sold'
      );
    }

    // Credit the gold through the ledger model, on the same client
    const goldEntry = this.createGoldEntry(totalSold, notes);
    const goldResult = await Gold.create({
      sessionDate: goldEntry.session_date,
      transactionType: goldEntry.transaction_type,
      platinum: goldEntry.platinum,
      gold: goldEntry.gold,
      silver: goldEntry.silver,
      copper: goldEntry.copper,
      notes: goldEntry.notes
    }, client);

    return { soldItems, totalSold, goldResult };
  }

  /**
   * Create standardized sale response
   * @param {Array} soldItems - Items that were sold
   * @param {number} totalSold - Total amount sold
   * @param {Object} goldResult - Gold transaction record
   * @param {Array} keptItems - Items that were kept (optional)
   * @param {Array} invalidItems - Items that couldn't be sold (optional)
   * @returns {Object} - Standardized response object
   */
  static createSaleResponse(soldItems, totalSold, goldResult, keptItems = [], invalidItems = []) {
    return {
      sold: {
        items: soldItems,
        count: soldItems.length,
        total: parseFloat(totalSold.toFixed(2))
      },
      kept: keptItems.length > 0 ? {
        ids: keptItems,
        count: keptItems.length
      } : undefined,
      skipped: invalidItems.length > 0 ? {
        items: invalidItems.map(item => ({ id: item.id, name: item.name })),
        count: invalidItems.length,
        reason: 'Items are either unidentified or have no value'
      } : undefined,
      gold: goldResult
    };
  }

  /**
   * Run the shared sale pipeline on already-fetched (and locked) rows: drop the
   * unsellable ones, write the sale and build the response.
   * @private
   */
  static async _sellItems(client, items, notes, keptIds = []) {
    const { validItems, invalidItems } = this.filterValidSaleItems(items);

    if (validItems.length === 0) {
      throw new Error('No valid items to sell (all items are unidentified or have no value)');
    }

    const saleResult = await this.processSaleItems(client, validItems, notes);
    return this.createSaleResponse(saleResult.soldItems, saleResult.totalSold, saleResult.goldResult, keptIds, invalidItems);
  }

  /**
   * Fetch (and row-lock) the loot rows a sale will touch.
   * whereSql and orderSql are fixed strings from this file, never user input.
   * @private
   */
  static async _fetchLockedItems(client, whereSql, params, orderSql = 'l.id') {
    const result = await client.query(
      `${SALE_ITEMS_SELECT} WHERE ${whereSql} ORDER BY ${orderSql} FOR UPDATE OF l`,
      params
    );
    return result.rows;
  }

  /**
   * Sell all pending sale items
   * @returns {Promise<Object>} - Sale result
   */
  static async sellAllPendingItems() {
    return await dbUtils.executeTransaction(async (client) => {
      await Gold.lockLedger(client);

      const items = await this._fetchLockedItems(client, "l.status = 'Pending Sale'", []);
      if (items.length === 0) {
        throw new Error('No items pending sale found');
      }

      return this._sellItems(client, items, 'Bulk sale of all pending items');
    });
  }

  /**
   * Sell selected items by IDs
   * @param {Array} itemIds - Array of item IDs to sell
   * @returns {Promise<Object>} - Sale result
   */
  static async sellSelectedItems(itemIds) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new Error('Item IDs array is required');
    }

    return await dbUtils.executeTransaction(async (client) => {
      await Gold.lockLedger(client);

      // Rows are locked (FOR UPDATE) so a concurrent sale of the same ids waits,
      // then sees status 'Sold' and is rejected below.
      const items = await this._fetchLockedItems(client, 'l.id = ANY($1)', [itemIds]);

      if (items.length === 0) {
        throw new Error('No items found with the specified IDs');
      }

      // Only 'Pending Sale' items are sellable, same as the other sale paths.
      const notSellable = items.filter(item => item.status !== 'Pending Sale');
      const foundIds = new Set(items.map(item => Number(item.id)));
      const missingIds = itemIds.filter(id => !foundIds.has(Number(id)));
      if (notSellable.length > 0 || missingIds.length > 0) {
        const parts = notSellable.map(item => `${item.name} (id ${item.id}, status ${item.status})`);
        if (missingIds.length > 0) {
          parts.push(`not found: ${missingIds.join(', ')}`);
        }
        throw controllerFactory.createValidationError(
          `Cannot sell items that are not pending sale: ${parts.join('; ')}. No items were sold.`
        );
      }

      const validNames = this.filterValidSaleItems(items).validItems.map(i => i.name).join(', ');
      return this._sellItems(client, items, `Sale of selected items: ${validNames}`);
    });
  }

  /**
   * Sell all items except specified ones
   * @param {Array} keepIds - Array of item IDs to keep
   * @returns {Promise<Object>} - Sale result
   */
  static async sellAllExceptItems(keepIds) {
    if (!Array.isArray(keepIds)) {
      throw new Error('Keep IDs must be an array');
    }

    return await dbUtils.executeTransaction(async (client) => {
      await Gold.lockLedger(client);

      // `!= ALL` over an empty array is true for every row, so no special case.
      const items = await this._fetchLockedItems(
        client, "l.status = 'Pending Sale' AND l.id != ALL($1::int[])", [keepIds]
      );
      if (items.length === 0) {
        throw new Error('No items to sell found');
      }

      return this._sellItems(client, items, 'Sale of all items except specified keeps', keepIds);
    });
  }

  /**
   * Sell items up to a specified monetary limit
   * @param {number} maxAmount - Maximum amount to sell
   * @returns {Promise<Object>} - Sale result
   */
  static async sellUpToAmount(maxAmount) {
    if (!maxAmount || maxAmount <= 0) {
      throw new Error('Maximum amount must be a positive number');
    }

    return await dbUtils.executeTransaction(async (client) => {
      await Gold.lockLedger(client);

      // Lowest value first for better selection. IS NOT TRUE so a NULL
      // unidentified flag counts as identified, like filterValidSaleItems.
      const items = await this._fetchLockedItems(
        client,
        `l.status = 'Pending Sale'
          AND l.unidentified IS NOT TRUE
          AND COALESCE(l.value, i.value) IS NOT NULL`,
        [],
        'COALESCE(l.value, i.value) ASC, l.id'
      );
      if (items.length === 0) {
        throw new Error('No valid items pending sale found');
      }

      // Select items up to the maximum amount; a stack counts at quantity x unit
      // value, the same amount processSaleItems will credit.
      const selectedItems = [];
      let currentTotal = 0;

      for (const item of items) {
        const lineValue = calculateItemSaleValue(item) * (parseInt(item.quantity) || 1);
        if (currentTotal + lineValue <= maxAmount + 1e-9) {
          selectedItems.push(item);
          currentTotal += lineValue;
        }
      }

      if (selectedItems.length === 0) {
        throw new Error('No items found within the specified amount limit');
      }

      return this._sellItems(client, selectedItems, `Sale up to ${maxAmount} gold`);
    });
  }

  /**
   * Get all items pending sale.
   * LEFT JOINs the catalog `item` table so rows that have an `itemid` set
   * but no custom `loot.value` fall back to the catalog item's value for
   * sale-value calculation. Without this, DM-linked unidentified items
   * showed a sale value of 0 even though the linked catalog row had a
   * proper price.
   * @returns {Promise<Array>} - Items pending sale (each row has its raw
   *   `value` plus a coalesced `value` so downstream calculators see the
   *   right number).
   */
  static async getPendingSaleItems() {
    const result = await dbUtils.executeQuery(`
      SELECT
        l.*,
        COALESCE(l.value, i.value) AS value,
        i.name AS catalog_name,
        i.type AS catalog_type
      FROM loot l
      LEFT JOIN item i ON i.id = l.itemid
      WHERE l.status = 'Pending Sale'
      ORDER BY l.name
    `);
    return result.rows;
  }
}

module.exports = SalesService;
