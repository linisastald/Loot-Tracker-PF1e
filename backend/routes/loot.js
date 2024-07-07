const express = require('express');
const { createLoot, getAllLoot, updateLootStatus } = require('../controllers/lootController');
const router = express.Router();

router.post('/', createLoot);
router.get('/', getAllLoot);
router.put('/', updateLootStatus);

module.exports = router;
