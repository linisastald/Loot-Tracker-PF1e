const express = require('express');
const router = express.Router();
const goldController = require('../controllers/goldController');
const verifyToken = require('../middleware/auth');

router.post('/', verifyToken, goldController.createGoldEntry);
router.get('/', verifyToken, goldController.getAllGoldEntries);
router.post('/distribute-all', verifyToken, goldController.distributeAllGold);
router.post('/distribute-plus-party-loot', verifyToken, goldController.distributePlusPartyLoot);

module.exports = router;
