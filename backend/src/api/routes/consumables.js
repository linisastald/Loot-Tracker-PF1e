// backend/routes/consumables.js
const express = require('express');
const router = express.Router();
const consumablesController = require('../../controllers/consumablesController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

router.get('/', verifyToken, consumablesController.getConsumables);
router.post('/use', verifyToken, consumablesController.useConsumable);
// Owner decision (2026-10-06): charges change only through use, or by a DM.
router.put('/wandcharges', verifyToken, checkRole('DM'), consumablesController.updateWandCharges);

module.exports = router;