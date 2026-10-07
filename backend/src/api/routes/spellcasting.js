const express = require('express');
const router = express.Router();
const spellcastingController = require('../../controllers/spellcastingController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Spellcasting service check endpoint
router.post('/check', verifyToken, spellcastingController.checkSpellcastingService);

// Available spells search
router.get('/spells', verifyToken, spellcastingController.getAvailableSpells);

// Spellcasting service history (owner decision 2026-10-06: DM-only)
router.get('/', verifyToken, checkRole('DM'), spellcastingController.getAllServices);

module.exports = router;
