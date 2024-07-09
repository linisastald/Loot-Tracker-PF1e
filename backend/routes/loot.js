const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');
const verifyToken = require('../middleware/auth'); // Add this line

router.post('/', verifyToken, lootController.createLoot); // Protect route with verifyToken
router.get('/', verifyToken, lootController.getAllLoot);
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status, who } = req.body;

  try {
    await pool.query(
      'UPDATE item SET status = $1, who = $2 WHERE id = $3',
      [status, who, id]
    );
    res.status(200).send('Item status updated');
  } catch (error) {
    console.error('Error updating item status', error);
    res.status(500).send('Server error');
  }
});

module.exports = router;
