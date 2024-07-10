const express = require('express');
const router = express.Router();
const pool = require('../db');
const goldController = require('../controllers/goldController');
const verifyToken = require('../middleware/auth');

router.post('/', verifyToken, goldController.createGoldEntry);

// Get all gold transactions
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gold');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching gold transactions', error);
    res.status(500).send('Server error');
  }
});

module.exports = router;
