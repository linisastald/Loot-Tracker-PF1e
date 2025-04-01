// backend/src/api/routes/infamy.js
const express = require('express');
const router = express.Router();
const infamyController = require('../../controllers/infamyController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Get infamy status (all users)
router.get('/status', verifyToken, infamyController.getInfamyStatus);

// Get available impositions
router.get('/impositions', verifyToken, infamyController.getAvailableImpositions);

// Gain infamy at a port
router.post('/gain', verifyToken, infamyController.gainInfamy);

// Adjust infamy (DM only)
router.post('/adjust', verifyToken, checkRole('DM'), infamyController.adjustInfamy);

// Purchase an imposition
router.post('/purchase', verifyToken, infamyController.purchaseImposition);

// Get infamy history
router.get('/history', verifyToken, infamyController.getInfamyHistory);

// Get port visits history
router.get('/ports', verifyToken, infamyController.getPortVisits);

// Set a port as a favored port
router.post('/favored-port', verifyToken, infamyController.setFavoredPort);

// Sacrifice a crew member (Despicable 20+ feature)
router.post('/sacrifice', verifyToken, infamyController.sacrificeCrew);

module.exports = router;