// src/controllers/recurringSessionController.js
// Recurring session template creation.
//
// Each handler keeps its own try/catch: the failure responses are
// client-visible (several return error.message, create returns a dev-only
// stack in `details`) and differ from createHandler's generic error;
// createHandler remains as the outer safety net.
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const sessionService = require('../services/sessionService');

// Create recurring session (DM only)
const createRecurringSession = async (req, res) => {
    try {
        // Defaults for omitted fields are applied by the service (DEFAULT_VALUES)
        const sessionData = { ...req.body, created_by: req.user.id };

        const result = await sessionService.createRecurringSession(sessionData);

        res.status(201).json({
            success: true,
            message: 'Recurring session created successfully',
            data: result
        });

    } catch (error) {
        logger.error('Failed to create recurring session:', {
            error: error.message,
            stack: error.stack,
            data: req.body
        });
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create recurring session',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

module.exports = {
    createRecurringSession: controllerFactory.createHandler(createRecurringSession, {
        errorMessage: 'Error creating recurring session'
    })
};
