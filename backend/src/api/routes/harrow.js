// backend/src/api/routes/harrow.js
// Harrow Point Tracker routes (Curse of the Crimson Throne flavor module).
// Mounted at /api/harrow with csrfProtection in backend/index.js.
const express = require('express');
const router = express.Router();
const harrowController = require('../../controllers/harrowController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Page state: current chapter, enabled flag, roster + balances (all members)
router.get('/', verifyToken, harrowController.getState);

// One PC's ledger history (all members)
router.get('/:characterId/ledger', verifyToken, harrowController.getCharacterLedger);

// Award points to a single PC (DM only)
router.post('/award', verifyToken, checkRole('DM'), harrowController.award);

// Award helper: bulk award from a physical reading (DM only)
router.post('/award-batch', verifyToken, checkRole('DM'), harrowController.awardBatch);

// Spend points (player on own character, or DM on anyone)
router.post('/spend', verifyToken, harrowController.spend);

// Arbitrary correction (DM only)
router.post('/adjust', verifyToken, checkRole('DM'), harrowController.adjust);

// Advance / set the current chapter (DM only)
router.post('/chapter', verifyToken, checkRole('DM'), harrowController.advanceChapter);

// Record a PC's Choosing card (player on own character, or DM on anyone)
router.post('/choosing', verifyToken, harrowController.setChoosing);

module.exports = router;
