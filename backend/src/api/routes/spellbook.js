const express = require('express');
const router = express.Router();
const spellbookController = require('../../controllers/spellbookController');
const verifyToken = require('../../middleware/auth');

// Viewing a looted spellbook is available to any authenticated user (players
// read the books they find); generation lives under the DM-only loot generator.
router.get('/:lootId', verifyToken, spellbookController.getByLoot);

module.exports = router;
