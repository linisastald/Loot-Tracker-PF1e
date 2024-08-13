// backend/routes/consumables.js
const express = require('express');
const router = express.Router();
const consumablesController = require('../../controllers/consumablesController');
const verifyToken = require('../../middleware/auth');

router.get('/', verifyToken, consumablesController.getConsumables);
router.post('/use', verifyToken, consumablesController.useConsumable);
router.put('/wandcharges', verifyToken, consumablesController.updateWandCharges);
router.get('/history', verifyToken, consumablesController.getConsumableUseHistory);

module.exports = router;