// src/controllers/goldController.js
const Gold = require('../models/Gold');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const GoldDistributionService = require('../services/goldDistributionService');

/**
 * Create a new gold entry
 */
const createGoldEntry = async (req, res) => {
    const {goldEntries} = req.body;

    if (!goldEntries || !Array.isArray(goldEntries) || goldEntries.length === 0) {
        throw controllerFactory.createValidationError('Gold entries array is required');
    }

    const createdEntries = [];

    for (const entry of goldEntries) {
        const {transactionType, platinum, gold, silver, copper} = entry;

        // Adjust values based on transaction type
        const adjustedEntry = {
            ...entry,
            platinum: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(platinum || 0) : (platinum || 0),
            gold: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(gold || 0) : (gold || 0),
            silver: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(silver || 0) : (silver || 0),
            copper: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(copper || 0) : (copper || 0)
        };

        // Check if this transaction would cause negative totals
        const totalResult = await dbUtils.executeQuery(
            'SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold'
        );

        const currentPlatinum = parseFloat(totalResult.rows[0].total_platinum) || 0;
        const currentGold = parseFloat(totalResult.rows[0].total_gold) || 0;
        const currentSilver = parseFloat(totalResult.rows[0].total_silver) || 0;
        const currentCopper = parseFloat(totalResult.rows[0].total_copper) || 0;

        const newPlatinum = currentPlatinum + adjustedEntry.platinum;
        const newGold = currentGold + adjustedEntry.gold;
        const newSilver = currentSilver + adjustedEntry.silver;
        const newCopper = currentCopper + adjustedEntry.copper;

        if (newPlatinum < 0 || newGold < 0 || newSilver < 0 || newCopper < 0) {
            throw controllerFactory.createValidationError('Transaction would result in negative currency balance');
        }

        try {
            const createdEntry = await Gold.create(adjustedEntry);
            createdEntries.push(createdEntry);
        } catch (error) {
            logger.error('Error creating gold entry:', error);
            return res.error('Error creating gold entry', 500);
        }
    }

    return res.created(createdEntries, 'Gold entries created successfully');
};

/**
 * Get all gold entries with optional date filtering
 */
