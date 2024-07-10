const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');
const verifyToken = require('../middleware/auth');

router.post('/', verifyToken, lootController.createLoot);
router.get('/', verifyToken, lootController.getAllLoot);
router.put('/:id', verifyToken, lootController.updateLootStatus); // Use the updated controller method

module.exports = router;
