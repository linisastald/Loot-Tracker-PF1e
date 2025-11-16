// src/utils/cronJobs.js
const cron = require('node-cron');
const axios = require('axios');
const logger = require('./logger');
const Session = require('../models/Session');
const { initSessionCleanup } = require('./sessionCleanup');

/**
 * Initialize cron jobs
 */
const initCronJobs = () => {
    // Initialize session cleanup
    initSessionCleanup();
    
    // Check for sessions needing Discord notifications every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        try {
            logger.info('Running cron job: Check for sessions needing Discord notifications');
            
            // Find sessions needing notifications
            const sessions = await Session.findSessionsNeedingNotifications();
            
            if (sessions.length === 0) {
                logger.info('No sessions need Discord notifications');
                return;
            }
            
            logger.info(`Found ${sessions.length} sessions needing Discord notifications`);
            
            // Process each session
            for (const session of sessions) {
                try {
                    // Send Discord notification
                    await sendDiscordSessionNotification(session);
                    
                    logger.info(`Sent Discord notification for session ${session.id}`);
                } catch (error) {
                    logger.error(`Failed to send Discord notification for session ${session.id}`, {
                        error: error.message,
                        sessionId: session.id
                    });
                }
            }
        } catch (error) {
            logger.error('Error in session notification cron job', {
                error: error.message,
                stack: error.stack
            });
        }
    });
};

/**
 * Helper function to send a Discord notification for a session
 */
const sendDiscordSessionNotification = async (session) => {
    const { sendDiscordSessionNotification } = require('../controllers/sessionController');
    try {
        await sendDiscordSessionNotification(session);
        return true;
    } catch (error) {
        logger.error('Error sending Discord session notification from cron job', {
            error: error.message,
            sessionId: session.id
        });
        throw error;
    }
};

module.exports = {
    initCronJobs
};