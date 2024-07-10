const Gold = require('../models/Gold');

exports.createGoldEntry = async (req, res) => {
  const { goldEntries } = req.body;
  try {
    const createdEntries = [];
    for (const entry of goldEntries) {
      const createdEntry = await Gold.create(entry);
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
