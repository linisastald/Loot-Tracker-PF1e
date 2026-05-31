const express = require('express');
const router = express.Router();
const lootGeneratorController = require('../../controllers/lootGeneratorController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// The loot generator is DM-only.
router.use(verifyToken, checkRole('DM'));

router.get('/settings', lootGeneratorController.getTreasureSettings);
router.post('/settings', lootGeneratorController.updateTreasureSettings);
router.post('/generate', lootGeneratorController.generate);
router.post('/commit', lootGeneratorController.commit);

module.exports = router;
