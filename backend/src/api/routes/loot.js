const express = require('express');
const router = express.Router();
// Import the refactored controllers
const itemController = require('../../controllers/itemController');
const itemCreationController = require('../../controllers/itemCreationController');
const reportsController = require('../../controllers/reportsController');
const appraisalController = require('../../controllers/appraisalController');
const salesController = require('../../controllers/salesController');
const identificationService = require('../../services/identificationService');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const logger = require('../../utils/logger');

// Log deprecation warning
logger.warn('Legacy loot routes are being used. These routes will be deprecated. Please migrate to new API endpoints.');

// Legacy route mappings to new controllers
// TODO: Update frontend to use new API endpoints

// Item creation routes -> itemCreationController
router.post('/parse-item', verifyToken, itemCreationController.parseItemDescription);
router.post('/', verifyToken, itemCreationController.createLoot);
router.get('/items-by-id', verifyToken, itemCreationController.getItemsById);
router.get('/mods-by-id', verifyToken, itemCreationController.getModsById);
router.get('/mods', verifyToken, checkRole('DM'), itemCreationController.getMods);

// Item management routes -> itemController  
router.get('/', verifyToken, itemController.getAllLoot);
router.get('/items', verifyToken, itemController.getAllLoot); // Alias
router.post('/split-stack', verifyToken, itemController.splitItemStack);
router.put('/update-status', verifyToken, itemController.updateLootStatus);
router.get('/search', verifyToken, itemController.searchLoot);
router.put('/update-entry/:id', verifyToken, itemController.updateLootItem);
router.put('/dm-update/:id', verifyToken, checkRole('DM'), itemController.updateLootItem);
router.put('/:id', verifyToken, itemController.updateLootItem);

// Reports routes -> reportsController
router.get('/trash', verifyToken, reportsController.getTrashedLoot);
router.get('/kept-party', verifyToken, reportsController.getKeptPartyLoot);
router.get('/kept-character', verifyToken, reportsController.getKeptCharacterLoot);
router.get('/unprocessed-count', reportsController.getUnprocessedCount);
router.get('/character-ledger', verifyToken, reportsController.getCharacterLedger);

// Sales routes -> salesController
router.get('/pending-sale', verifyToken, checkRole('DM'), salesController.getPendingSaleItems);
router.put('/confirm-sale', verifyToken, checkRole('DM'), salesController.confirmSale);
router.post('/sell-up-to', verifyToken, checkRole('DM'), salesController.sellUpTo);
router.post('/sell-all-except', verifyToken, checkRole('DM'), salesController.sellAllExcept);
router.post('/sell-selected', verifyToken, checkRole('DM'), salesController.sellSelected);

// Appraisal and identification routes -> appraisalController
router.post('/appraise', verifyToken, appraisalController.appraiseLoot);
router.get('/unidentified', verifyToken, appraisalController.getUnidentifiedItems);
router.post('/identify', verifyToken, appraisalController.identifyItems);

module.exports = router;