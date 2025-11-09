// src/controllers/reportsController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');

/**
 * Get party kept loot items
 */
const getKeptPartyLoot = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const pagination = ValidationService.validatePagination(req.query.page, limit);

    const query = `
      SELECT *
      FROM loot_view
      WHERE statuspage = 'Kept Party'
      ORDER BY name
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*)
      FROM loot_view
      WHERE statuspage = 'Kept Party'
    `;

    const [itemsResult, countResult] = await Promise.all([
      dbUtils.executeQuery(query, [pagination.limit, pagination.offset]),
      dbUtils.executeQuery(countQuery)
    ]);

    const allItems = itemsResult.rows;

    // Separate summary and individual items
    const summaryItems = allItems.filter(item => item.row_type === 'summary');
    const individualItems = allItems.filter(item => item.row_type === 'individual');

    return controllerFactory.sendSuccessResponse(res, {
      summary: summaryItems,
      individual: individualItems,
      count: allItems.length,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: pagination.limit,
        offset: pagination.offset,
        page: pagination.page,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / pagination.limit),
        hasMore: (pagination.offset + pagination.limit) < parseInt(countResult.rows[0].count)
      }
    }, `Found ${allItems.length} party kept items`);
  } catch (error) {
    logger.error('Error fetching party kept loot:', error);
    throw error;
  }
};

/**
 * Get character kept loot items
 */
const getKeptCharacterLoot = async (req, res) => {
  try {
    const { character_id, limit = 50, offset = 0 } = req.query;
    const pagination = ValidationService.validatePagination(req.query.page, limit);

    let query = `
      SELECT *
      FROM loot_view
      WHERE statuspage IN ('Kept Character', 'Kept Self')
    `;

    const params = [pagination.limit, pagination.offset];
    let paramIndex = 3;

    if (character_id) {
      ValidationService.validateCharacterId(parseInt(character_id));
      query += ` AND (character_name = (SELECT name FROM characters WHERE id = $${paramIndex}) OR character_names @> ARRAY[(SELECT name FROM characters WHERE id = $${paramIndex})])`;
      params.push(character_id);
      paramIndex++;
    }

    query += ` ORDER BY character_name, name LIMIT $1 OFFSET $2`;

    let countQuery = `
      SELECT COUNT(*)
      FROM loot_view
      WHERE statuspage IN ('Kept Character', 'Kept Self')
    `;

    const countParams = [];
    if (character_id) {
      countQuery += ` AND (character_name = (SELECT name FROM characters WHERE id = $1) OR character_names @> ARRAY[(SELECT name FROM characters WHERE id = $1)])`;
      countParams.push(character_id);
    }

    const [itemsResult, countResult] = await Promise.all([
      dbUtils.executeQuery(query, params),
      dbUtils.executeQuery(countQuery, countParams)
    ]);

    const allItems = itemsResult.rows;

    // Separate summary and individual items
    const summaryItems = allItems.filter(item => item.row_type === 'summary');
    const individualItems = allItems.filter(item => item.row_type === 'individual');

    return controllerFactory.sendSuccessResponse(res, {
      summary: summaryItems,
      individual: individualItems,
      count: allItems.length,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: pagination.limit,
        offset: pagination.offset,
        page: pagination.page,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / pagination.limit),
        hasMore: (pagination.offset + pagination.limit) < parseInt(countResult.rows[0].count)
      },
      filters: { character_id }
    }, `Found ${allItems.length} character kept items`);
  } catch (error) {
    logger.error('Error fetching character kept loot:', error);
    throw error;
  }
};

/**
 * Get trashed/given away loot items
 */
