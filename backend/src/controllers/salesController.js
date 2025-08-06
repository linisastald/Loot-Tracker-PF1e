// src/controllers/salesController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ValidationService = require('../services/validationService');
const SalesService = require('../services/salesService');
const { calculateItemSaleValue, calculateTotalSaleValue } = require('../utils/saleValueCalculator');

/**
 * Get all items pending sale
 */
const getPendingSaleItems = async (req, res) => {
  ValidationService.requireDM(req);

  try {
    const items = await SalesService.getPendingSaleItems();

    // Separate valid and invalid items for display
    const { validItems, invalidItems } = SalesService.filterValidSaleItems(items);

    return controllerFactory.sendSuccessResponse(res, {
      items: items,
      validItems: validItems,
      invalidItems: invalidItems,
      summary: {
        total: items.length,
        validCount: validItems.length,
        invalidCount: invalidItems.length
      }
    }, `${items.length} items pending sale (${validItems.length} valid, ${invalidItems.length} invalid)`);
  } catch (error) {
    logger.error('Error fetching pending sale items:', error);
    throw error;
  }
};

/**
 * Confirm sale of all pending items
 */
const confirmSale = async (req, res) => {
  ValidationService.requireDM(req);

  try {
    const saleResult = await SalesService.sellAllPendingItems();

    logger.info(`DM ${req.user.id} confirmed sale of all pending items`, {
      userId: req.user.id,
      soldCount: saleResult.sold.count,
      totalAmount: saleResult.sold.total,
      skippedCount: saleResult.skipped?.count || 0
    });

    return controllerFactory.sendSuccessResponse(res, saleResult, 
      `Successfully sold ${saleResult.sold.count} items for ${saleResult.sold.total} gold`);
  } catch (error) {
    logger.error('Error confirming sale:', error);
    throw error;
  }
};

/**
 * Sell selected items by IDs
 */
const sellSelected = async (req, res) => {
  ValidationService.requireDM(req);
  
  const { itemIds } = req.body;
  ValidationService.validateItems(itemIds, 'itemIds');

  try {
    const saleResult = await SalesService.sellSelectedItems(itemIds);

    logger.info(`DM ${req.user.id} sold selected items`, {
      userId: req.user.id,
      itemIds,
      soldCount: saleResult.sold.count,
      totalAmount: saleResult.sold.total
    });

    return controllerFactory.sendSuccessResponse(res, saleResult,
      `Successfully sold ${saleResult.sold.count} selected items for ${saleResult.sold.total} gold`);
  } catch (error) {
    logger.error('Error selling selected items:', error);
    throw error;
  }
};

/**
 * Sell all items except specified ones
 */
const sellAllExcept = async (req, res) => {
  ValidationService.requireDM(req);
  
  const { keepIds = [] } = req.body;

  if (keepIds.length > 0) {
    ValidationService.validateItems(keepIds, 'keepIds');
  }

  try {
    const saleResult = await SalesService.sellAllExceptItems(keepIds);

    logger.info(`DM ${req.user.id} sold all except specified items`, {
      userId: req.user.id,
      keptCount: keepIds.length,
      soldCount: saleResult.sold.count,
      totalAmount: saleResult.sold.total
    });

    return controllerFactory.sendSuccessResponse(res, saleResult,
      `Successfully sold ${saleResult.sold.count} items for ${saleResult.sold.total} gold, keeping ${keepIds.length} items`);
  } catch (error) {
    logger.error('Error selling all except specified items:', error);
    throw error;
  }
};

/**
 * Sell items up to a specified monetary limit
 */
const sellUpTo = async (req, res) => {
  ValidationService.requireDM(req);
  
  const { maxAmount } = req.body;
  const validatedAmount = ValidationService.validateRequiredNumber(maxAmount, 'maxAmount', { 
    min: 0.01, 
    allowZero: false 
  });

  try {
    const saleResult = await SalesService.sellUpToAmount(validatedAmount);

    logger.info(`DM ${req.user.id} sold items up to ${validatedAmount} gold`, {
      userId: req.user.id,
      maxAmount: validatedAmount,
      soldCount: saleResult.sold.count,
      actualAmount: saleResult.sold.total
    });

    return controllerFactory.sendSuccessResponse(res, saleResult,
      `Successfully sold ${saleResult.sold.count} items for ${saleResult.sold.total} gold (limit: ${validatedAmount} gold)`);
  } catch (error) {
    logger.error('Error selling items up to amount:', error);
    throw error;
  }
};

