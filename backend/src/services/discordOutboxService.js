/**
 * Discord Outbox Service - Implements outbox pattern for reliable Discord messaging
 *
 * This ensures that when database operations succeed but Discord API calls fail,
 * the Discord notifications are not lost and will be retried.
 */

const pool = require('../config/db');
const logger = require('../utils/logger');
const cron = require('node-cron');

class DiscordOutboxService {
    constructor() {
        this.processingJob = null;
        this.isProcessing = false;
    }

    /**
     * Start the outbox processor (cron job)
     */
    start() {
        // Process outbox every minute
        this.processingJob = cron.schedule('* * * * *', async () => {
            if (!this.isProcessing) {
                await this.processOutbox();
            }
        });

        logger.info('Discord outbox processor started (runs every minute)');
    }

    /**
     * Stop the outbox processor
     */
    stop() {
        if (this.processingJob) {
            this.processingJob.stop();
            logger.info('Discord outbox processor stopped');
        }
    }

    /**
     * Add a message to the outbox
     * @param {Object} client - Database client (for transaction)
     * @param {string} messageType - Type of message
     * @param {Object} payload - Message payload
     * @param {number} sessionId - Related session ID (optional)
     */
    async enqueue(client, messageType, payload, sessionId = null) {
        await client.query(`
            INSERT INTO discord_outbox (message_type, payload, session_id, status)
            VALUES ($1, $2, $3, 'pending')
        `, [messageType, JSON.stringify(payload), sessionId]);

        logger.debug('Enqueued Discord message to outbox', {
            messageType,
            sessionId
        });
    }

    /**
     * Calculate exponential backoff delay in milliseconds
     * @param {number} retryCount - Number of retries attempted
     * @returns {number} - Delay in milliseconds
     */
    calculateBackoffDelay(retryCount) {
        // Exponential backoff: 5 minutes * 2^retryCount, capped at 1 hour
        const baseDelayMs = 5 * 60 * 1000; // 5 minutes
        const maxDelayMs = 60 * 60 * 1000; // 1 hour
        return Math.min(baseDelayMs * Math.pow(2, retryCount), maxDelayMs);
    }

    /**
     * Process pending messages in the outbox
     */
    async processOutbox() {
        this.isProcessing = true;

        try {
            // Get pending and failed messages that are ready for retry
            // Uses exponential backoff based on retry_count
            const result = await pool.query(`
                SELECT *,
                    CASE
                        WHEN retry_count = 0 THEN INTERVAL '5 minutes'
                        WHEN retry_count = 1 THEN INTERVAL '10 minutes'
                        WHEN retry_count = 2 THEN INTERVAL '20 minutes'
                        WHEN retry_count = 3 THEN INTERVAL '40 minutes'
                        ELSE INTERVAL '60 minutes'
                    END as retry_delay
                FROM discord_outbox
                WHERE status IN ('pending', 'failed')
                AND retry_count < max_retries
                AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - CASE
                    WHEN retry_count = 0 THEN INTERVAL '5 minutes'
                    WHEN retry_count = 1 THEN INTERVAL '10 minutes'
                    WHEN retry_count = 2 THEN INTERVAL '20 minutes'
                    WHEN retry_count = 3 THEN INTERVAL '40 minutes'
                    ELSE INTERVAL '60 minutes'
                END)
                ORDER BY created_at ASC
                LIMIT 10
            `);

            logger.debug(`Processing ${result.rows.length} outbox messages (with exponential backoff)`);

            for (const message of result.rows) {
                await this.processMessage(message);
            }
        } catch (error) {
            logger.error('Error processing outbox:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a single outbox message
     */
    async processMessage(message) {
        const client = await pool.connect();

        try {
            // Mark as processing
            await client.query(`
                UPDATE discord_outbox
                SET status = 'processing', last_attempt_at = NOW()
                WHERE id = $1
            `, [message.id]);

            // Lazy load sessionService to avoid circular dependency
            const sessionService = require('./sessionService');

            // Process based on message type
            const payload = message.payload;

            switch (message.message_type) {
                case 'session_announcement':
                    await sessionService.postSessionAnnouncement(payload.sessionId);
                    break;

                case 'session_update':
                    await sessionService.updateSessionMessage(payload.sessionId);
                    break;

                case 'session_cancellation':
                    // Send cancellation notification
                    const settings = await sessionService.getDiscordSettings();
                    if (settings.campaign_role_id && settings.discord_channel_id) {
                        const discordService = require('./discordBrokerService');
                        await discordService.sendMessage({
                            channelId: settings.discord_channel_id,
                            content: payload.message
                        });
                    }
                    break;

                default:
                    logger.warn(`Unknown outbox message type: ${message.message_type}`);
            }

            // Mark as sent
            await client.query(`
                UPDATE discord_outbox
                SET status = 'sent', sent_at = NOW()
                WHERE id = $1
            `, [message.id]);

            logger.info('Successfully processed outbox message', {
                id: message.id,
                type: message.message_type
            });

        } catch (error) {
            // Mark as failed and increment retry count
            await client.query(`
                UPDATE discord_outbox
                SET status = 'failed',
                    retry_count = retry_count + 1,
                    last_error = $2
                WHERE id = $1
            `, [message.id, error.message]);

            logger.error('Failed to process outbox message', {
                id: message.id,
                type: message.message_type,
                error: error.message,
                retryCount: message.retry_count + 1
            });
        } finally {
            client.release();
        }
    }

    /**
     * Clean up old sent messages (older than 7 days)
     */
    async cleanup() {
        try {
            const result = await pool.query(`
                DELETE FROM discord_outbox
                WHERE status = 'sent'
                AND sent_at < NOW() - INTERVAL '7 days'
            `);

            if (result.rowCount > 0) {
                logger.info(`Cleaned up ${result.rowCount} old outbox messages`);
            }
        } catch (error) {
            logger.error('Error cleaning up outbox:', error);
        }
    }
}

// Create singleton instance
const discordOutboxService = new DiscordOutboxService();

module.exports = discordOutboxService;
