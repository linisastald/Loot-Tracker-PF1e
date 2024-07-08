const express = require('express');
const router = express.Router();
const goldController = require('../controllers/goldController');

router.post('/', goldController.createGoldEntry);
// Get all gold transactions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gold');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching gold transactions', error);
    res.status(500).send('Server error');
  }
});
module.exports = router;
