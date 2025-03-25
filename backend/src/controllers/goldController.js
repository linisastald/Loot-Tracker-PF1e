const Gold = require('../models/Gold');
const dbUtils = require('../utils/dbUtils');
const controllerUtils = require('../utils/controllerUtils');
const jwt_decode = require('jwt-decode');

/**
 * Create a new gold entry
 */
const createGoldEntry = async (req, res) => {
  const { goldEntries } = req.body;

  // Validate required fields
  if (!goldEntries || !Array.isArray(goldEntries) || goldEntries.length === 0) {
    throw new controllerUtils.ValidationError('Gold entries array is required');
  }

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

  controllerUtils.sendCreatedResponse(res, createdEntries);
};

/**
 * Get all gold entries
 */
const getAllGoldEntries = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    throw new controllerUtils.ValidationError('Start date and end date are required');
  }

  const query = `
    SELECT * FROM gold
    WHERE session_date BETWEEN $1 AND $2
    ORDER BY session_date DESC
  `;
  const result = await dbUtils.executeQuery(query, [startDate, endDate]);

  controllerUtils.sendSuccessResponse(res, result.rows);
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
      throw new controllerUtils.ValidationError('No active characters found');
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
      throw new controllerUtils.ValidationError('No currency to distribute');
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
  }, 'Error distributing gold');
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
      throw new controllerUtils.ValidationError('No active characters found');
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
      throw new controllerUtils.ValidationError('No currency to distribute');
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
  }, 'Error distributing gold plus party loot');
};

/**
 * Define party loot distribution amount
 */
const definePartyLootDistribute = async (req, res) => {
  const { partyLootAmount } = req.body;

  if (!partyLootAmount || isNaN(parseFloat(partyLootAmount)) || parseFloat(partyLootAmount) <= 0) {
    throw new controllerUtils.ValidationError('Valid party loot amount is required');
  }

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
      throw new controllerUtils.ValidationError('No active characters found');
    }

    // Get total gold
    const totalGoldResult = await client.query('SELECT SUM(gold) AS total_gold FROM gold');
    const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);

    if (partyLootAmount > totalGold) {
      throw new controllerUtils.ValidationError('Party loot amount cannot be greater than total gold');
    }

    const remainingGold = totalGold - partyLootAmount;
    const goldPerCharacter = remainingGold / activeCharacters.length;
    const createdEntries = [];

    // Add party loot amount to party loot
    const partyLootEntry = {
      sessionDate: new Date(),
      transactionType: 'Deposit',
      platinum: 0,
      gold: partyLootAmount,
      silver: 0,
      copper: 0,
      notes: 'Defined party loot amount',
      userId,
    };

    const partyLootQuery = `
      INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const partyLootResult = await client.query(partyLootQuery, [
      partyLootEntry.sessionDate,
      partyLootEntry.transactionType,
      partyLootEntry.platinum,
      partyLootEntry.gold,
      partyLootEntry.silver,
      partyLootEntry.copper,
      partyLootEntry.notes
    ]);

    createdEntries.push(partyLootResult.rows[0]);

    for (const character of activeCharacters) {
      const entry = {
        sessionDate: new Date(),
        transactionType: 'Withdrawal',
        platinum: 0,
        gold: -Math.abs(goldPerCharacter),
        silver: 0,
        copper: 0,
        notes: `Distributed to ${character.name}`,
        userId,
      };

      const characterQuery = `
        INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const characterResult = await client.query(characterQuery, [
        entry.sessionDate,
        entry.transactionType,
        entry.platinum,
        entry.gold,
        entry.silver,
        entry.copper,
        entry.notes
      ]);

      createdEntries.push(characterResult.rows[0]);
    }

    return createdEntries;
  }, 'Error defining party loot distribution');
};

/**
 * Define character distribution amount
 */
const defineCharacterDistribute = async (req, res) => {
  const { characterDistributeAmount } = req.body;

  if (!characterDistributeAmount || isNaN(parseFloat(characterDistributeAmount)) || parseFloat(characterDistributeAmount) <= 0) {
    throw new controllerUtils.ValidationError('Valid character distribution amount is required');
  }

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
      throw new controllerUtils.ValidationError('No active characters found');
    }

    // Get total gold
    const totalGoldResult = await client.query('SELECT SUM(gold) AS total_gold FROM gold');
    const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);

    const totalDistributeAmount = characterDistributeAmount * activeCharacters.length;
    if (totalDistributeAmount > totalGold) {
      throw new controllerUtils.ValidationError('Not enough gold to distribute to each character');
    }

    const createdEntries = [];

    for (const character of activeCharacters) {
      const entry = {
        sessionDate: new Date(),
        transactionType: 'Withdrawal',
        platinum: 0,
        gold: -Math.abs(characterDistributeAmount),
        silver: 0,
        copper: 0,
        notes: `Distributed to ${character.name}`,
        userId,
      };

      const query = `
        INSERT INTO gold (session_date, transaction_type, platinum, gold, silver, copper, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await client.query(query, [
        entry.sessionDate,
        entry.transactionType,
        entry.platinum,
        entry.gold,
        entry.silver,
        entry.copper,
        entry.notes
      ]);

      createdEntries.push(result.rows[0]);
    }

    return createdEntries;
  }, 'Error defining character distribution');
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
  }, 'Error balancing currencies');
};

// Wrap all controller functions with error handling
exports.createGoldEntry = controllerUtils.withErrorHandling(createGoldEntry, 'Error creating gold entry');
exports.getAllGoldEntries = controllerUtils.withErrorHandling(getAllGoldEntries, 'Error fetching gold entries');
exports.distributeAllGold = controllerUtils.withErrorHandling(distributeAllGold, 'Error distributing gold');
exports.distributePlusPartyLoot = controllerUtils.withErrorHandling(distributePlusPartyLoot, 'Error distributing gold plus party loot');
exports.definePartyLootDistribute = controllerUtils.withErrorHandling(definePartyLootDistribute, 'Error defining party loot distribution');
exports.defineCharacterDistribute = controllerUtils.withErrorHandling(defineCharacterDistribute, 'Error defining character distribution');
exports.balance = controllerUtils.withErrorHandling(balance, 'Error balancing currencies');

module.exports = exports;