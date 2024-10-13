const express = require('express');
const router = express.Router();
const calendarController = require('../../controllers/calendarController');
const verifyToken = require('../../middleware/auth');

router.get('/current-date', verifyToken, calendarController.getCurrentDate);
router.post('/next-day', verifyToken, calendarController.advanceDay);
router.get('/notes', verifyToken, calendarController.getNotes);
router.post('/notes', verifyToken, calendarController.saveNote);

module.exports = router;