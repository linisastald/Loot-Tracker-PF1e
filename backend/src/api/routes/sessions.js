const express = require('express');
const router = express.Router();
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');
const verifyDM = require('../../middleware/verifyDM');

// Get all upcoming sessions
router.get('/', verifyToken, sessionController.getUpcomingSessions);

// Get a specific session
router.get('/:id', verifyToken, sessionController.getSession);

// Create a new session (DM only)
router.post('/', verifyToken, verifyDM, sessionController.createSession);

// Update a session (DM only) 
router.put('/:id', verifyToken, verifyDM, sessionController.updateSession);

// Delete a session (DM only)
router.delete('/:id', verifyToken, verifyDM, sessionController.deleteSession);

// Update attendance for a session
router.post('/:id/attendance', verifyToken, sessionController.updateAttendance);

// Trigger manual check for sessions that need notifications (DM only)
router.post('/check-notifications', verifyToken, verifyDM, sessionController.checkAndSendSessionNotifications);

module.exports = router;