const Sold = require('../models/Sold');
const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');

/**
 * Create a new sold item record
 */
const create = async (req, res) => {
  // Validate required fields
  controllerUtils.validateRequiredFields(req.body, ['lootid', 'soldfor', 'soldon']);

  const soldItem = await Sold.create(req.body);
  controllerUtils.sendCreatedResponse(res, soldItem);
};

/**
 * Get all sold items summarized by date
 */
const getAll = async (req, res) => {
  const query = `
    SELECT
      s.soldon,
      COUNT(l.id) AS number_of_items,
      SUM(s.soldfor) AS total
    FROM sold s
    JOIN loot l ON s.lootid = l.id
    GROUP BY s.soldon
    ORDER BY s.soldon DESC;
  `;

  const result = await dbUtils.executeQuery(query);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

/**
 * Get details of items sold on a specific date
 */
const getDetailsByDate = async (req, res) => {
  const { soldon } = req.params;

  if (!soldon) {
    throw new controllerUtils.ValidationError('Sale date is required');
  }

  const query = `
    SELECT
      l.session_date,
      l.quantity,
      l.name,
      s.soldfor
    FROM sold s
    JOIN loot l ON s.lootid = l.id
    WHERE s.soldon = $1;
  `;

  const result = await dbUtils.executeQuery(query, [soldon]);
  controllerUtils.sendSuccessResponse(res, result.rows);
};

// Wrap all controller functions with error handling
exports.create = controllerUtils.withErrorHandling(create, 'Error creating sold item record');
exports.getAll = controllerUtils.withErrorHandling(getAll, 'Error fetching all sold records');
exports.getDetailsByDate = controllerUtils.withErrorHandling(getDetailsByDate, 'Error fetching sold details for date');

module.exports = exports;