const getTrashedLoot = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const pagination = ValidationService.validatePagination(req.query.page, limit);

    const query = `
      SELECT *
      FROM loot_view
      WHERE statuspage IN ('Trash', 'Trashed', 'Given Away')
      ORDER BY statuspage, name
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*)
      FROM loot_view
      WHERE statuspage IN ('Trash', 'Trashed', 'Given Away')
    `;

    const [itemsResult, countResult] = await Promise.all([
      dbUtils.executeQuery(query, [pagination.limit, pagination.offset]),
      dbUtils.executeQuery(countQuery)
    ]);

    const allItems = itemsResult.rows;

    // Separate summary and individual items
    const summaryItems = allItems.filter(item => item.row_type === 'summary');
    const individualItems = allItems.filter(item => item.row_type === 'individual');

    return controllerFactory.sendSuccessResponse(res, {
      summary: summaryItems,
      individual: individualItems,
      count: allItems.length,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: pagination.limit,
        offset: pagination.offset,
        page: pagination.page,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / pagination.limit),
        hasMore: (pagination.offset + pagination.limit) < parseInt(countResult.rows[0].count)
      }
    }, `Found ${allItems.length} trashed/given away items`);
  } catch (error) {
    logger.error('Error fetching trashed loot:', error);
    throw error;
  }
};

/**
 * Get character loot ledger
 */
const getCharacterLedger = async (req, res) => {
  try {
    const ledgerQuery = `
      SELECT c.name AS character,
             c.active,
             COALESCE(SUM(l.value), 0) AS lootValue,
             COALESCE(SUM(
                          CASE
                              WHEN g.transaction_type = 'Party Payment'
                                  THEN (g.copper::decimal / 100 + g.silver::decimal / 10 + g.gold::decimal +
                                        g.platinum::decimal * 10)
                              ELSE 0
                              END
                      ), 0) AS payments
      FROM characters c
               LEFT JOIN loot l ON c.id = l.whohas AND l.status = 'Kept Character'
               LEFT JOIN gold g ON c.id = g.character_id
      GROUP BY c.id, c.name, c.active
      ORDER BY c.active DESC, lootValue DESC
    `;

    const result = await dbUtils.executeQuery(ledgerQuery);

    const ledger = result.rows.map(row => ({
      character: row.character,
      active: row.active,
      lootValue: parseFloat(row.lootvalue) || 0,
      payments: parseFloat(row.payments) || 0,
      balance: (parseFloat(row.lootvalue) || 0) - (parseFloat(row.payments) || 0)
    }));

    const totals = {
      totalLootValue: ledger.reduce((sum, char) => sum + char.lootValue, 0),
      totalPayments: ledger.reduce((sum, char) => sum + char.payments, 0),
      totalBalance: ledger.reduce((sum, char) => sum + char.balance, 0)
    };

    return controllerFactory.sendSuccessResponse(res, {
      ledger,
      totals,
      characterCount: ledger.length
    }, `Character ledger retrieved for ${ledger.length} characters`);
  } catch (error) {
    logger.error('Error fetching character ledger:', error);
    throw error;
  }
};

/**
 * Get unidentified items count
 */
const getUnidentifiedCount = async (req, res) => {
  try {
    const countResult = await dbUtils.executeQuery(
      "SELECT COUNT(*) as count FROM loot WHERE unidentified = true AND (itemid IS NOT NULL OR (modids IS NOT NULL AND modids != '{}'))"
    );

    const count = parseInt(countResult.rows[0].count);

    return controllerFactory.sendSuccessResponse(res, {
      count,
      hasUnidentified: count > 0
    }, `${count} unidentified items found`);
  } catch (error) {
    logger.error('Error fetching unidentified count:', error);
    throw error;
  }
};

/**
 * Get unprocessed items count
 */
const getUnprocessedCount = async (req, res) => {
  try {
    const countResult = await dbUtils.executeQuery(
      "SELECT COUNT(*) as count FROM loot WHERE status IS NULL"
    );

    const count = parseInt(countResult.rows[0].count);

    return controllerFactory.sendSuccessResponse(res, {
      count,
      hasUnprocessed: count > 0
    }, `${count} unprocessed items found`);
  } catch (error) {
    logger.error('Error fetching unprocessed count:', error);
    throw error;
  }
};

/**
 * Get loot statistics and summary
 */
