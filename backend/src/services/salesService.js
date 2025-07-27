// src/services/salesService.js
const dbUtils = require('../utils/dbUtils');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../utils/saleValueCalculator');
const logger = require('../utils/logger');

/**
 * Service for handling item sales operations
 */
class SalesService {
  /**
   * Filter valid and invalid sale items
   * @param {Array} items - The items to filter
   * @returns {Object} - Object containing validItems and invalidItems arrays
   */
  static filterValidSaleItems(items) {
    const validItems = items.filter(item => item.unidentified !== true && item.value !== null);
    const invalidItems = items.filter(item => item.unidentified === true || item.value === null);
    return { validItems, invalidItems };
  }

  /**
   * Create gold entry for sales
   * @param {number} totalSold - Total amount sold
   * @param {string} notes - Notes for the transaction
   * @returns {Object} - Gold entry object
   */
  static createGoldEntry(totalSold, notes) {
    return {
      session_date: new Date(),
      transaction_type: 'Sale',
      platinum: 0,
      gold: Math.floor(totalSold),
      silver: Math.floor((totalSold % 1) * 10),
      copper: Math.floor(((totalSold * 10) % 1) * 10),
      notes
    };
  }

  /**
   * Insert gold entry into database
   * @param {Object} client - Database client
   * @param {Object} entry - Gold entry object
   * @returns {Promise<Object>} - The inserted gold record
   */
  static async insertGoldEntry(client, entry) {
    const result = await client.query(
      'INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [entry.session_date, entry.transaction_type, entry.platinum, entry.gold, entry.silver, entry.copper, entry.notes]
    );
    return result.rows[0];
  }

