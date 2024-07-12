const Loot = require('../models/Loot');

exports.createLoot = async (req, res) => {
  const { entries } = req.body;
  try {
    const createdEntries = [];
    for (const entry of entries) {
      const createdEntry = await Loot.create(entry);
      createdEntries.push(createdEntry);
    }
    res.status(201).json(createdEntries);
  } catch (error) {
    console.error('Error creating loot entry', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAllLoot = async (req, res) => {
  try {
    const loot = await Loot.findAll();
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateLootStatus = async (req, res) => {
  const { id } = req.params;
  const { status, userId, whohas } = req.body;

  if (!id || !status || !userId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await Loot.updateStatus(id, status, whohas);
    res.status(200).send('Loot status updated');
  } catch (error) {
    console.error('Error updating loot status', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getKeptPartyLoot = async (req, res) => {
  try {
    const loot = await Loot.findByStatus('Kept Party');
    res.status(200).json(Array.isArray(loot) ? loot : []); // Ensure the response is always an array
  } catch (error) {
    console.error('Error fetching kept party loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getTrashedLoot = async (req, res) => {
  try {
    const loot = await Loot.findByStatus('Trashed');
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching trashed loot', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
exports.getKeptCharacterLoot = async (req, res) => {
  try {
    const loot = await Loot.findByStatus('Kept Self');
    res.status(200).json(loot);
  } catch (error) {
    console.error('Error fetching kept character loot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.splitStack = async (req, res) => {
  const { id, splits, userId } = req.body;

  try {
    await Loot.splitStack(id, splits, userId);
    res.status(200).send('Stack split successfully');
  } catch (error) {
    console.error('Error splitting stack', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateEntry = async (req, res) => {
  const { id } = req.params;
  const { updatedEntry } = req.body;

  try {
    await Loot.updateEntry(id, updatedEntry);
    res.status(200).send('Entry updated successfully');
  } catch (error) {
    console.error('Error updating entry', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