const getLootStatistics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const validatedDays = ValidationService.validateRequiredNumber(days, 'days', { min: 1, max: 365 });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - validatedDays);

    // Status breakdown
    const statusQuery = `
      SELECT status, COUNT(*) as count, COALESCE(SUM(value * quantity), 0) as total_value
      FROM loot
      WHERE session_date >= $1
      GROUP BY status
      ORDER BY count DESC
    `;

    // Item type breakdown
    const typeQuery = `
      SELECT i.type, COUNT(l.id) as count, COALESCE(SUM(l.value * l.quantity), 0) as total_value
      FROM loot l
      JOIN item i ON l.itemid = i.id
      WHERE l.session_date >= $1
      GROUP BY i.type
      ORDER BY count DESC
    `;

    // Daily creation stats
    const dailyQuery = `
      SELECT DATE(session_date) as date, COUNT(*) as items_created, COALESCE(SUM(value * quantity), 0) as total_value
      FROM loot
      WHERE session_date >= $1
      GROUP BY DATE(session_date)
      ORDER BY date DESC
    `;

    // Overall totals
    const totalsQuery = `
      SELECT 
        COUNT(*) as total_items,
        COALESCE(SUM(value * quantity), 0) as total_value,
        COUNT(DISTINCT itemid) as unique_items,
        COALESCE(AVG(value), 0) as avg_item_value
      FROM loot
      WHERE session_date >= $1
    `;

    const [statusResult, typeResult, dailyResult, totalsResult] = await Promise.all([
      dbUtils.executeQuery(statusQuery, [startDate]),
      dbUtils.executeQuery(typeQuery, [startDate]),
      dbUtils.executeQuery(dailyQuery, [startDate]),
      dbUtils.executeQuery(totalsQuery, [startDate])
    ]);

    const statistics = {
      period: {
        days: validatedDays,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      },
      totals: {
        totalItems: parseInt(totalsResult.rows[0].total_items),
        totalValue: parseFloat(totalsResult.rows[0].total_value),
        uniqueItems: parseInt(totalsResult.rows[0].unique_items),
        averageItemValue: parseFloat(totalsResult.rows[0].avg_item_value)
      },
      byStatus: statusResult.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count),
        totalValue: parseFloat(row.total_value)
      })),
      byType: typeResult.rows.map(row => ({
        type: row.type,
        count: parseInt(row.count),
        totalValue: parseFloat(row.total_value)
      })),
      dailyBreakdown: dailyResult.rows.map(row => ({
        date: row.date,
        itemsCreated: parseInt(row.items_created),
        totalValue: parseFloat(row.total_value)
      }))
    };

    return controllerFactory.sendSuccessResponse(res, statistics,
      `Loot statistics for the last ${validatedDays} days`);
  } catch (error) {
    logger.error('Error fetching loot statistics:', error);
    throw error;
  }
};

/**
 * Get value distribution report
 */
const getValueDistribution = async (req, res) => {
  try {
    const distributionQuery = `
      SELECT 
        CASE
          WHEN value < 10 THEN '< 10 gp'
          WHEN value < 50 THEN '10-49 gp'
          WHEN value < 100 THEN '50-99 gp'  
          WHEN value < 500 THEN '100-499 gp'
          WHEN value < 1000 THEN '500-999 gp'
          WHEN value < 5000 THEN '1,000-4,999 gp'
          ELSE '5,000+ gp'
        END as value_range,
        COUNT(*) as count,
        COALESCE(SUM(value * quantity), 0) as total_value
      FROM loot
      WHERE value IS NOT NULL AND value > 0
      GROUP BY 
        CASE
          WHEN value < 10 THEN 1
          WHEN value < 50 THEN 2
          WHEN value < 100 THEN 3
          WHEN value < 500 THEN 4
          WHEN value < 1000 THEN 5
          WHEN value < 5000 THEN 6
          ELSE 7
        END,
        CASE
          WHEN value < 10 THEN '< 10 gp'
          WHEN value < 50 THEN '10-49 gp'
          WHEN value < 100 THEN '50-99 gp'
          WHEN value < 500 THEN '100-499 gp'
          WHEN value < 1000 THEN '500-999 gp'
          WHEN value < 5000 THEN '1,000-4,999 gp'
          ELSE '5,000+ gp'
        END
      ORDER BY 1
    `;

    const result = await dbUtils.executeQuery(distributionQuery);

    const distribution = result.rows.map(row => ({
      valueRange: row.value_range,
      count: parseInt(row.count),
      totalValue: parseFloat(row.total_value),
      percentage: 0 // Will be calculated below
    }));

    // Calculate percentages
    const totalItems = distribution.reduce((sum, range) => sum + range.count, 0);
    distribution.forEach(range => {
      range.percentage = totalItems > 0 ? (range.count / totalItems * 100).toFixed(1) : 0;
    });

    return controllerFactory.sendSuccessResponse(res, {
      distribution,
      totalItems,
      totalValue: distribution.reduce((sum, range) => sum + range.totalValue, 0)
    }, `Value distribution calculated for ${totalItems} items`);
  } catch (error) {
    logger.error('Error fetching value distribution:', error);
    throw error;
  }
};

