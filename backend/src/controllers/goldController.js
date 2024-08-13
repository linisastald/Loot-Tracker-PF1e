const Gold = require('../models/Gold');
const pool = require('../config/db');
const jwt_decode = require('jwt-decode');

exports.createGoldEntry = async (req, res) => {
  const { goldEntries } = req.body;
  try {
    const createdEntries = [];
    for (const entry of goldEntries) {
      const { transactionType, platinum, gold, silver, copper } = entry;
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
    res.status(201).json(createdEntries);
  } catch (error) {
    console.error('Error creating gold entry', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.getAllGoldEntries = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const query = `
      SELECT * FROM gold
      WHERE session_date BETWEEN $1 AND $2
    `;
    const result = await pool.query(query, [startDate, endDate]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching gold entries', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.distributeAllGold = async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decodedToken = jwt_decode(token);
      const userId = decodedToken.id;

      // Get active characters
      const activeCharactersResult = await client.query('SELECT id, name FROM characters WHERE active = true');
      const activeCharacters = activeCharactersResult.rows;

      if (activeCharacters.length === 0) {
        return res.status(400).json({ error: 'No active characters found' });
      }

      // Get total balance for each currency
      const totalResult = await client.query('SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold');
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
        return;
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
        const createdEntry = await Gold.create(entry);
        createdEntries.push(createdEntry);
      }

      res.status(201).json(createdEntries);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error distributing all gold', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.distributePlusPartyLoot = async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decodedToken = jwt_decode(token);
      const userId = decodedToken.id;

      // Get active characters
      const activeCharactersResult = await client.query('SELECT id, name FROM characters WHERE active = true');
      const activeCharacters = activeCharactersResult.rows;

      if (activeCharacters.length === 0) {
        return res.status(400).json({ error: 'No active characters found' });
      }

      // Get total balance for each currency
      const totalResult = await client.query('SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold');
      const totalPlatinum = parseFloat(totalResult.rows[0].total_platinum);
      const totalGold = parseFloat(totalResult.rows[0].total_gold);
      const totalSilver = parseFloat(totalResult.rows[0].total_silver);
      const totalCopper = parseFloat(totalResult.rows[0].total_copper);

      const numCharacters = activeCharacters.length;

      // Calculate distribution amounts
      const distributePlatinum = Math.floor(totalPlatinum / (numCharacters + 1));
      const distributeGold = Math.floor(totalGold / (numCharacters + 1));
      const distributeSilver = Math.floor(totalSilver / (numCharacters + 1));
      const distributeCopper = Math.floor(totalCopper / (numCharacters + 1));

      if (distributePlatinum === 0 && distributeGold === 0 && distributeSilver === 0 && distributeCopper === 0) {
        return;
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
        const createdEntry = await Gold.create(entry);
        createdEntries.push(createdEntry);
      }

      res.status(201).json(createdEntries);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error distributing gold plus party loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



exports.definePartyLootDistribute = async (req, res) => {
  const { partyLootAmount } = req.body;
  try {
    const client = await pool.connect();
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decodedToken = jwt_decode(token);
      const userId = decodedToken.id;

      // Get active characters
      const activeCharactersResult = await client.query('SELECT id, name FROM characters WHERE active = true');
      const activeCharacters = activeCharactersResult.rows;

      if (activeCharacters.length === 0) {
        return res.status(400).json({ error: 'No active characters found' });
      }

      // Get total gold
      const totalGoldResult = await client.query('SELECT SUM(gold) AS total_gold FROM gold');
      const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);

      if (partyLootAmount > totalGold) {
        return res.status(400).json({ error: 'Party loot amount cannot be greater than total gold' });
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
      const createdPartyLootEntry = await Gold.create(partyLootEntry);
      createdEntries.push(createdPartyLootEntry);

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
        const createdEntry = await Gold.create(entry);
        createdEntries.push(createdEntry);
      }

      res.status(201).json(createdEntries);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error defining party loot distribute', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.defineCharacterDistribute = async (req, res) => {
  const { characterDistributeAmount } = req.body;
  try {
    const client = await pool.connect();
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decodedToken = jwt_decode(token);
      const userId = decodedToken.id;

      // Get active characters
      const activeCharactersResult = await client.query('SELECT id, name FROM characters WHERE active = true');
      const activeCharacters = activeCharactersResult.rows;

      if (activeCharacters.length === 0) {
        return res.status(400).json({ error: 'No active characters found' });
      }

      // Get total gold
      const totalGoldResult = await client.query('SELECT SUM(gold) AS total_gold FROM gold');
      const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);

      const totalDistributeAmount = characterDistributeAmount * activeCharacters.length;
      if (totalDistributeAmount > totalGold) {
        return res.status(400).json({ error: 'Not enough gold to distribute to each character' });
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
        const createdEntry = await Gold.create(entry);
        createdEntries.push(createdEntry);
      }

      res.status(201).json(createdEntries);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error defining character distribute', error);
    res.status500().json({ error: 'Internal server error' });
  }
};
exports.balance = async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decodedToken = jwt_decode(token);
      const userId = decodedToken.id;

      // Get total copper and silver
      const totalResult = await client.query('SELECT SUM(copper) AS total_copper, SUM(silver) AS total_silver FROM gold');
      const totalCopper = parseInt(totalResult.rows[0].total_copper, 10);
      const totalSilver = parseInt(totalResult.rows[0].total_silver, 10);

      // Convert copper to silver
      const additionalSilver = Math.floor(totalCopper / 10);
      const remainingCopper = totalCopper % 10;

      // Convert silver to gold
      const additionalGold = Math.floor((totalSilver + additionalSilver) / 10);
      const remainingSilver = (totalSilver + additionalSilver) % 10;


      // Create a single balance entry
      const balanceEntry = {
        sessionDate: new Date(),
        transactionType: 'Balance',
        platinum: 0,
        gold: additionalGold,
        silver: remainingSilver - totalSilver,
        copper: remainingCopper - totalCopper,
        notes: 'Balanced currencies',
        userId,
      };
      if (balanceEntry.gold === 0 && balanceEntry.silver === 0 && balanceEntry.copper === 0) {
        return;
      }

      // Insert the balance entry
      await Gold.create(balanceEntry);

      res.status(201).json([balanceEntry]);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error balancing gold', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
