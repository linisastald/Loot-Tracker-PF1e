const express = require('express');
const router = express.Router();
const shipController = require('../../controllers/shipController');
const verifyToken = require('../../middleware/auth');

router.post('/', verifyToken, shipController.createShip);
router.get('/', verifyToken, shipController.getAllShips);
router.get('/:id', verifyToken, shipController.getShipById);
router.put('/:id', verifyToken, shipController.updateShip);
router.delete('/:id', verifyToken, shipController.deleteShip);

module.exports = router;
