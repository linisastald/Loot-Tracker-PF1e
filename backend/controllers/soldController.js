const Sold = require('../models/Sold');

exports.create = async (req, res) => {
  try {
    const soldItem = await Sold.create(req.body);
    res.status(201).json(soldItem);
  } catch (error) {
    console.error('Error creating sold item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const soldItems = await Sold.findAll();
    res.status(200).json(soldItems);
  } catch (error) {
    console.error('Error fetching sold items:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getDetailsByDate = async (req, res) => {
  try {
    const soldItemsDetails = await Sold.findDetailsByDate(req.params.soldon);
    res.status(200).json(soldItemsDetails);
  } catch (error) {
    console.error('Error fetching sold items details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
