// src/controllers/recurringSessionController.js
// Recurring session template endpoints.
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
        // Use hours-based timing (no conversion needed)
        const sessionData = {
            ...req.body,
            created_by: req.user.id,
            // Use hours directly from frontend (or defaults)
            auto_announce_hours: req.body.auto_announce_hours || 168, // Default: 1 week
            reminder_hours: req.body.reminder_hours || 48, // Default: 2 days
            confirmation_hours: req.body.confirmation_hours || 48, // Default: 2 days
            maximum_players: req.body.maximum_players || 6 // Default maximum players
        };

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

// Get recurring session instances
const getRecurringInstances = async (req, res) => {
    try {
        const { templateId } = req.params;
        const filters = {
            upcoming_only: req.query.upcoming_only === 'true',
            limit: parseInt(req.query.limit) || 10
        };

        const instances = await sessionService.getRecurringSessionInstances(templateId, filters);

        res.json({
            success: true,
            data: instances
        });

    } catch (error) {
        logger.error('Failed to get recurring session instances:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session instances'
        });
    }
};

// Update recurring session template (DM only)
const updateRecurringSession = async (req, res) => {
    try {
        const { templateId } = req.params;
        const updateData = req.body;

        const template = await sessionService.updateRecurringSession(templateId, updateData);

        res.json({
            success: true,
            message: 'Recurring session updated successfully',
            data: template
        });

    } catch (error) {
        logger.error('Failed to update recurring session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update recurring session'
        });
    }
};

// Delete recurring session template (DM only)
const deleteRecurringSession = async (req, res) => {
    try {
        const { templateId } = req.params;
        const deleteFutureInstances = req.query.delete_instances !== 'false';

        const template = await sessionService.deleteRecurringSession(templateId, deleteFutureInstances);

        res.json({
            success: true,
            message: 'Recurring session deleted successfully',
            data: template
        });

    } catch (error) {
        logger.error('Failed to delete recurring session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete recurring session'
        });
    }
};

// Generate additional instances for recurring session (DM only)
const generateAdditionalInstances = async (req, res) => {
    try {
        const { templateId } = req.params;
        const count = req.body.count || 12;

        const instances = await sessionService.generateAdditionalInstances(templateId, count);

        res.json({
            success: true,
            message: `Generated ${instances.length} additional session instances`,
            data: instances
        });

    } catch (error) {
        logger.error('Failed to generate additional instances:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate additional instances'
        });
    }
};

module.exports = {
    createRecurringSession: controllerFactory.createHandler(createRecurringSession, {
        errorMessage: 'Error creating recurring session'
    }),
    getRecurringInstances: controllerFactory.createHandler(getRecurringInstances, {
        errorMessage: 'Error retrieving recurring session instances'
    }),
    updateRecurringSession: controllerFactory.createHandler(updateRecurringSession, {
        errorMessage: 'Error updating recurring session'
    }),
    deleteRecurringSession: controllerFactory.createHandler(deleteRecurringSession, {
        errorMessage: 'Error deleting recurring session'
    }),
    generateAdditionalInstances: controllerFactory.createHandler(generateAdditionalInstances, {
        errorMessage: 'Error generating additional session instances'
    })
};
