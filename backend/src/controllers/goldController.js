// src/controllers/goldController.js
const Gold = require('../models/Gold');
const dbUtils = require('../utils/dbUtils');
const controllerFactory = require('../utils/controllerFactory');
const jwt_decode = require('jwt-decode');

/**
 * Create a new gold entry
 */
const createGoldEntry = async (req, res) => {
  const { goldEntries } = req.body;
  const createdEntries = [];

  for (const entry of goldEntries) {
    const { transactionType, platinum, gold, silver, copper } = entry;

    // Adjust values based on transaction type
    const adjustedEntry = {
      ...entry,
      platinum: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(platinum) : platinum,
      gold: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(gold) : gold,
      silver: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(silver) : silver,
      copper: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(copper) : copper
    };

    const createdEntry = await Gold.create(adjustedEntry);
    createdEntries.push(createdEntry);
  }

  controllerFactory.sendCreatedResponse(res, createdEntries);
};

/**
 * Get all gold entries
 */
const getAllGoldEntries = async (req, res) => {
  const { startDate, endDate } = req.query;

  const query = `
    SELECT * FROM gold
    WHERE session_date BETWEEN $1 AND $2
    ORDER BY session_date DESC
  `;
  const result = await dbUtils.executeQuery(query, [startDate, endDate]);

  controllerFactory.sendSuccessResponse(res, result.rows);
};

/**
 * Distribute all gold evenly among active characters
 */
const distributeAllGold = async (req, res) => {
  return await dbUtils.executeTransaction(async (client) => {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    // Get active characters
    const activeCharactersResult = await client.query(
      'SELECT id, name FROM characters WHERE active = true'
    );
    const activeCharacters = activeCharactersResult.rows;

    if (activeCharacters.length === 0) {
      throw controllerFactory.createValidationError('No active characters found');
    }

    // Get total balance for each currency
    const totalResult = await client.query(
      'SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold'
    );

    const totalPlatinum = parseFloat(totalResult.rows[0].total_platinum);
    const totalGold = parseFloat(totalResult.rows[0].total_gold);
    const totalSilver = parseFloat(totalResult.rows[0].total_silver);
    const totalCopper = parseFloat(totalResult.rows[0].total_copper);

    const numCharacters = activeCharacters.length;

    // Calculate distribution amounts
    const distributePlatinum = Math.floor(totalPlatinum / numCharacters);
    const distributeGold = Math.floor(totalGold / numCharacters);
    const distributeSilver = Math.floor(totalSilver / numCharacters);
    const distributeCopper = Math.floor(totalCopper / numCharacters);

    if (distributePlatinum === 0 && distributeGold === 0 && distributeSilver === 0 && distributeCopper === 0) {
      throw controllerFactory.createValidationError('No currency to distribute');
    }

    const createdEntries = [];

    for (const character of activeCharacters) {
      const entry = {
        sessionDate: new Date(),
        transactionType: 'Withdrawal',
        platinum: -distributePlatinum,
        gold: -distributeGold,
        silver: -distributeSilver,
        copper: -distributeCopper,
        notes: `Distributed to ${character.name}`,
        userId,
      };

      const insertQuery = `
        INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        entry.sessionDate,
        entry.transactionType,
        entry.platinum,
        entry.gold,
        entry.silver,
        entry.copper,
        entry.notes
      ]);

      createdEntries.push(insertResult.rows[0]);
    }

    return createdEntries;
  });
};

/**
 * Distribute gold plus party loot (reserves one share for party loot)
 */
const distributePlusPartyLoot = async (req, res) => {
  return await dbUtils.executeTransaction(async (client) => {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    // Get active characters
    const activeCharactersResult = await client.query(
      'SELECT id, name FROM characters WHERE active = true'
    );
    const activeCharacters = activeCharactersResult.rows;

    if (activeCharacters.length === 0) {
      throw controllerFactory.createValidationError('No active characters found');
    }

    // Get total balance for each currency
    const totalResult = await client.query(
      'SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold'
    );

    const totalPlatinum = parseFloat(totalResult.rows[0].total_platinum);
    const totalGold = parseFloat(totalResult.rows[0].total_gold);
    const totalSilver = parseFloat(totalResult.rows[0].total_silver);
    const totalCopper = parseFloat(totalResult.rows[0].total_copper);

    const numCharacters = activeCharacters.length;
    // numCharacters + 1 for party loot
    const shareDivisor = numCharacters + 1;

    // Calculate distribution amounts
    const distributePlatinum = Math.floor(totalPlatinum / shareDivisor);
    const distributeGold = Math.floor(totalGold / shareDivisor);
    const distributeSilver = Math.floor(totalSilver / shareDivisor);
    const distributeCopper = Math.floor(totalCopper / shareDivisor);

    if (distributePlatinum === 0 && distributeGold === 0 && distributeSilver === 0 && distributeCopper === 0) {
      throw controllerFactory.createValidationError('No currency to distribute');
    }

    const createdEntries = [];

    for (const character of activeCharacters) {
      const entry = {
        sessionDate: new Date(),
        transactionType: 'Withdrawal',
        platinum: -distributePlatinum,
        gold: -distributeGold,
        silver: -distributeSilver,
        copper: -distributeCopper,
        notes: `Distributed to ${character.name}`,
        userId,
      };

      const insertQuery = `
        INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const insertResult = await client.query(insertQuery, [
        entry.sessionDate,
        entry.transactionType,
        entry.platinum,
        entry.gold,
        entry.silver,
        entry.copper,
        entry.notes
      ]);

      createdEntries.push(insertResult.rows[0]);
    }

    return createdEntries;
  });
};

/**
 * Balance currencies by converting coppers to silvers, silvers to gold
 */
const balance = async (req, res) => {
  return await dbUtils.executeTransaction(async (client) => {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    // Get total copper and silver
    const totalResult = await client.query(
      'SELECT SUM(copper) AS total_copper, SUM(silver) AS total_silver, SUM(gold) AS total_gold FROM gold'
    );

    const totalCopper = parseInt(totalResult.rows[0].total_copper, 10) || 0;
    const totalSilver = parseInt(totalResult.rows[0].total_silver, 10) || 0;
    const totalGold = parseInt(totalResult.rows[0].total_gold, 10) || 0;

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
      return { message: 'No balancing needed' };
    }

    // Insert the balance entry
    const query = `
      INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await client.query(query, [
      balanceEntry.sessionDate,
      balanceEntry.transactionType,
      balanceEntry.platinum,
      balanceEntry.gold,
      balanceEntry.silver,
      balanceEntry.copper,
      balanceEntry.notes
    ]);

    return [result.rows[0]];
  });
};

// Define the validation rules
const goldEntriesValidation = {
  requiredFields: ['goldEntries']
};

const dateRangeValidation = {
  requiredFields: ['startDate', 'endDate']
};

// Create handlers with validation
exports.createGoldEntry = controllerFactory.createHandler(createGoldEntry, {
  errorMessage: 'Error creating gold entry',
  validation: goldEntriesValidation
});

exports.getAllGoldEntries = controllerFactory.createHandler(getAllGoldEntries, {
  errorMessage: 'Error fetching gold entries',
  validation: dateRangeValidation
});

exports.distributeAllGold = controllerFactory.createHandler(distributeAllGold, {
  errorMessage: 'Error distributing gold'
});

exports.distributePlusPartyLoot = controllerFactory.createHandler(distributePlusPartyLoot, {
  errorMessage: 'Error distributing gold plus party loot'
});

exports.balance = controllerFactory.createHandler(balance, {
  errorMessage: 'Error balancing currencies'
});