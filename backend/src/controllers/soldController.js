// src/controllers/soldController.js
const Sold = require('../models/Sold');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Create a new sold item record
 */
const create = async (req, res) => {
  const { lootid, soldfor, soldon, notes } = req.body;

  // Validate lootid exists
  const lootExists = await dbUtils.executeQuery(
    'SELECT id FROM loot WHERE id = $1',
    [lootid]
  );

  if (lootExists.rows.length === 0) {
    throw controllerFactory.createNotFoundError(`Loot item with ID ${lootid} not found`);
  }

  // Create the sold record
  const soldItem = await Sold.create({
    lootid,
    soldfor,
    soldon: soldon || new Date(),
    notes
  });

  // Update the loot item status to "Sold"
  await dbUtils.executeQuery(
    'UPDATE loot SET status = $1 WHERE id = $2',
    ['Sold', lootid]
  );

  controllerFactory.sendCreatedResponse(res, soldItem, 'Item marked as sold successfully');
};

/**
 * Get all sold items summarized by date
 */
const getAll = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let params = [];
    let query = `
      SELECT 
        s.soldon,
        COUNT(l.id) AS number_of_items,
        SUM(s.soldfor) AS total
      FROM sold s
      JOIN loot l ON s.lootid = l.id
    `;

    // Add date filtering if provided
    if (startDate && endDate) {
      query += ` WHERE s.soldon BETWEEN $1 AND $2`;
      params.push(startDate, endDate);
    }

    query += ` GROUP BY s.soldon ORDER BY s.soldon DESC`;

    const result = await dbUtils.executeQuery(query, params);

    // Calculate grand total
    const grandTotal = result.rows.reduce((sum, record) => sum + parseFloat(record.total), 0);

    controllerFactory.sendSuccessResponse(res, {
      records: result.rows,
      total: grandTotal,
      count: result.rows.length
    }, 'Sold items retrieved successfully');
  } catch (error) {
    logger.error('Error fetching sold summary:', error);
    throw error;
  }
};

/**
 * Get details of items sold on a specific date
 */
const getDetailsByDate = async (req, res) => {
  const { soldon } = req.params;

  if (!soldon) {
    throw controllerFactory.createValidationError('Sold date is required');
  }

  try {
    const query = `
      SELECT
        l.id,
        l.session_date,
        l.quantity,
        l.name,
        s.soldfor,
        s.notes
      FROM sold s
      JOIN loot l ON s.lootid = l.id
      WHERE s.soldon::date = $1::date
      ORDER BY l.name
    `;

    const result = await dbUtils.executeQuery(query, [soldon]);

    if (result.rows.length === 0) {
      throw controllerFactory.createNotFoundError(`No items found sold on ${soldon}`);
    }

    // Calculate total for this date
    const total = result.rows.reduce((sum, item) => sum + parseFloat(item.soldfor), 0);

    controllerFactory.sendSuccessResponse(res, {
      date: soldon,
      items: result.rows,
      total,
      count: result.rows.length
    }, `Retrieved ${result.rows.length} items sold on ${soldon}`);
  } catch (error) {
    if (error.name !== 'NotFoundError') {
      logger.error(`Error fetching sold details for date ${soldon}:`, error);
    }
    throw error;
  }
};

/**
 * Get sold statistics by period
 */
const getStatistics = async (req, res) => {
  const { period = 'month', startDate, endDate } = req.query;

  // Validate period
  const validPeriods = ['day', 'week', 'month', 'year'];
  if (!validPeriods.includes(period)) {
    throw controllerFactory.createValidationError(`Invalid period. Must be one of: ${validPeriods.join(', ')}`);
  }

  try {
    // Determine date format for the selected period
    let dateFormat;
    switch(period) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW'; // ISO year and week
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
    }

    // Build query with optional date filtering
    let query = `
      SELECT
        TO_CHAR(s.soldon, $1) AS period,
        COUNT(l.id) AS number_of_items,
        SUM(s.soldfor) AS total
      FROM sold s
      JOIN loot l ON s.lootid = l.id
    `;

    const params = [dateFormat];

    // Add date filtering if provided
    if (startDate && endDate) {
      query += ` WHERE s.soldon BETWEEN $2 AND $3`;
      params.push(startDate, endDate);
    }

    query += ` GROUP BY period ORDER BY period DESC`;

    const result = await dbUtils.executeQuery(query, params);

    controllerFactory.sendSuccessResponse(res, {
      period,
      data: result.rows,
      count: result.rows.length
    }, `Sales statistics by ${period} retrieved successfully`);
  } catch (error) {
    logger.error(`Error fetching sold statistics for period ${period}:`, error);
    throw error;
  }
};

// Define validation rules
const createValidation = {
  requiredFields: ['lootid', 'soldfor']
};

// Create handlers with validation and error handling
module.exports = {
  create: controllerFactory.createHandler(create, {
    errorMessage: 'Error creating sold item record',
    validation: createValidation
  }),

  getAll: controllerFactory.createHandler(getAll, {
    errorMessage: 'Error fetching all sold records'
  }),

  getDetailsByDate: controllerFactory.createHandler(getDetailsByDate, {
    errorMessage: 'Error fetching sold details for date'
  }),

  getStatistics: controllerFactory.createHandler(getStatistics, {
    errorMessage: 'Error fetching sold statistics'
  })
};