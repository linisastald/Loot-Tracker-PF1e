const express = require('express');
const router = express.Router();
const lootController = require('../../controllers/lootController');
const verifyToken = require('../../middleware/auth');

// Add the route to parse item description
router.post('/parse-item', lootController.parseItemDescription);

router.post('/', verifyToken, lootController.createLoot);
router.get('/', verifyToken, lootController.getAllLoot);
router.post('/parse-item', lootController.parseItemDescription);
router.post('/split-stack', verifyToken, lootController.splitStack);
router.get('/trash', verifyToken, lootController.getTrashedLoot);
router.get('/kept-party', verifyToken, lootController.getKeptPartyLoot);
router.get('/kept-character', verifyToken, lootController.getKeptCharacterLoot);
router.put('/update-status', verifyToken, lootController.updateLootStatus);
router.get('/unprocessed-count', lootController.getUnprocessedCount);
router.get('/items-by-id', verifyToken, lootController.getItemsById);
router.get('/mods-by-id', verifyToken, lootController.getModsById);
router.get('/pending-sale', verifyToken, lootController.getPendingSaleItems);
router.get('/search', verifyToken, lootController.searchItems);
router.put('/confirm-sale', verifyToken, lootController.confirmSale);
router.put('/update-entry/:id', verifyToken, lootController.updateItem);
router.post('/appraise', lootController.appraiseLoot);
router.post('/identify', verifyToken, lootController.identifyItems);
router.get('/mods', verifyToken, lootController.getMods);
router.put('/dm-update/:id', verifyToken, lootController.dmUpdateItem);
router.get('/character-ledger', verifyToken, lootController.getCharacterLedger);
router.get('/unidentified', verifyToken, lootController.getUnidentifiedItems);
router.post('/sell-up-to', verifyToken, lootController.sellUpTo);
router.post('/sell-all-except', verifyToken, lootController.sellAllExcept);
router.post('/sell-selected', verifyToken, lootController.sellSelected);

router.put('/:id', verifyToken, lootController.updateSingleLootStatus);

module.exports = router;