const getAllGoldEntries = async (req, res) => {
    // Only apply default date filtering if startDate or endDate are provided
    // This allows the overview to get all data when no dates are specified
    let startDate = req.query.startDate;
    let endDate = req.query.endDate;
    
    // Pagination parameters with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500); // Cap at 500 for performance

    // If neither date is provided, get all entries (for overview)
    // If only one date is provided, use defaults for the other
    if (startDate && !endDate) {
        endDate = new Date();
    } else if (!startDate && endDate) {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    try {
        const result = await Gold.findAll({ startDate, endDate, page, limit });
        
        // Return paginated response with metadata
        return res.success({
            data: result.transactions,
            pagination: result.pagination
        }, 'Gold entries retrieved successfully');
    } catch (error) {
        logger.error('Error fetching gold entries:', error);
        return res.error('Error fetching gold entries', 500);
    }
};

/**
 * Get gold overview totals using the database view for efficiency
 */
const getGoldOverviewTotals = async (req, res) => {
    try {
        const result = await dbUtils.executeQuery('SELECT * FROM gold_totals_view');
        const totals = result.rows[0];

        return res.success({
            platinum: parseInt(totals.total_platinum) || 0,
            gold: parseInt(totals.total_gold) || 0,
            silver: parseInt(totals.total_silver) || 0,
            copper: parseInt(totals.total_copper) || 0,
            fullTotal: parseFloat(totals.total_value_in_gold) || 0,
            totalTransactions: parseInt(totals.total_transactions) || 0,
            lastTransactionDate: totals.last_transaction_date
        }, 'Gold overview totals retrieved successfully');
    } catch (error) {
        logger.error('Error fetching gold overview totals:', error);
        return res.error('Error fetching gold overview totals', 500);
    }
};

/**
 * Helper function to distribute gold
 * Refactored to use GoldDistributionService for better maintainability
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {boolean} includePartyShare - Whether to include a share for party loot
 * @returns {Promise<Object>} - Express response
 */
const distributeGold = async (req, res, includePartyShare) => {
    try {
        const userId = req.user.id;
        
        // Use GoldDistributionService to handle the complex distribution logic
        const result = await GoldDistributionService.executeDistribution(userId, includePartyShare);
        
        return res.success(result.entries, result.message);
    } catch (error) {
        logger.error(`Error distributing gold${includePartyShare ? ' plus party loot' : ''}:`, error);
        throw error; // Let controllerFactory handle the error response
    }
};

/**
 * Distribute all gold evenly among active characters
 */
const distributeAllGold = async (req, res) => {
    return distributeGold(req, res, false);
};

/**
 * Distribute gold plus party loot (reserves one share for party loot)
 */
const distributePlusPartyLoot = async (req, res) => {
    return distributeGold(req, res, true);
};

/**
 * Balance currencies by converting coppers to silvers, silvers to gold
 */
const balance = async (req, res) => {
    try {
        // Get user ID from req.user
        const userId = req.user.id;

        // Get total copper and silver
        const totalResult = await dbUtils.executeQuery(
            'SELECT SUM(copper) AS total_copper, SUM(silver) AS total_silver, SUM(gold) AS total_gold FROM gold'
        );

        const totalCopper = parseInt(totalResult.rows[0].total_copper, 10) || 0;
        const totalSilver = parseInt(totalResult.rows[0].total_silver, 10) || 0;
        const totalGold = parseInt(totalResult.rows[0].total_gold, 10) || 0;

        // Check if totals are already negative - we can't balance negative amounts
        if (totalCopper < 0 || totalSilver < 0 || totalGold < 0) {
            return res.validationError('Cannot balance currencies when any denomination is negative');
        }

        // Calculate the balancing transaction values
        // First convert copper to silver
        const copperToSilver = Math.floor(totalCopper / 10);
        const newCopper = totalCopper % 10;

        // Then convert silver (including newly converted from copper) to gold
        const totalSilverAfterConversion = totalSilver + copperToSilver;
        const silverToGold = Math.floor(totalSilverAfterConversion / 10);
        const newSilver = totalSilverAfterConversion % 10;

        const newGold = totalGold + silverToGold;

        // Create a balancing entry that sets the final values to what they should be
        const balanceEntry = {
            sessionDate: new Date(),
            transactionType: 'Balance',
            platinum: 0,
            gold: silverToGold,  // Add the converted gold
            silver: newSilver - totalSilver,  // The difference to reach the new silver value
            copper: newCopper - totalCopper,  // The difference to reach the new copper value
            notes: 'Balanced currencies',
            userId,
        };

        // Only create a balance entry if there are actual changes
        if (balanceEntry.gold === 0 && balanceEntry.silver === 0 && balanceEntry.copper === 0) {
            return res.success(null, 'No balancing needed');
        }

        // Insert the balance entry
        const query = `
            INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const result = await dbUtils.executeQuery(query, [
            balanceEntry.sessionDate,
            balanceEntry.transactionType,
            balanceEntry.platinum,
            balanceEntry.gold,
            balanceEntry.silver,
            balanceEntry.copper,
            balanceEntry.notes
        ]);

        return res.success(result.rows[0], 'Currencies balanced successfully');
    } catch (error) {
        logger.error('Error balancing currencies:', error);
        return res.error('Error balancing currencies', 500);
    }
};

// Define validation for each endpoint
const createGoldEntryValidation = {
    requiredFields: ['goldEntries']
};

// Use controllerFactory to create handler functions with standardized error handling
// This will automatically validate required fields and handle errors
module.exports = {
    createGoldEntry: controllerFactory.createHandler(createGoldEntry, {
        errorMessage: 'Error creating gold entry',
        validation: createGoldEntryValidation
    }),
    getAllGoldEntries: controllerFactory.createHandler(getAllGoldEntries, {
        errorMessage: 'Error fetching gold entries'
    }),
    getGoldOverviewTotals: controllerFactory.createHandler(getGoldOverviewTotals, {
        errorMessage: 'Error fetching gold overview totals'
    }),
    distributeAllGold: controllerFactory.createHandler(distributeAllGold, {
        errorMessage: 'Error distributing gold'
    }),
    distributePlusPartyLoot: controllerFactory.createHandler(distributePlusPartyLoot, {
        errorMessage: 'Error distributing gold with party loot share'
    }),
    balance: controllerFactory.createHandler(balance, {
        errorMessage: 'Error balancing currencies'
    })
};