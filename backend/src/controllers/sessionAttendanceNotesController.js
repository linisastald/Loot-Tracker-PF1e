// src/controllers/sessionAttendanceNotesController.js
// Detailed attendance (timing + notes) endpoints.
//
// Each handler keeps its own try/catch and bare { success, message } error
// responses (client-visible shapes that createHandler's generic error would
// change); createHandler remains as the outer safety net.
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const sessionService = require('../services/sessionService');

// Errors thrown by the attendance service for bad input (unknown session,
// character that is not the caller's) are the caller's mistake, not a 500.
const VALIDATION_STATUS_BY_ERROR_NAME = { ValidationError: 400, NotFoundError: 404 };

// Record detailed attendance with timing and notes
const recordDetailedAttendance = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const userId = req.user.id;

        const attendance = await sessionService.recordAttendance(sessionId, userId, req.body.response_type, req.body);

        res.json({
            success: true,
            message: 'Attendance recorded successfully',
            data: attendance
        });

    } catch (error) {
        const status = VALIDATION_STATUS_BY_ERROR_NAME[error.name];
        if (status) {
            return res.status(status).json({ success: false, message: error.message });
        }
        logger.error('Failed to record detailed attendance:', error);
        res.status(500).json({ success: false, message: 'Failed to record attendance' });
    }
};

// Get detailed session attendance
const getDetailedAttendance = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const attendance = await sessionService.getSessionAttendance(sessionId);

        res.json({ success: true, data: attendance });

    } catch (error) {
        logger.error('Failed to fetch detailed attendance:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
    }
};

module.exports = {
    recordDetailedAttendance: controllerFactory.createHandler(recordDetailedAttendance, {
        errorMessage: 'Error recording detailed attendance'
    }),
    getDetailedAttendance: controllerFactory.createHandler(getDetailedAttendance, {
        errorMessage: 'Error retrieving detailed attendance'
    })
};
