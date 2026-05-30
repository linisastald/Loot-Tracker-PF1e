const express = require('express');
const router = express.Router();
const calendarController = require('../../controllers/calendarController');
const holidaysController = require('../../controllers/holidaysController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

router.get('/current-date', verifyToken, calendarController.getCurrentDate);
router.post('/next-day', verifyToken, calendarController.advanceDay);
router.post('/advance', verifyToken, calendarController.advanceDays);
router.post('/set-current-date', verifyToken, calendarController.setCurrentDate);
router.get('/notes', verifyToken, calendarController.getNotes);
router.post('/notes', verifyToken, calendarController.createNote);
router.put('/notes/:id', verifyToken, calendarController.updateNote);
router.delete('/notes/:id', verifyToken, calendarController.deleteNote);

// Holidays: everyone can read; only DMs can manage custom holidays.
router.get('/holidays', verifyToken, holidaysController.getHolidays);
router.post('/holidays', verifyToken, checkRole('DM'), holidaysController.createHoliday);
router.put('/holidays/:id', verifyToken, checkRole('DM'), holidaysController.updateHoliday);
router.delete('/holidays/:id', verifyToken, checkRole('DM'), holidaysController.deleteHoliday);

module.exports = router;