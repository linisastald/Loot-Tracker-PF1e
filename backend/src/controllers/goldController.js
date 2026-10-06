// src/controllers/goldController.js
const Gold = require('../models/Gold');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const GoldDistributionService = require('../services/goldDistributionService');
const { hasDmRights } = require('../utils/roleUtils');

const CURRENCIES = ['platinum', 'gold', 'silver', 'copper'];
const DEBIT_TYPES = ['Withdrawal', 'Purchase', 'Party Loot Purchase'];

/**
 * Parse one denomination of a request entry into an integer (missing = 0).
 * @throws {Error} ValidationError when the value is not a whole number
 */
const parseAmount = (value, currency) => {
    const amount = Number(value ?? 0);
    if (!Number.isInteger(amount)) {
        throw controllerFactory.createValidationError(`${currency} must be a whole number`);
    }
    return amount;
};

/**
 * Create a new gold entry
 */
const createGoldEntry = async (req, res) => {
    const {goldEntries} = req.body;

    if (!goldEntries || !Array.isArray(goldEntries) || goldEntries.length === 0) {
        throw controllerFactory.createValidationError('Gold entries array is required');
    }

    // Resolve who a transaction is attributed to. A DM may attribute a
    // transaction to any character (via the request); a player can only ever
    // attribute it to their own active character, regardless of what the
    // request body claims. This is enforced server-side, not just in the UI.
    const dmRights = hasDmRights(req);
    let playerCharacterId = null;
    if (!dmRights) {
        const charResult = await dbUtils.executeQuery(
            'SELECT id FROM characters WHERE user_id = $1 AND active = true',
            [req.user.id]
        );
        playerCharacterId = charResult.rows.length > 0 ? charResult.rows[0].id : null;
    }

    // Validate and normalise every entry before touching the ledger.
    const preparedEntries = [];
    for (const entry of goldEntries) {
        let characterId;
        if (dmRights) {
            characterId = entry.character_id || null;
            if (characterId) {
                const charCheck = await dbUtils.executeQuery(
                    'SELECT 1 FROM characters WHERE id = $1',
                    [characterId]
                );
                if (charCheck.rows.length === 0) {
                    throw controllerFactory.createValidationError('Selected character not found');
                }
            }
        } else {
            characterId = playerCharacterId;
        }

        // Debits are stored as negative amounts regardless of the sign sent
        const isDebit = DEBIT_TYPES.includes(entry.transactionType);
        const adjustedEntry = {...entry, character_id: characterId};
        for (const currency of CURRENCIES) {
            const amount = parseAmount(entry[currency], currency);
            adjustedEntry[currency] = isDebit ? -Math.abs(amount) : amount;
        }
        preparedEntries.push(adjustedEntry);
    }

    // One transaction under a ledger lock: the balance is read once and tracked
    // as a running total, so concurrent requests cannot both overdraw and a
    // failure part-way leaves no earlier entry committed.
    const createdEntries = await dbUtils.executeTransaction(async (client) => {
        await Gold.lockLedger(client);

        const running = await Gold.getBalance(client);
        const created = [];

        for (const adjustedEntry of preparedEntries) {
            for (const currency of CURRENCIES) {
                running[currency] += adjustedEntry[currency];
                if (running[currency] < 0) {
                    throw controllerFactory.createValidationError('Transaction would result in negative currency balance');
                }
            }
            created.push(await Gold.create(adjustedEntry, client));
        }

        return created;
    }, 'Error creating gold entries');

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

    const result = await Gold.findAll({ startDate, endDate, page, limit });

    // Return paginated response with metadata
    return res.success({
        data: result.transactions,
        pagination: result.pagination
    }, 'Gold entries retrieved successfully');
};

/**
 * Get gold overview totals using the database view for efficiency
 */
const getGoldOverviewTotals = async (req, res) => {
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
};

/**
 * Distribute gold evenly among active characters (GoldDistributionService does
 * the work). Errors propagate to controllerFactory.
 * @param {boolean} includePartyShare - Whether to reserve one share for party loot
 */
const distribute = (includePartyShare) => async (req, res) => {
    const result = await GoldDistributionService.executeDistribution(req.user.id, includePartyShare);
    return res.success(result.entries, result.message);
};

/**
 * Balance currencies by converting coppers to silvers, silvers to gold
 */
const balance = async (req, res) => {
    // Read the totals and insert the balancing row under the ledger lock so two
    // concurrent calls (or a balance racing a withdrawal) cannot both apply.
    const created = await dbUtils.executeTransaction(async (client) => {
        await Gold.lockLedger(client);

        const totals = await Gold.getBalance(client);
        const totalCopper = totals.copper;
        const totalSilver = totals.silver;
        const totalGold = totals.gold;

        // Check if totals are already negative - we can't balance negative amounts
        if (totalCopper < 0 || totalSilver < 0 || totalGold < 0) {
            throw controllerFactory.createValidationError('Cannot balance currencies when any denomination is negative');
        }

        // Convert copper to silver, then silver (including the converted copper) to gold
        const copperToSilver = Math.floor(totalCopper / 10);
        const newCopper = totalCopper % 10;
        const totalSilverAfterConversion = totalSilver + copperToSilver;
        const silverToGold = Math.floor(totalSilverAfterConversion / 10);
        const newSilver = totalSilverAfterConversion % 10;

        // The balancing entry holds the differences that reach the new values
        const goldChange = silverToGold;
        const silverChange = newSilver - totalSilver;
        const copperChange = newCopper - totalCopper;

        // Only create a balance entry if there are actual changes
        if (goldChange === 0 && silverChange === 0 && copperChange === 0) {
            return null;
        }

        return Gold.create({
            sessionDate: new Date(),
            transactionType: 'Balance',
            platinum: 0,
            gold: goldChange,
            silver: silverChange,
            copper: copperChange,
            notes: 'Balanced currencies',
            who: req.user.id
        }, client);
    }, 'Error balancing currencies');

    if (!created) {
        return res.success(null, 'No balancing needed');
    }
    return res.success(created, 'Currencies balanced successfully');
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
    distributeAllGold: controllerFactory.createHandler(distribute(false), {
        errorMessage: 'Error distributing gold'
    }),
    distributePlusPartyLoot: controllerFactory.createHandler(distribute(true), {
        errorMessage: 'Error distributing gold with party loot share'
    }),
    balance: controllerFactory.createHandler(balance, {
        errorMessage: 'Error balancing currencies'
    })
};
