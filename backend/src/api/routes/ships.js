const express = require('express');
const router = express.Router();
const shipController = require('../../controllers/shipController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Ship type endpoints
router.get('/types', verifyToken, shipController.getShipTypes);
router.get('/types/:type', verifyToken, shipController.getShipTypeData);

// Ship CRUD endpoints
router.post('/', verifyToken, shipController.createShip);
router.get('/', verifyToken, shipController.getAllShips);
router.put('/:id', verifyToken, shipController.updateShip);
// Deleting is DM-only (owner decision 2026-10-06); creating, editing and status changes stay open to every member
router.delete('/:id', verifyToken, checkRole('DM'), shipController.deleteShip);

// Damage and repair endpoints
router.post('/:id/damage', verifyToken, shipController.applyDamage);
router.post('/:id/repair', verifyToken, shipController.repairShip);

module.exports = router;