/**
 * Get session-based loot report
 */
const getSessionReport = async (req, res) => {
  try {
    const { sessionDate } = req.query;
    
    if (!sessionDate) {
      throw controllerFactory.createValidationError('Session date is required');
    }

    const validatedDate = ValidationService.validateDate(sessionDate, 'sessionDate');

    const sessionQuery = `
      SELECT 
        l.*,
        i.name as base_item_name,
        i.type as item_type,
        c.name as character_name
      FROM loot l
      JOIN item i ON l.itemid = i.id
      LEFT JOIN characters c ON l.whohas = c.id
      WHERE DATE(l.session_date) = DATE($1)
      ORDER BY l.created_at
    `;

    const summaryQuery = `
      SELECT 
        COUNT(*) as total_items,
        COALESCE(SUM(value * quantity), 0) as total_value,
        COUNT(DISTINCT status) as unique_statuses
      FROM loot
      WHERE DATE(session_date) = DATE($1)
    `;

    const [sessionResult, summaryResult] = await Promise.all([
      dbUtils.executeQuery(sessionQuery, [validatedDate]),
      dbUtils.executeQuery(summaryQuery, [validatedDate])
    ]);

    return controllerFactory.sendSuccessResponse(res, {
      sessionDate: validatedDate.toISOString().split('T')[0],
      items: sessionResult.rows,
      summary: {
        totalItems: parseInt(summaryResult.rows[0].total_items),
        totalValue: parseFloat(summaryResult.rows[0].total_value),
        uniqueStatuses: parseInt(summaryResult.rows[0].unique_statuses)
      }
    }, `Session report for ${validatedDate.toISOString().split('T')[0]} - ${sessionResult.rows.length} items`);
  } catch (error) {
    logger.error('Error fetching session report:', error);
    throw error;
  }
};

// Export controller functions with factory wrappers
module.exports = {
  getKeptPartyLoot: controllerFactory.createHandler(getKeptPartyLoot, {
    errorMessage: 'Error fetching party kept loot'
  }),
  
  getKeptCharacterLoot: controllerFactory.createHandler(getKeptCharacterLoot, {
    errorMessage: 'Error fetching character kept loot'
  }),
  
  getTrashedLoot: controllerFactory.createHandler(getTrashedLoot, {
    errorMessage: 'Error fetching trashed loot'
  }),
  
  getCharacterLedger: controllerFactory.createHandler(getCharacterLedger, {
    errorMessage: 'Error fetching character ledger'
  }),
  
  getUnidentifiedCount: controllerFactory.createHandler(getUnidentifiedCount, {
    errorMessage: 'Error fetching unidentified count'
  }),
  
  getUnprocessedCount: controllerFactory.createHandler(getUnprocessedCount, {
    errorMessage: 'Error fetching unprocessed count'
  }),
  
  getLootStatistics: controllerFactory.createHandler(getLootStatistics, {
    errorMessage: 'Error fetching loot statistics'
  }),
  
  getValueDistribution: controllerFactory.createHandler(getValueDistribution, {
    errorMessage: 'Error fetching value distribution'
  }),
  
  getSessionReport: controllerFactory.createHandler(getSessionReport, {
    errorMessage: 'Error fetching session report'
  })
};