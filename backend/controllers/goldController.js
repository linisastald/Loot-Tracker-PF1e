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
  try {
    const goldEntries = await Gold.findAll();
    res.status(200).json(goldEntries);
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

      // Get total gold
      const totalGoldResult = await client.query('SELECT SUM(gold) AS total_gold FROM gold');
      const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);

      if (totalGold === 0) {
        return res.status(400).json({ error: 'No gold available to distribute' });
      }

      // Distribute gold
      const goldPerCharacter = totalGold / activeCharacters.length;
      const createdEntries = [];

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

      // Get total gold
      const totalGoldResult = await client.query('SELECT SUM(gold) AS total_gold FROM gold');
      const totalGold = parseFloat(totalGoldResult.rows[0].total_gold);

      if (totalGold === 0) {
        return res.status(400).json({ error: 'No gold available to distribute' });
      }

      // Distribute gold
      const goldPerCharacter = totalGold / (activeCharacters.length + 1); // +1 for party loot
      const createdEntries = [];

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

      // Add remaining gold to party loot
      const partyLootEntry = {
        sessionDate: new Date(),
        transactionType: 'Deposit',
        platinum: 0,
        gold: goldPerCharacter,
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
    res.status(500).json({ error: 'Internal server error' });
  }
};
