// src/controllers/soldController.js
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');

/**
 * Get all sold items summarized by date
 */
const getAll = async (req, res) => {
    const {startDate, endDate} = req.query;
    let params = [];
    let query = `
        SELECT s.soldon,
               COUNT(l.id)    AS number_of_items,
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
};

/**
 * Get details of items sold on a specific date
 */
const getDetailsByDate = async (req, res) => {
    const {soldon} = req.params;

    if (!soldon) {
        throw controllerFactory.createValidationError('Sold date is required');
    }

    const query = `
        SELECT l.id,
               l.session_date,
               l.quantity,
               l.name,
               s.soldfor,
               l.notes
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
};

module.exports = {
    getAll: controllerFactory.createHandler(getAll, {
        errorMessage: 'Error fetching all sold records'
    }),

    getDetailsByDate: controllerFactory.createHandler(getDetailsByDate, {
        errorMessage: 'Error fetching sold details for date'
    })
};
