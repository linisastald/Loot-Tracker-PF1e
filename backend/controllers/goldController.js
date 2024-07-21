const Gold = require('../models/Gold');
const pool = require('../db');
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

      // Get total amounts of platinum, gold, silver, and copper
      const totalAmountsResult = await client.query('SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold');
      const totalPlatinum = parseFloat(totalAmountsResult.rows[0].total_platinum) || 0;
      const totalGold = parseFloat(totalAmountsResult.rows[0].total_gold) || 0;
      const totalSilver = parseFloat(totalAmountsResult.rows[0].total_silver) || 0;
      const totalCopper = parseFloat(totalAmountsResult.rows[0].total_copper) || 0;

      if (totalPlatinum === 0 && totalGold === 0 && totalSilver === 0 && totalCopper === 0) {
        return res.status(400).json({ error: 'No amounts available to distribute' });
      }

      const numCharacters = activeCharacters.length;

      // Calculate per character amounts
      const platinumPerCharacter = Math.floor(totalPlatinum / numCharacters);
      const goldPerCharacter = Math.floor(totalGold / numCharacters);
      const silverPerCharacter = Math.floor(totalSilver / numCharacters);
      const copperPerCharacter = Math.floor(totalCopper / numCharacters);

      const createdEntries = [];

      for (const character of activeCharacters) {
        const entry = {
          sessionDate: new Date(),
          transactionType: 'Withdrawal',
          platinum: -Math.abs(platinumPerCharacter),
          gold: -Math.abs(goldPerCharacter),
          silver: -Math.abs(silverPerCharacter),
          copper: -Math.abs(copperPerCharacter),
          notes: `Distributed to ${character.name}`,
          userId,
        };
        const createdEntry = await Gold.create(entry);
        createdEntries.push(createdEntry);
      }

      res.status(201).json(createdEntries);
    } catch (err) {
      console.error('Error during gold distribution:', err);
      res.status(500).json({ error: 'Internal server error during gold distribution' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error connecting to the database:', error);
    res.status(500).json({ error: 'Internal server error connecting to the database' });
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

      // Get total gold
      const totalGoldResult = await client.query('SELECT SUM(platinum) AS total_platinum, SUM(gold) AS total_gold, SUM(silver) AS total_silver, SUM(copper) AS total_copper FROM gold');
      const totalPlatinum = parseFloat(totalGoldResult.rows[0].total_platinum);
      const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);
      const totalSilver = parseFloat(totalGoldResult.rows[0].total_silver);
      const totalCopper = parseFloat(totalGoldResult.rows[0].total_copper);

      const totalValue = totalPlatinum * 10 + totalGold + totalSilver / 10 + totalCopper / 100;
      if (totalValue === 0) {
        return res.status(400).json({ error: 'No gold available to distribute' });
      }

      // Calculate the distribution
      const distributeValue = totalValue / (activeCharacters.length + 1);
      const remainingValue = totalValue - distributeValue * activeCharacters.length;

      const createdEntries = [];

      for (const character of activeCharacters) {
        const entry = {
          sessionDate: new Date(),
          transactionType: 'Withdrawal',
          platinum: 0,
          gold: -Math.abs(distributeValue),
          silver: 0,
          copper: 0,
          notes: `Distributed to ${character.name}`,
          userId,
        };
        const createdEntry = await Gold.create(entry);
        createdEntries.push(createdEntry);
      }

      // Add remaining gold to party loot
      const partyLootEntry = {
        sessionDate: new Date(),
        transactionType: 'Deposit',
        platinum: 0,
        gold: distributeValue,
        silver: 0,
        copper: 0,
        notes: 'Remaining gold to party loot',
        userId,
      };
      const createdPartyLootEntry = await Gold.create(partyLootEntry);
      createdEntries.push(createdPartyLootEntry);

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

      // Update the gold transactions
      await client.query('DELETE FROM gold WHERE copper != 0 OR silver != 0');

      const balanceEntries = [
        {
          sessionDate: new Date(),
          transactionType: 'Balance',
          platinum: 0,
          gold: additionalGold,
          silver: remainingSilver,
          copper: remainingCopper,
          notes: 'Balanced currencies',
          userId,
        },
      ];

      for (const entry of balanceEntries) {
        await Gold.create(entry);
      }

      res.status(201).json(balanceEntries);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error balancing gold', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};