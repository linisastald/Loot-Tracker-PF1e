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
