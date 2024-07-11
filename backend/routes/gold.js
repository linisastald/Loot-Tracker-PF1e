const express = require('express');
const router = express.Router();
const goldController = require('../controllers/goldController');
const verifyToken = require('../middleware/auth');

router.post('/', verifyToken, goldController.createGoldEntry);
router.get('/', verifyToken, goldController.getAllGoldEntries);
router.post('/distribute-all', verifyToken, goldController.distributeAllGold);
router.post('/distribute-plus-party-loot', verifyToken, goldController.distributePlusPartyLoot);
router.post('/define-party-loot-distribute', verifyToken, goldController.definePartyLootDistribute);
router.post('/define-character-distribute', verifyToken, goldController.defineCharacterDistribute);

module.exports = router;
