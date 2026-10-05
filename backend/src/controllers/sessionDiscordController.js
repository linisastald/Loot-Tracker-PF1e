// src/controllers/sessionDiscordController.js
// Discord-related session endpoints: manual announcements/reminders, session
// reinstatement, and the user <-> Discord account mapping.
//
// Each handler keeps its own try/catch and bare { success, message } error
// responses (client-visible shapes, including uncancel's 400 and link-discord's
// 23505 handling, that createHandler's generic error would change);
// createHandler remains as the outer safety net.
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const sessionService = require('../services/sessionService');
const Session = require('../models/Session');

// Post session announcement manually
const announceSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const message = await sessionService.postSessionAnnouncement(sessionId);

        if (!message) {
            return res.status(400).json({ success: false, message: 'Discord not configured' });
        }

        res.json({
            success: true,
            message: 'Session announcement posted',
            data: { discordMessageId: message.id }
        });

    } catch (error) {
        logger.error('Failed to post announcement:', error);
        res.status(500).json({ success: false, message: 'Failed to post announcement' });
    }
};

// Send session reminder manually
const remindSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const reminderType = req.body.reminder_type || 'all';

        // Manual reminders sent via API should be marked as manual for cooldown tracking
        await sessionService.sendSessionReminder(sessionId, reminderType, { isManual: true });

        res.json({
            success: true,
            message: 'Reminder sent successfully'
        });

    } catch (error) {
        logger.error('Failed to send reminder:', error);
        res.status(500).json({ success: false, message: 'Failed to send reminder' });
    }
};

// Uncancel a session (DM only)
const uncancelSession = async (req, res) => {
    try {
        const sessionId = req.params.id;
        const session = await sessionService.uncancelSession(sessionId);

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        res.json({
            success: true,
            message: 'Session has been reinstated',
            data: session
        });

    } catch (error) {
        logger.error('Failed to uncancel session:', error);
        res.status(400).json({ success: false, message: error.message || 'Failed to uncancel session' });
    }
};

// Get user's Discord mapping
const getDiscordMapping = async (req, res) => {
    try {
        const mapping = await Session.getUserDiscordMapping(req.user.id);

        if (!mapping) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, data: mapping });

    } catch (error) {
        logger.error('Failed to fetch Discord mapping:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch Discord mapping' });
    }
};

// Link Discord account to user
const linkDiscord = async (req, res) => {
    try {
        const { discord_id, discord_username } = req.body;

        const mapping = await Session.linkUserDiscord(req.user.id, discord_id, discord_username);

        if (!mapping) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            message: 'Discord account linked successfully',
            data: mapping
        });

    } catch (error) {
        if (error.code === '23505') { // unique violation
            return res.status(400).json({
                success: false,
                message: 'This Discord account is already linked to another user'
            });
        }
        logger.error('Failed to link Discord account:', error);
        res.status(500).json({ success: false, message: 'Failed to link Discord account' });
    }
};

module.exports = {
    announceSession: controllerFactory.createHandler(announceSession, {
        errorMessage: 'Error posting session announcement'
    }),
    remindSession: controllerFactory.createHandler(remindSession, {
        errorMessage: 'Error sending session reminder'
    }),
    uncancelSession: controllerFactory.createHandler(uncancelSession, {
        errorMessage: 'Error uncancelling session'
    }),
    getDiscordMapping: controllerFactory.createHandler(getDiscordMapping, {
        errorMessage: 'Error retrieving Discord mapping'
    }),
    linkDiscord: controllerFactory.createHandler(linkDiscord, {
        errorMessage: 'Error linking Discord account'
    })
};
