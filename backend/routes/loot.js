const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.post('/', verifyToken, lootController.createLoot);
router.get('/', verifyToken, lootController.getAllLoot);
router.post('/split-stack', verifyToken, lootController.splitStack);  // Ensure this route is correctly defined
router.get('/trash', verifyToken, lootController.getTrashedLoot);
router.get('/kept-party', verifyToken, lootController.getKeptPartyLoot);
router.get('/kept-character', verifyToken, lootController.getKeptCharacterLoot);
router.put('/update-status', verifyToken, lootController.updateLootStatus);
router.get('/pending-sale', verifyToken, checkRole('DM'), lootController.getPendingSaleItems);
router.get('/search', verifyToken, checkRole('DM'), lootController.searchItems);
router.put('/confirm-sale', verifyToken, checkRole('DM'), lootController.confirmSale);


router.put('/update-entry/:id', verifyToken, lootController.updateEntry);
router.put('/:id', verifyToken, lootController.updateLootStatus);

module.exports = router;