/**
 * Discord Outbox Service - Implements outbox pattern for reliable Discord messaging
 *
 * This ensures that when database operations succeed but Discord API calls fail,
 * the Discord notifications are not lost and will be retried.
 */

const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');
const cron = require('node-cron');
const campaignContext = require('../utils/campaignContext');

class DiscordOutboxService {
    constructor() {
        this.processingJob = null;
        this.cleanupJob = null;
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

        // Purge delivered rows once a day (03:17, off the hour to avoid the busy minute)
        this.cleanupJob = cron.schedule('17 3 * * *', async () => {
            await this.cleanup();
        });

        logger.info('Discord outbox processor started (runs every minute)');
    }

    /**
     * Stop the outbox processor
     */
    stop() {
        if (this.processingJob) {
            this.processingJob.stop();
            this.processingJob = null;
            logger.info('Discord outbox processor stopped');
        }
        if (this.cleanupJob) {
            this.cleanupJob.stop();
            this.cleanupJob = null;
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
     * Process pending messages in the outbox
     */
    async processOutbox() {
        this.isProcessing = true;

        try {
            // Get pending and failed messages that are ready for retry, plus rows
            // left in 'processing' for over ten minutes (the process died mid-send
            // or the status update itself failed).
            // Exponential backoff: 5 minutes * 2^retry_count, capped at 60 minutes.
            // Background job: the find-work SELECT runs cross-campaign ('all')
            // so the outbox of every campaign is drained; each message is then
            // processed under its own row's campaign context.
            const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
                SELECT *
                FROM discord_outbox
                WHERE retry_count < max_retries
                AND (
                    (status IN ('pending', 'failed')
                     AND (last_attempt_at IS NULL OR last_attempt_at < NOW()
                          - LEAST(INTERVAL '5 minutes' * POWER(2, retry_count), INTERVAL '60 minutes')))
                    OR
                    (status = 'processing'
                     AND last_attempt_at < NOW() - INTERVAL '10 minutes')
                )
                ORDER BY created_at ASC
                LIMIT 10
            `));

            logger.debug(`Processing ${result.rows.length} outbox messages (with exponential backoff)`);

            for (const message of result.rows) {
                try {
                    // Act under the message's campaign so the session reads,
                    // Discord settings and status updates the processing
                    // performs carry the right tenant context (RLS WITH CHECK).
                    await campaignContext.runWithCampaign(String(message.campaign_id), () =>
                        this.processMessage(message)
                    );
                } catch (error) {
                    // A bad row (e.g. invalid campaign id) must not abort the
                    // rest of the batch.
                    logger.error('Failed to process outbox message in campaign context', {
                        id: message.id,
                        campaignId: message.campaign_id,
                        error: error.message
                    });
                }
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
        try {
            // Mark as processing. A row still in 'processing' was abandoned by an
            // earlier attempt, so picking it up again counts as a retry (a message
            // that keeps killing the process cannot loop forever).
            await dbUtils.executeQuery(`
                UPDATE discord_outbox
                SET status = 'processing',
                    last_attempt_at = NOW(),
                    retry_count = CASE WHEN status = 'processing' THEN retry_count + 1 ELSE retry_count END
                WHERE id = $1
            `, [message.id]);

            // Lazy load sessionService to avoid circular dependency
            const sessionService = require('./sessionService');

            // Process based on message type
            const payload = message.payload;

            switch (message.message_type) {
                case 'session_update':
                    // Resolves false on a failed or unconfigured Discord update
                    if ((await sessionService.updateSessionMessage(payload.sessionId)) === false) {
                        throw new Error('Session message was not updated on Discord');
                    }
                    break;

                default:
                    // Never mark a message we cannot deliver as sent
                    throw new Error(`Unknown outbox message type: ${message.message_type}`);
            }

            // Mark as sent
            await dbUtils.executeQuery(`
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
            await dbUtils.executeQuery(`
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
        }
    }

    /**
     * Clean up old sent messages (older than 7 days)
     *
     * Background maintenance: runs in hardcoded cross-campaign ('all') mode so
     * sent messages from every campaign are purged (discord_outbox is
     * RLS-protected).
     */
    async cleanup() {
        try {
            const result = await campaignContext.runWithCampaign('all', () => dbUtils.executeQuery(`
                DELETE FROM discord_outbox
                WHERE status = 'sent'
                AND sent_at < NOW() - INTERVAL '7 days'
            `));

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
