// backend/src/api/routes/fame.js
const express = require('express');
const router = express.Router();
const fameController = require('../../controllers/fameController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Get fame settings
router.get('/settings', verifyToken, fameController.getSettings);

// Get fame events list
router.get('/events', verifyToken, fameController.getFameEvents);

// Get fame points for a character
router.get('/:characterId', verifyToken, fameController.getCharacterFame);

// Add fame points (can be done by player or DM)
router.post('/add-points', verifyToken, fameController.addPoints);

// Get fame history for a character
router.get('/history/:characterId', verifyToken, fameController.getFameHistory);

module.exports = router;