  /**
   * Process sale items common logic
   * @param {Object} client - Database client (for transactions)
   * @param {Array} validItems - Valid items to sell
   * @param {string} notes - Notes for the transaction
   * @returns {Promise<Object>} - Sale results
   */
  static async processSaleItems(client, validItems, notes) {
    const soldItems = [];
    const totalSold = calculateTotalSaleValue(validItems);
    const validItemIds = validItems.map(item => item.id);

    // Record each item as sold
    for (const item of validItems) {
      const saleValue = calculateItemSaleValue(item);
      await client.query('INSERT INTO sold (lootid, soldfor, soldon) VALUES ($1, $2, $3)',
        [item.id, saleValue, new Date()]);

      soldItems.push({
        id: item.id,
        name: item.name,
        value: parseFloat(item.value),
        soldFor: parseFloat(saleValue.toFixed(2))
      });
    }

    // Update status to Sold
    await client.query("UPDATE loot SET status = 'Sold' WHERE id = ANY($1)", [validItemIds]);

    // Create gold entry
    const goldEntry = this.createGoldEntry(totalSold, notes);
    const goldResult = await this.insertGoldEntry(client, goldEntry);

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
   * Sell all pending sale items
   * @returns {Promise<Object>} - Sale result
   */
  static async sellAllPendingItems() {
    return await dbUtils.executeTransaction(async (client) => {
      // Get all items with status 'Pending Sale'
      const itemsResult = await client.query("SELECT * FROM loot WHERE status = 'Pending Sale'");
      const items = itemsResult.rows;

      if (items.length === 0) {
        throw new Error('No items pending sale found');
      }

      const { validItems, invalidItems } = this.filterValidSaleItems(items);

      if (validItems.length === 0) {
        throw new Error('No valid items to sell (all items are unidentified or have no value)');
      }

      const saleResult = await this.processSaleItems(client, validItems, 'Bulk sale of all pending items');
      return this.createSaleResponse(saleResult.soldItems, saleResult.totalSold, saleResult.goldResult, [], invalidItems);
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
      // Get the specified items
      const itemsResult = await client.query('SELECT * FROM loot WHERE id = ANY($1)', [itemIds]);
      const items = itemsResult.rows;

      if (items.length === 0) {
        throw new Error('No items found with the specified IDs');
      }

      const { validItems, invalidItems } = this.filterValidSaleItems(items);

      if (validItems.length === 0) {
        throw new Error('No valid items to sell (all items are unidentified or have no value)');
      }

      const saleResult = await this.processSaleItems(client, validItems, `Sale of selected items: ${validItems.map(i => i.name).join(', ')}`);
      return this.createSaleResponse(saleResult.soldItems, saleResult.totalSold, saleResult.goldResult, [], invalidItems);
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
      let query, params;
      
      if (keepIds.length > 0) {
        query = "SELECT * FROM loot WHERE status = 'Pending Sale' AND id != ALL($1)";
        params = [keepIds];
      } else {
        query = "SELECT * FROM loot WHERE status = 'Pending Sale'";
        params = [];
      }

      const itemsResult = await client.query(query, params);
      const items = itemsResult.rows;

      if (items.length === 0) {
        throw new Error('No items to sell found');
      }

      const { validItems, invalidItems } = this.filterValidSaleItems(items);

      if (validItems.length === 0) {
        throw new Error('No valid items to sell (all items are unidentified or have no value)');
      }

      const saleResult = await this.processSaleItems(client, validItems, 'Sale of all items except specified keeps');
      return this.createSaleResponse(saleResult.soldItems, saleResult.totalSold, saleResult.goldResult, keepIds, invalidItems);
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
      // Get all pending sale items ordered by value (lowest first for better selection)
      const itemsResult = await client.query(
        "SELECT * FROM loot WHERE status = 'Pending Sale' AND unidentified != true AND value IS NOT NULL ORDER BY value ASC"
      );
      const items = itemsResult.rows;

      if (items.length === 0) {
        throw new Error('No valid items pending sale found');
      }

      // Select items up to the maximum amount
      const selectedItems = [];
      let currentTotal = 0;

      for (const item of items) {
        const itemSaleValue = calculateItemSaleValue(item);
        if (currentTotal + itemSaleValue <= maxAmount) {
          selectedItems.push(item);
          currentTotal += itemSaleValue;
        }
      }

      if (selectedItems.length === 0) {
        throw new Error('No items found within the specified amount limit');
      }

      const saleResult = await this.processSaleItems(client, selectedItems, `Sale up to ${maxAmount} gold`);
      return this.createSaleResponse(saleResult.soldItems, saleResult.totalSold, saleResult.goldResult);
    });
  }

  /**
   * Get all items pending sale
   * @returns {Promise<Array>} - Items pending sale
   */
  static async getPendingSaleItems() {
    const result = await dbUtils.executeQuery(
      "SELECT * FROM loot WHERE status = 'Pending Sale' ORDER BY name"
    );
    return result.rows;
  }

  /**
   * Get sale history for reporting
   * @param {Object} options - Query options
   * @param {number} options.limit - Limit number of results
   * @param {number} options.offset - Offset for pagination
   * @param {Date} options.startDate - Start date filter
   * @param {Date} options.endDate - End date filter
   * @returns {Promise<Object>} - Sale history with pagination
   */
  static async getSaleHistory(options = {}) {
    const { limit = 50, offset = 0, startDate, endDate } = options;
    
    let whereClause = '';
    const params = [limit, offset];
    let paramIndex = 3;

    if (startDate || endDate) {
      const conditions = [];
      if (startDate) {
        conditions.push(`s.soldon >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        conditions.push(`s.soldon <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
      }
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const query = `
      SELECT s.*, l.name, l.value as original_value
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      ${whereClause}
      ORDER BY s.soldon DESC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*) 
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      ${whereClause}
    `;

    const [historyResult, countResult] = await Promise.all([
      dbUtils.executeQuery(query, params),
      dbUtils.executeQuery(countQuery, startDate || endDate ? params.slice(2) : [])
    ]);

    return {
      sales: historyResult.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }
}

module.exports = SalesService;