/**
 * Get sale history with pagination and filtering
 */
const getSaleHistory = async (req, res) => {
  ValidationService.requireDM(req);

  try {
    const { limit = 50, offset = 0, startDate, endDate } = req.query;
    
    const pagination = ValidationService.validatePagination(req.query.page, limit);
    
    const options = {
      limit: pagination.limit,
      offset: pagination.offset
    };

    if (startDate) {
      options.startDate = ValidationService.validateDate(startDate, 'startDate', false);
    }

    if (endDate) {
      options.endDate = ValidationService.validateDate(endDate, 'endDate', false);
    }

    const historyResult = await SalesService.getSaleHistory(options);

    return controllerFactory.sendSuccessResponse(res, {
      sales: historyResult.sales,
      pagination: {
        total: historyResult.total,
        limit: historyResult.limit,
        offset: historyResult.offset,
        page: pagination.page,
        totalPages: Math.ceil(historyResult.total / historyResult.limit),
        hasMore: (historyResult.offset + historyResult.limit) < historyResult.total
      }
    }, `Retrieved ${historyResult.sales.length} sale records`);
  } catch (error) {
    logger.error('Error fetching sale history:', error);
    throw error;
  }
};

/**
 * Get sale statistics
 */
const getSaleStatistics = async (req, res) => {
  ValidationService.requireDM(req);

  try {
    const { days = 30 } = req.query;
    const validatedDays = ValidationService.validateRequiredNumber(days, 'days', { min: 1, max: 365 });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - validatedDays);

    const statsQuery = `
      SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(s.soldfor), 0) as total_revenue,
        COALESCE(AVG(s.soldfor), 0) as average_sale_value,
        COALESCE(MIN(s.soldfor), 0) as min_sale_value,
        COALESCE(MAX(s.soldfor), 0) as max_sale_value
      FROM sold s
      WHERE s.soldon >= $1
    `;

    const dailyStatsQuery = `
      SELECT 
        DATE(s.soldon) as sale_date,
        COUNT(*) as daily_sales,
        COALESCE(SUM(s.soldfor), 0) as daily_revenue
      FROM sold s
      WHERE s.soldon >= $1
      GROUP BY DATE(s.soldon)
      ORDER BY sale_date DESC
    `;

    const [statsResult, dailyStatsResult] = await Promise.all([
      dbUtils.executeQuery(statsQuery, [startDate]),
      dbUtils.executeQuery(dailyStatsQuery, [startDate])
    ]);

    const stats = {
      period: {
        days: validatedDays,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      },
      summary: {
        totalSales: parseInt(statsResult.rows[0].total_sales),
        totalRevenue: parseFloat(statsResult.rows[0].total_revenue),
        averageSaleValue: parseFloat(statsResult.rows[0].average_sale_value),
        minSaleValue: parseFloat(statsResult.rows[0].min_sale_value),
        maxSaleValue: parseFloat(statsResult.rows[0].max_sale_value)
      },
      dailyBreakdown: dailyStatsResult.rows.map(row => ({
        date: row.sale_date,
        sales: parseInt(row.daily_sales),
        revenue: parseFloat(row.daily_revenue)
      }))
    };

    return controllerFactory.sendSuccessResponse(res, stats, 
      `Sale statistics for the last ${validatedDays} days`);
  } catch (error) {
    logger.error('Error fetching sale statistics:', error);
    throw error;
  }
};

/**
 * Cancel pending sale status for items
 */
