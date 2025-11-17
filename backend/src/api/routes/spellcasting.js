const express = require('express');
const router = express.Router();
const spellcastingController = require('../../controllers/spellcastingController');
const verifyToken = require('../../middleware/auth');

// Spellcasting service check endpoint
router.post('/check', verifyToken, spellcastingController.checkSpellcastingService);

// Available spells search
router.get('/spells', verifyToken, spellcastingController.getAvailableSpells);

// Spellcasting service history endpoints
router.get('/', verifyToken, spellcastingController.getAllServices);
router.get('/:id', verifyToken, spellcastingController.getServiceById);
router.delete('/:id', verifyToken, spellcastingController.deleteService);

module.exports = router;
