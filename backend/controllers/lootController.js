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
  const { campaign_id } = req.query;
  const loot = await Loot.findAll(campaign_id);
  res.json(loot);
};

exports.updateLootStatus = async (req, res) => {
  const { id, status } = req.body;
  const updatedItem = await Loot.updateStatus(id, status);
  res.json(updatedItem);
};
