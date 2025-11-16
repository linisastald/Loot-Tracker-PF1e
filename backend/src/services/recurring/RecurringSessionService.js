/**
 * RecurringSessionService - Handles recurring session templates and instance generation
 * Extracted from sessionService.js for better separation of concerns
 */

const pool = require('../../config/db');
const logger = require('../../utils/logger');
const { DEFAULT_VALUES } = require('../../constants/sessionConstants');

class RecurringSessionService {
    /**
     * Create a recurring session template and generate instances
     * @param {Object} sessionData - Recurring session configuration
     * @returns {Promise<Object>} - Template and generated instances
     */
    async createRecurringSession(sessionData) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                title,
                start_time,
                end_time,
                description,
                minimum_players = DEFAULT_VALUES.MINIMUM_PLAYERS,
                maximum_players = DEFAULT_VALUES.MAXIMUM_PLAYERS,
                auto_announce_hours = DEFAULT_VALUES.AUTO_ANNOUNCE_HOURS,
                reminder_hours = DEFAULT_VALUES.REMINDER_HOURS,
                auto_cancel_hours = DEFAULT_VALUES.AUTO_CANCEL_HOURS,
                created_by,
                // Recurring fields
                recurring_pattern, // 'weekly', 'biweekly', 'monthly', 'custom'
                recurring_day_of_week, // 0-6 (Sunday = 0)
                recurring_interval = 1, // for custom patterns
                recurring_end_date = null,
                recurring_end_count = null
            } = sessionData;

            // Validate recurring parameters
            if (!recurring_pattern || !['weekly', 'biweekly', 'monthly', 'custom'].includes(recurring_pattern)) {
                throw new Error('Invalid recurring pattern');
            }

            if (recurring_day_of_week === null || recurring_day_of_week === undefined || recurring_day_of_week < 0 || recurring_day_of_week > 6) {
                throw new Error(`Invalid day of week (must be 0-6), received: ${recurring_day_of_week}`);
            }

            if (recurring_pattern === 'custom' && recurring_interval < 1) {
                throw new Error('Custom interval must be at least 1');
            }

            // Create the master recurring session (let database auto-generate the id)
            // Use 'scheduled' status as templates are identified by is_recurring=true
            const sessionResult = await client.query(`
                INSERT INTO game_sessions (
                    title, start_time, end_time, description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                    is_recurring, recurring_pattern, recurring_day_of_week, recurring_interval,
                    recurring_end_date, recurring_end_count, status, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12, $13, $14, $15, 'scheduled', NOW(), NOW())
                RETURNING *
            `, [
                title, start_time, end_time, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                recurring_pattern, recurring_day_of_week, recurring_interval,
                recurring_end_date, recurring_end_count
            ]);

            const recurringSession = sessionResult.rows[0];

            // Generate individual session instances
            const generatedSessions = await this.generateRecurringInstances(client, recurringSession);

            await client.query('COMMIT');

            logger.info(`Created recurring session template: ${recurringSession.id} - ${title}`);
            logger.info(`Generated ${generatedSessions.length} session instances`);

            return {
                template: recurringSession,
                instances: generatedSessions
            };

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to create recurring session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Generate session instances from a recurring template
     * @param {Object} client - Database client (for transactions)
     * @param {Object} template - Recurring session template
     * @returns {Promise<Array>} - Generated session instances
     */
    async generateRecurringInstances(client, template) {
        // Lazy load to avoid circular dependency
        const sessionService = require('../sessionService');

        const instances = [];
        const startDate = new Date(template.start_time);
        const endDate = new Date(template.end_time);
        const sessionDuration = endDate.getTime() - startDate.getTime();

        // Calculate how many instances to generate
        const maxInstances = template.recurring_end_count || 52; // Default to 1 year worth
        const endLimit = template.recurring_end_date ? new Date(template.recurring_end_date) : null;

        let currentDate = new Date(startDate);
        let instanceCount = 0;

        while (instanceCount < maxInstances) {
            if (endLimit && currentDate > endLimit) {
                break;
            }

            // Skip the first instance as it's the template
            if (instanceCount > 0) {
                const instanceStartTime = new Date(currentDate);
                const instanceEndTime = new Date(currentDate.getTime() + sessionDuration);

                try {
                    const instanceResult = await client.query(`
                        INSERT INTO game_sessions (
                            title, start_time, end_time, description, minimum_players, maximum_players,
                            auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                            parent_recurring_id, created_from_recurring, status, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, 'scheduled', NOW(), NOW())
                        RETURNING *
                    `, [
                        `${template.title} - ${this.formatDateForTitle(instanceStartTime)}`,
                        instanceStartTime.toISOString(),
                        instanceEndTime.toISOString(),
                        template.description,
                        template.minimum_players,
                        template.maximum_players,
                        template.auto_announce_hours,
                        template.reminder_hours,
                        template.auto_cancel_hours,
                        template.created_by,
                        template.id
                    ]);

                    instances.push(instanceResult.rows[0]);

                    // Schedule events for this instance
                    await sessionService.scheduleSessionEvents(instanceResult.rows[0]);
                } catch (error) {
                    logger.error(`Failed to create session instance for ${currentDate}:`, error);
                    // Continue with other instances
                }
            }

            instanceCount++;

            // Calculate next occurrence
            currentDate = this.calculateNextOccurrence(currentDate, template.recurring_pattern, template.recurring_interval, template.recurring_day_of_week);
        }

        return instances;
    }

    /**
     * Get instances of a recurring session
     * @param {number} templateId - Recurring template ID
     * @param {Object} filters - Query filters
     * @returns {Promise<Array>} - Session instances
     */
    async getRecurringSessionInstances(templateId, filters = {}) {
        try {
            const { upcoming_only = true, limit = 10 } = filters;

            let whereClause = 'WHERE parent_recurring_id = $1';
            const queryParams = [templateId];

            if (upcoming_only) {
                whereClause += ' AND start_time > NOW()';
            }

            const result = await pool.query(`
                SELECT
                    gs.*,
                    COUNT(sa.id) FILTER (WHERE sa.status = 'accepted') as confirmed_count,
                    COUNT(sa.id) FILTER (WHERE sa.status = 'declined') as declined_count,
                    COUNT(sa.id) FILTER (WHERE sa.status = 'tentative') as maybe_count
                FROM game_sessions gs
                LEFT JOIN session_attendance sa ON gs.id = sa.session_id
                ${whereClause}
                GROUP BY gs.id
                ORDER BY gs.start_time
                LIMIT $2
            `, [...queryParams, limit]);

            return result.rows;

        } catch (error) {
            logger.error('Failed to get recurring session instances:', error);
            throw error;
        }
    }

    /**
     * Update a recurring session template
     * @param {number} templateId - Template ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object>} - Updated template
     */
    async updateRecurringSession(templateId, updateData) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                title,
                description,
                minimum_players,
                maximum_players,
                auto_announce_hours,
                reminder_hours,
                auto_cancel_hours,
                recurring_pattern,
                recurring_day_of_week,
                recurring_interval,
                recurring_end_date,
                recurring_end_count,
                update_instances = false // Whether to update existing instances
            } = updateData;

            // Update the template
            const templateResult = await client.query(`
                UPDATE game_sessions
                SET
                    title = COALESCE($2, title),
                    description = COALESCE($3, description),
                    minimum_players = COALESCE($4, minimum_players),
                    maximum_players = COALESCE($5, maximum_players),
                    auto_announce_hours = COALESCE($6, auto_announce_hours),
                    reminder_hours = COALESCE($7, reminder_hours),
                    auto_cancel_hours = COALESCE($8, auto_cancel_hours),
                    recurring_pattern = COALESCE($9, recurring_pattern),
                    recurring_day_of_week = COALESCE($10, recurring_day_of_week),
                    recurring_interval = COALESCE($11, recurring_interval),
                    recurring_end_date = COALESCE($12, recurring_end_date),
                    recurring_end_count = COALESCE($13, recurring_end_count),
                    updated_at = NOW()
                WHERE id = $1 AND is_recurring = TRUE
                RETURNING *
            `, [
                templateId, title, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, auto_cancel_hours,
                recurring_pattern, recurring_day_of_week, recurring_interval,
                recurring_end_date, recurring_end_count
            ]);

            if (templateResult.rows.length === 0) {
                throw new Error('Recurring session template not found');
            }

            const template = templateResult.rows[0];

            // Update existing instances if requested
            if (update_instances) {
                await client.query(`
                    UPDATE game_sessions
                    SET
                        title = $2,
                        description = COALESCE($3, description),
                        minimum_players = COALESCE($4, minimum_players),
                        maximum_players = COALESCE($5, maximum_players),
                        auto_announce_hours = COALESCE($6, auto_announce_hours),
                        reminder_hours = COALESCE($7, reminder_hours),
                        auto_cancel_hours = COALESCE($8, auto_cancel_hours),
                        updated_at = NOW()
                    WHERE parent_recurring_id = $1 AND start_time > NOW()
                `, [
                    templateId,
                    title ? `${title} - Session` : null,
                    description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, auto_cancel_hours
                ]);
            }

            await client.query('COMMIT');

            logger.info('Recurring session template updated:', { templateId });
            return template;

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to update recurring session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a recurring session template
     * @param {number} templateId - Template ID
     * @param {boolean} deleteFutureInstances - Whether to delete future instances
     * @returns {Promise<Object>} - Deleted template
     */
    async deleteRecurringSession(templateId, deleteFutureInstances = true) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            if (deleteFutureInstances) {
                // Delete future instances (not yet started)
                await client.query(`
                    DELETE FROM game_sessions
                    WHERE parent_recurring_id = $1 AND start_time > NOW()
                `, [templateId]);
            }

            // Delete the template
            const result = await client.query(`
                DELETE FROM game_sessions
                WHERE id = $1 AND is_recurring = TRUE
                RETURNING *
            `, [templateId]);

            if (result.rows.length === 0) {
                throw new Error('Recurring session template not found');
            }

            await client.query('COMMIT');

            logger.info('Recurring session deleted:', {
                templateId,
                deletedInstances: deleteFutureInstances
            });

            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to delete recurring session:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Generate additional instances for a recurring template
     * @param {number} templateId - Template ID
     * @param {number} count - Number of instances to generate
     * @returns {Promise<Array>} - New instances
     */
    async generateAdditionalInstances(templateId, count = 12) {
        try {
            // Lazy load to avoid circular dependency
            const sessionService = require('../sessionService');

            const template = await sessionService.getSession(templateId);
            if (!template || !template.is_recurring) {
                throw new Error('Recurring session template not found');
            }

            // Find the last generated instance
            const lastInstanceResult = await pool.query(`
                SELECT * FROM game_sessions
                WHERE parent_recurring_id = $1
                ORDER BY start_time DESC
                LIMIT 1
            `, [templateId]);

            let lastDate;
            if (lastInstanceResult.rows.length > 0) {
                lastDate = new Date(lastInstanceResult.rows[0].start_time);
            } else {
                lastDate = new Date(template.start_time);
            }

            const client = await pool.connect();
            const newInstances = [];

            try {
                await client.query('BEGIN');

                for (let i = 0; i < count; i++) {
                    lastDate = this.calculateNextOccurrence(
                        lastDate,
                        template.recurring_pattern,
                        template.recurring_interval,
                        template.recurring_day_of_week
                    );

                    // Check if we've exceeded the end conditions
                    if (template.recurring_end_date && lastDate > new Date(template.recurring_end_date)) {
                        break;
                    }

                    const sessionDuration = new Date(template.end_time).getTime() - new Date(template.start_time).getTime();
                    const instanceEndTime = new Date(lastDate.getTime() + sessionDuration);

                    const instanceResult = await client.query(`
                        INSERT INTO game_sessions (
                            title, start_time, end_time, description, minimum_players, maximum_players,
                            auto_announce_hours, reminder_hours, auto_cancel_hours, created_by,
                            parent_recurring_id, created_from_recurring, status, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, 'scheduled', NOW(), NOW())
                        RETURNING *
                    `, [
                        `${template.title} - ${this.formatDateForTitle(lastDate)}`,
                        lastDate.toISOString(),
                        instanceEndTime.toISOString(),
                        template.description,
                        template.minimum_players,
                        template.maximum_players,
                        template.auto_announce_hours,
                        template.reminder_hours,
                        template.auto_cancel_hours,
                        template.created_by,
                        template.id
                    ]);

                    newInstances.push(instanceResult.rows[0]);

                    // Schedule events for this instance
                    await sessionService.scheduleSessionEvents(instanceResult.rows[0]);
                }

                await client.query('COMMIT');

                logger.info('Generated additional recurring instances:', {
                    templateId,
                    count: newInstances.length
                });

                return newInstances;

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }

        } catch (error) {
            logger.error('Failed to generate additional instances:', error);
            throw error;
        }
    }

    /**
     * Calculate the next occurrence date for a recurring pattern
     * @param {Date} currentDate - Current date
     * @param {string} pattern - Recurring pattern
     * @param {number} interval - Interval for custom patterns
     * @param {number} targetDayOfWeek - Target day of week (0-6)
     * @returns {Date} - Next occurrence date
     */
    calculateNextOccurrence(currentDate, pattern, interval, targetDayOfWeek) {
        const nextDate = new Date(currentDate);

        switch (pattern) {
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;

            case 'biweekly':
                nextDate.setDate(nextDate.getDate() + 14);
                break;

            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                // If we're in a shorter month, adjust to the last day
                if (nextDate.getDate() !== currentDate.getDate()) {
                    nextDate.setDate(0); // Go to last day of previous month
                }
                break;

            case 'custom':
                // Custom interval in days
                nextDate.setDate(nextDate.getDate() + (interval * 7)); // Assuming custom is in weeks
                break;

            default:
                throw new Error(`Unknown recurring pattern: ${pattern}`);
        }

        // For weekly patterns, adjust to the correct day of week if needed
        if ((pattern === 'weekly' || pattern === 'biweekly') && targetDayOfWeek !== null) {
            const currentDayOfWeek = nextDate.getDay();
            const daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
            if (daysUntilTarget !== 0) {
                nextDate.setDate(nextDate.getDate() + daysUntilTarget);
            }
        }

        return nextDate;
    }

    /**
     * Format date for session title
     * @param {Date} date - Date to format
     * @returns {string} - Formatted date string
     */
    formatDateForTitle(date) {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
}

// Export singleton instance
module.exports = new RecurringSessionService();
