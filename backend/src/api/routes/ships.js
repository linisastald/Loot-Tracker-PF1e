const express = require('express');
const router = express.Router();
const shipController = require('../../controllers/shipController');
const verifyToken = require('../../middleware/auth');

// Ship type endpoints
router.get('/types', verifyToken, shipController.getShipTypes);
router.get('/types/:type', verifyToken, shipController.getShipTypeData);

// Ship CRUD endpoints
router.post('/', verifyToken, shipController.createShip);
router.get('/', verifyToken, shipController.getAllShips);
router.get('/:id', verifyToken, shipController.getShipById);
router.put('/:id', verifyToken, shipController.updateShip);
router.delete('/:id', verifyToken, shipController.deleteShip);

// Damage and repair endpoints
router.post('/:id/damage', verifyToken, shipController.applyDamage);
router.post('/:id/repair', verifyToken, shipController.repairShip);

module.exports = router;
