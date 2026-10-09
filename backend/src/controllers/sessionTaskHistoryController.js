// src/controllers/sessionTaskHistoryController.js
// Task assignment history: records the manual pre/during/post task
// assignments made from the Tasks page. Input is validated by the route
// (validateRequest) before these handlers run.
//
// Each handler keeps its own try/catch and bare { success, message } error
// responses (client-visible shapes that createHandler's generic error would
// change); createHandler remains as the outer safety net.
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const SessionTask = require('../models/SessionTask');
const SessionTaskHistory = require('../models/SessionTaskHistory');

// Save a task assignment to history
const saveTaskHistory = async (req, res) => {
    try {
        const {
            session_id = null,
            session_title = null,
            assignments,
            character_count = 0,
            late_count = 0
        } = req.body;

        // Tasks with an announce label (DM Settings -> Task Management) name
        // their assignee in the FOLLOWING session's announcement. Derive that
        // server-side from the saved assignments.
        let announcedTasks = [];
        try {
            const definitions = await SessionTask.getAll(req.campaignId);
            announcedTasks = definitions.filter(task => task.announce_label);
        } catch (lookupError) {
            logger.warn('Failed to load session task definitions for announcement lookup', { error: lookupError.message });
        }
        const { announcements, snackMasterName } =
            SessionTaskHistory.deriveAnnouncements(assignments, announcedTasks);

        const record = await SessionTaskHistory.create({
            sessionId: session_id,
            sessionTitle: session_title,
            assignments,
            characterCount: character_count,
            lateCount: late_count,
            snackMasterName,
            announcements,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            message: 'Task assignment saved',
            data: record
        });

    } catch (error) {
        logger.error('Failed to save task assignment history:', error);
        res.status(500).json({ success: false, message: 'Failed to save task assignment' });
    }
};

// Get task assignment history (most recent first)
const getTaskHistory = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

        const rows = await SessionTaskHistory.getRecent(limit);

        res.json({ success: true, data: rows });

    } catch (error) {
        logger.error('Failed to fetch task assignment history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch task assignment history' });
    }
};

module.exports = {
    saveTaskHistory: controllerFactory.createHandler(saveTaskHistory, {
        errorMessage: 'Error saving task assignment history'
    }),
    getTaskHistory: controllerFactory.createHandler(getTaskHistory, {
        errorMessage: 'Error retrieving task assignment history'
    })
};
