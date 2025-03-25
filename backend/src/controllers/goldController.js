// src/controllers/goldController.js
const Gold = require('../models/Gold');
const dbUtils = require('../utils/dbUtils');
const jwt_decode = require('jwt-decode');

/**
 * Create a new gold entry
 */
const createGoldEntry = async (req, res) => {
  const { goldEntries } = req.body;

  if (!goldEntries || !Array.isArray(goldEntries)) {
    return res.status(400).json({ error: 'Gold entries array is required' });
  }

  const createdEntries = [];

  for (const entry of goldEntries) {
    const { transactionType, platinum, gold, silver, copper } = entry;

    // Adjust values based on transaction type
    const adjustedEntry = {
      ...entry,
      platinum: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(platinum || 0) : (platinum || 0),
      gold: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(gold || 0) : (gold || 0),
      silver: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(silver || 0) : (silver || 0),
      copper: ['Withdrawal', 'Purchase', 'Party Loot Purchase'].includes(transactionType) ? -Math.abs(copper || 0) : (copper || 0)
    };

    try {
      const createdEntry = await Gold.create(adjustedEntry);
      createdEntries.push(createdEntry);
    } catch (error) {
      console.error('Error creating gold entry:', error);
      return res.status(500).json({ error: 'Error creating gold entry' });
    }
  }

  return res.status(201).json(createdEntries);
};

/**
 * Get all gold entries with optional date filtering
 */
const getAllGoldEntries = async (req, res) => {
  // Get query parameters with defaults
  const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
  const endDate = req.query.endDate || new Date(); // Default: current date

  try {
    const query = `
      SELECT * FROM gold
      WHERE session_date BETWEEN $1 AND $2
      ORDER BY session_date DESC
    `;
    const result = await dbUtils.executeQuery(query, [startDate, endDate]);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching gold entries:', error);
    return res.status(500).json({ error: 'Error fetching gold entries' });
  }
};

/**
 * Distribute all gold evenly among active characters
 */
const distributeAllGold = async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    // Get active characters
    const activeCharactersResult = await dbUtils.executeQuery(
      'SELECT id, name FROM characters WHERE active = true'
    );
    const activeCharacters = activeCharactersResult.rows;

    if (activeCharacters.length === 0) {
      return res.status(400).json({ error: 'No active characters found' });
    }

    // Get total balance for each currency
    const totalResult = await dbUtils.executeQuery(
      'SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold'
    );

    const totalPlatinum = parseFloat(totalResult.rows[0].total_platinum) || 0;
    const totalGold = parseFloat(totalResult.rows[0].total_gold) || 0;
    const totalSilver = parseFloat(totalResult.rows[0].total_silver) || 0;
    const totalCopper = parseFloat(totalResult.rows[0].total_copper) || 0;

    const numCharacters = activeCharacters.length;

    // Calculate distribution amounts
    const distributePlatinum = Math.floor(totalPlatinum / numCharacters);
    const distributeGold = Math.floor(totalGold / numCharacters);
    const distributeSilver = Math.floor(totalSilver / numCharacters);
    const distributeCopper = Math.floor(totalCopper / numCharacters);

    if (distributePlatinum === 0 && distributeGold === 0 && distributeSilver === 0 && distributeCopper === 0) {
      return res.status(400).json({ error: 'No currency to distribute' });
    }

    const createdEntries = [];

    // Execute in a transaction
    await dbUtils.executeTransaction(async (client) => {
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
    });

    return res.status(200).json(createdEntries);
  } catch (error) {
    console.error('Error distributing gold:', error);
    return res.status(500).json({ error: 'Error distributing gold' });
  }
};

/**
 * Distribute gold plus party loot (reserves one share for party loot)
 */
const distributePlusPartyLoot = async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    // Get active characters
    const activeCharactersResult = await dbUtils.executeQuery(
      'SELECT id, name FROM characters WHERE active = true'
    );
    const activeCharacters = activeCharactersResult.rows;

    if (activeCharacters.length === 0) {
      return res.status(400).json({ error: 'No active characters found' });
    }

    // Get total balance for each currency
    const totalResult = await dbUtils.executeQuery(
      'SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold'
    );

    const totalPlatinum = parseFloat(totalResult.rows[0].total_platinum) || 0;
    const totalGold = parseFloat(totalResult.rows[0].total_gold) || 0;
    const totalSilver = parseFloat(totalResult.rows[0].total_silver) || 0;
    const totalCopper = parseFloat(totalResult.rows[0].total_copper) || 0;

    const numCharacters = activeCharacters.length;
    // numCharacters + 1 for party loot
    const shareDivisor = numCharacters + 1;

    // Calculate distribution amounts
    const distributePlatinum = Math.floor(totalPlatinum / shareDivisor);
    const distributeGold = Math.floor(totalGold / shareDivisor);
    const distributeSilver = Math.floor(totalSilver / shareDivisor);
    const distributeCopper = Math.floor(totalCopper / shareDivisor);

    if (distributePlatinum === 0 && distributeGold === 0 && distributeSilver === 0 && distributeCopper === 0) {
      return res.status(400).json({ error: 'No currency to distribute' });
    }

    const createdEntries = [];

    // Execute in a transaction
    await dbUtils.executeTransaction(async (client) => {
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
    });

    return res.status(200).json(createdEntries);
  } catch (error) {
    console.error('Error distributing gold plus party loot:', error);
    return res.status(500).json({ error: 'Error distributing gold plus party loot' });
  }
};

/**
 * Balance currencies by converting coppers to silvers, silvers to gold
 */
const balance = async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decodedToken = jwt_decode(token);
    const userId = decodedToken.id;

    // Get total copper and silver
    const totalResult = await dbUtils.executeQuery(
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
      return res.status(200).json({ message: 'No balancing needed' });
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

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error balancing currencies:', error);
    return res.status(500).json({ error: 'Error balancing currencies' });
  }
};

module.exports = {
  createGoldEntry,
  getAllGoldEntries,
  distributeAllGold,
  distributePlusPartyLoot,
  balance
};