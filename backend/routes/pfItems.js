const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ensure this points to your db configuration
const verifyToken = require('../middleware/auth'); // Add this line
//
router.get('/', verifyToken, async (req, res) => {
  const { name } = req.query;
  try {
    const query = `SELECT * FROM pf_items WHERE name ILIKE $1`;
    const values = [`%${name}%`];
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching items', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
