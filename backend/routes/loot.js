const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

// Add the route to parse item description
router.post('/parse-item', lootController.parseItemDescription);

router.post('/', verifyToken, lootController.createLoot);
router.get('/', verifyToken, lootController.getAllLoot);
router.get('/items', verifyToken, lootController.getItems);
router.post('/split-stack', verifyToken, lootController.splitStack);
router.get('/trash', verifyToken, lootController.getTrashedLoot);
router.get('/kept-party', verifyToken, lootController.getKeptPartyLoot);
router.get('/kept-character', verifyToken, lootController.getKeptCharacterLoot);
router.put('/update-status', verifyToken, lootController.updateLootStatus);
router.get('/pending-sale', verifyToken, checkRole('DM'), lootController.getPendingSaleItems);
router.get('/search', verifyToken, checkRole('DM'), lootController.searchItems);
router.put('/confirm-sale', verifyToken, checkRole('DM'), lootController.confirmSale);
router.put('/update-entry/:id', verifyToken, lootController.updateItem);
router.post('/appraise', lootController.appraiseLoot);
router.get('/mods', verifyToken, checkRole('DM'), lootController.getMods);
router.put('/dm-update/:id', verifyToken, checkRole(['DM']), lootController.dmUpdateItem);

router.put('/:id', verifyToken, lootController.updateSingleLootStatus);

module.exports = router;
