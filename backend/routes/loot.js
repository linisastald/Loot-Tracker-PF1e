const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');

router.post('/', lootController.createLoot);
router.get('/', lootController.getAllLoot);
// Update item status
router.put('/:id', async (req, res) => {
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