const cancelPendingSale = async (req, res) => {
  ValidationService.requireDM(req);
  
  const { itemIds } = req.body;
  ValidationService.validateItems(itemIds, 'itemIds');

  try {
    const result = await dbUtils.executeQuery(
      "UPDATE loot SET status = 'Unprocessed' WHERE id = ANY($1) AND status = 'Pending Sale' RETURNING id, name",
      [itemIds]
    );

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError('No items found with pending sale status');
    }

    logger.info(`DM ${req.user.id} cancelled pending sale for ${result.rows.length} items`, {
      userId: req.user.id,
      itemIds,
      cancelledCount: result.rows.length
    });

    return controllerFactory.sendSuccessResponse(res, {
      cancelledItems: result.rows,
      count: result.rows.length
    }, `Cancelled pending sale status for ${result.rows.length} items`);
  } catch (error) {
    logger.error('Error cancelling pending sale:', error);
    throw error;
  }
};

/**
 * Calculate sale values for items without actually selling them
 * Useful for frontend display purposes
 */
const calculateSaleValues = async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      throw controllerFactory.createValidationError('Items array is required');
    }

    if (items.length === 0) {
      return controllerFactory.sendSuccessResponse(res, {
        items: [],
        totalSaleValue: 0,
        validCount: 0,
        invalidCount: 0
      }, 'No items to calculate');
    }

    // Calculate sale values for each item
    const calculatedItems = items.map(item => {
      const saleValue = calculateItemSaleValue(item);
      const quantity = parseInt(item.quantity) || 1;
      const totalItemValue = saleValue * quantity;
      
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        value: parseFloat(item.value) || 0,
        quantity: quantity,
        saleValue: parseFloat(saleValue.toFixed(2)),
        totalSaleValue: parseFloat(totalItemValue.toFixed(2)),
        canSell: item.unidentified !== true && item.value !== null && item.value !== undefined
      };
    });

    // Calculate totals
    const totalSaleValue = calculateTotalSaleValue(items);
    const validItems = calculatedItems.filter(item => item.canSell);
    const invalidItems = calculatedItems.filter(item => !item.canSell);

    return controllerFactory.sendSuccessResponse(res, {
      items: calculatedItems,
      totalSaleValue: parseFloat(totalSaleValue.toFixed(2)),
      validCount: validItems.length,
      invalidCount: invalidItems.length,
      summary: {
        validTotal: parseFloat(calculateTotalSaleValue(items.filter(item => 
          item.unidentified !== true && item.value !== null && item.value !== undefined
        )).toFixed(2)),
        invalidTotal: parseFloat(calculateTotalSaleValue(items.filter(item => 
          item.unidentified === true || item.value === null || item.value === undefined
        )).toFixed(2))
      }
    }, `Calculated sale values for ${items.length} items`);

  } catch (error) {
    logger.error('Error calculating sale values:', error);
    throw error;
  }
};

// Export controller functions with factory wrappers
module.exports = {
  getPendingSaleItems: controllerFactory.createHandler(getPendingSaleItems, {
    errorMessage: 'Error fetching pending sale items'
  }),
  
  confirmSale: controllerFactory.createHandler(confirmSale, {
    errorMessage: 'Error confirming sale'
  }),
  
  sellSelected: controllerFactory.createHandler(sellSelected, {
    errorMessage: 'Error selling selected items'
  }),
  
  sellAllExcept: controllerFactory.createHandler(sellAllExcept, {
    errorMessage: 'Error selling items except specified'
  }),
  
  sellUpTo: controllerFactory.createHandler(sellUpTo, {
    errorMessage: 'Error selling items up to amount'
  }),
  
  getSaleHistory: controllerFactory.createHandler(getSaleHistory, {
    errorMessage: 'Error fetching sale history'
  }),
  
  getSaleStatistics: controllerFactory.createHandler(getSaleStatistics, {
    errorMessage: 'Error fetching sale statistics'
  }),
  
  cancelPendingSale: controllerFactory.createHandler(cancelPendingSale, {
    errorMessage: 'Error cancelling pending sale'
  }),

  calculateSaleValues: controllerFactory.createHandler(calculateSaleValues, {
    errorMessage: 'Error calculating sale values'
  })
};