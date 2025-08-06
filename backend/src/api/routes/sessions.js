const express = require('express');
const router = express.Router();
const sessionController = require('../../controllers/sessionController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const { createValidationMiddleware, validate } = require('../../middleware/validation');

// Get all upcoming sessions
router.get('/', verifyToken, sessionController.getUpcomingSessions);

// Get a specific session with validation
router.get('/:id', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  }
}), verifyToken, sessionController.getSession);

// Create a new session (DM only) with validation
router.post('/', verifyToken, checkRole('DM'), createValidationMiddleware('createSession'), sessionController.createSession);

// Update a session (DM only) with validation
router.put('/:id', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  },
  body: {
    title: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    start_time: { type: 'string', required: true, format: 'datetime' },
    end_time: { type: 'string', required: true, format: 'datetime' },
    description: { type: 'string', required: false, maxLength: 1000 }
  }
}), verifyToken, checkRole('DM'), sessionController.updateSession);

// Delete a session (DM only)
router.delete('/:id', verifyToken, checkRole('DM'), sessionController.deleteSession);

// Update attendance for a session
router.post('/:id/attendance', verifyToken, sessionController.updateAttendance);

// Trigger manual check for sessions that need notifications (DM only)
router.post('/check-notifications', verifyToken, checkRole('DM'), sessionController.checkAndSendSessionNotifications);

module.exports = router;