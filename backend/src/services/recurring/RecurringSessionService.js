/**
 * RecurringSessionService - Handles recurring session templates and instance generation
 * Extracted from sessionService.js for better separation of concerns
 */

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const timezoneUtils = require('../../utils/timezoneUtils');
const { DEFAULT_VALUES, VALID_RECURRING_PATTERNS } = require('../../constants/sessionConstants');

// Instances generated when a template has no end count (about a year of weekly sessions)
const DEFAULT_INSTANCE_COUNT = 52;
// Hard cap on the instances one template can generate (two years of weekly sessions)
const MAX_INSTANCE_COUNT = 104;
const DEFAULT_CONFIRMATION_HOURS = 48; // 2 days before
const FALLBACK_TIMEZONE = 'America/New_York';

class RecurringSessionService {
    /**
     * Create a recurring session template and generate instances
     * @param {Object} sessionData - Recurring session configuration
     * @returns {Promise<Object>} - Template and generated instances
     */
    async createRecurringSession(sessionData) {
        const result = await dbUtils.executeTransaction(async (client) => {
            const {
                title,
                start_time,
                end_time,
                description,
                created_by,
                // Recurring fields
                recurring_pattern, // 'weekly', 'biweekly', 'monthly', 'custom'
                recurring_day_of_week // 0-6 (Sunday = 0)
            } = sessionData;

            // Omitted (or null) settings take the defaults; an explicit 0 is kept
            const minimum_players = sessionData.minimum_players ?? DEFAULT_VALUES.MINIMUM_PLAYERS;
            const maximum_players = sessionData.maximum_players ?? DEFAULT_VALUES.MAXIMUM_PLAYERS;
            const auto_announce_hours = sessionData.auto_announce_hours ?? DEFAULT_VALUES.AUTO_ANNOUNCE_HOURS;
            const reminder_hours = sessionData.reminder_hours ?? DEFAULT_VALUES.REMINDER_HOURS;
            const confirmation_hours = sessionData.confirmation_hours ?? DEFAULT_CONFIRMATION_HOURS;
            const recurring_interval = sessionData.recurring_interval || 1; // for custom patterns
            const recurring_end_date = sessionData.recurring_end_date || null;
            const recurring_end_count = sessionData.recurring_end_count || null;

            // Validate recurring parameters
            if (!recurring_pattern || !VALID_RECURRING_PATTERNS.includes(recurring_pattern)) {
                throw new Error('Invalid recurring pattern');
            }

            // Ensure day of week is a valid number
            const dayOfWeek = parseInt(recurring_day_of_week);
            if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
                throw new Error(`Invalid day of week (must be 0-6), received: ${recurring_day_of_week}`);
            }

            // Ensure interval is a valid positive number
            const interval = parseInt(recurring_interval);
            if (recurring_pattern === 'custom' && (isNaN(interval) || interval < 1)) {
                throw new Error(`Custom interval must be at least 1, received: ${recurring_interval}`);
            }

            // Bound how many instances one template can generate
            if (recurring_end_count !== null) {
                const endCount = parseInt(recurring_end_count);
                if (isNaN(endCount) || endCount < 1 || endCount > MAX_INSTANCE_COUNT) {
                    throw new Error(`Recurring end count must be between 1 and ${MAX_INSTANCE_COUNT}, received: ${recurring_end_count}`);
                }
            }

            // Create the master recurring session (let database auto-generate the id)
            // Use 'scheduled' status as templates are identified by is_recurring=true
            const sessionResult = await client.query(`
                INSERT INTO game_sessions (
                    title, start_time, end_time, description, minimum_players, maximum_players,
                    auto_announce_hours, reminder_hours, confirmation_hours, created_by,
                    is_recurring, recurring_pattern, recurring_day_of_week, recurring_interval,
                    recurring_end_date, recurring_end_count, status, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12, $13, $14, $15, 'scheduled', NOW(), NOW())
                RETURNING *
            `, [
                title, start_time, end_time, description, minimum_players, maximum_players,
                auto_announce_hours, reminder_hours, confirmation_hours, created_by,
                recurring_pattern, dayOfWeek, interval,
                recurring_end_date, recurring_end_count
            ]);

            const recurringSession = sessionResult.rows[0];

            // Generate individual session instances
            const generatedSessions = await this.generateRecurringInstances(client, recurringSession);

            logger.info(`Created recurring session template: ${recurringSession.id} - ${title}`);
            logger.info(`Generated ${generatedSessions.length} session instances`);

            return {
                template: recurringSession,
                instances: generatedSessions
            };
        });

        // Schedule reminders after the transaction commits: scheduleSessionEvents
        // runs on its own pooled connection, which cannot see uncommitted session
        // rows (FK violation on session_reminders otherwise).
        const sessionService = require('../sessionService');
        for (const instance of result.instances) {
            await sessionService.scheduleSessionEvents(instance);
        }

        return result;
    }

    /**
     * Generate session instances from a recurring template.
     *
     * A failed instance INSERT propagates: Postgres has already aborted the
     * transaction by then, so carrying on would only roll everything back
     * silently.
     * @param {Object} client - Database client (for transactions)
     * @param {Object} template - Recurring session template
     * @returns {Promise<Array>} - Generated session instances
     */
    async generateRecurringInstances(client, template) {
        // Campaign timezone for DST-aware date calculations (passed down as an
        // argument: this service is a singleton shared by concurrent requests)
        const timezone = await timezoneUtils.getCampaignTimezone();

        const instances = [];
        const startDate = new Date(template.start_time);
        const endDate = new Date(template.end_time);
        const sessionDuration = endDate.getTime() - startDate.getTime();

        // Calculate how many instances to generate
        const maxInstances = Math.min(template.recurring_end_count || DEFAULT_INSTANCE_COUNT, MAX_INSTANCE_COUNT);
        // The end date is inclusive: a session on that calendar day (campaign
        // timezone) is still generated.
        const lastDate = this._dateOnlyString(template.recurring_end_date);
        // Monthly sessions return to the template's day of month after a short month
        const anchorDay = this._wallClockParts(startDate, timezone).day;

        let currentDate = new Date(startDate);
        let instanceCount = 0;

        while (instanceCount < maxInstances) {
            if (lastDate && this._localDateString(currentDate, timezone) > lastDate) {
                break;
            }

            // Skip the first instance as it's the template
            if (instanceCount > 0) {
                const instanceEndTime = new Date(currentDate.getTime() + sessionDuration);

                const instanceResult = await client.query(`
                    INSERT INTO game_sessions (
                        title, start_time, end_time, description, minimum_players, maximum_players,
                        auto_announce_hours, reminder_hours, confirmation_hours, created_by,
                        parent_recurring_id, created_from_recurring, status, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, 'scheduled', NOW(), NOW())
                    RETURNING *
                `, [
                    `${template.title} - ${this.formatDateForTitle(currentDate)}`,
                    currentDate.toISOString(),
                    instanceEndTime.toISOString(),
                    template.description,
                    template.minimum_players,
                    template.maximum_players,
                    template.auto_announce_hours,
                    template.reminder_hours,
                    template.confirmation_hours,
                    template.created_by,
                    template.id
                ]);

                instances.push(instanceResult.rows[0]);
            }

            instanceCount++;

            // Calculate next occurrence
            currentDate = this.calculateNextOccurrence(
                currentDate, template.recurring_pattern, template.recurring_interval,
                template.recurring_day_of_week, timezone, anchorDay
            );
        }

        return instances;
    }

    /**
     * Calculate the next occurrence date for a recurring pattern.
     * DST-aware: preserves wall-clock time in the campaign timezone
     * across daylight saving transitions.
     * @param {Date} currentDate - Current date (UTC)
     * @param {string} pattern - Recurring pattern
     * @param {number} interval - Interval for custom patterns
     * @param {number} targetDayOfWeek - Target day of week (0-6)
     * @param {string} [timezone] - IANA timezone (defaults to America/New_York)
     * @param {number} [anchorDay] - Day of month a monthly pattern returns to after
     *   a short month (defaults to the day of currentDate)
     * @returns {Date} - Next occurrence date (UTC)
     */
    calculateNextOccurrence(currentDate, pattern, interval, targetDayOfWeek, timezone, anchorDay) {
        const tz = timezone || FALLBACK_TIMEZONE;

        // Wall-clock components in the campaign timezone
        const { year, month, day, hour, minute, second } = this._wallClockParts(currentDate, tz);

        let nextYear = year;
        let nextMonth = month; // 1-based
        let nextDay = day;

        switch (pattern) {
            case 'weekly':
                nextDay += 7;
                break;
            case 'biweekly':
                nextDay += 14;
                break;
            case 'monthly': {
                nextMonth += 1;
                if (nextMonth > 12) {
                    nextMonth = 1;
                    nextYear += 1;
                }
                // Same day of month as the anchor, clamped to the last day of the new month
                const lastDayOfMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
                nextDay = Math.min(anchorDay || day, lastDayOfMonth);
                break;
            }
            case 'custom':
                nextDay += (interval * 7);
                break;
            default:
                throw new Error(`Unknown recurring pattern: ${pattern}`);
        }

        // Calendar arithmetic in UTC normalizes day overflow across months
        const target = new Date(Date.UTC(nextYear, nextMonth - 1, nextDay));

        // For weekly patterns, move forward to the correct day of week if needed
        if ((pattern === 'weekly' || pattern === 'biweekly') && targetDayOfWeek !== null && targetDayOfWeek !== undefined) {
            target.setUTCDate(target.getUTCDate() + ((targetDayOfWeek - target.getUTCDay() + 7) % 7));
        }

        // Wall-clock time as if it were UTC, then shift by the timezone offset
        // at that moment to get the real UTC instant
        const utcGuess = new Date(Date.UTC(
            target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), hour, minute, second
        ));
        return new Date(utcGuess.getTime() - this._getTimezoneOffsetMs(utcGuess, tz));
    }

    /**
     * Wall-clock components of an instant in a timezone.
     * @param {Date} date - The instant
     * @param {string} tz - IANA timezone
     * @returns {{year:number, month:number, day:number, hour:number, minute:number, second:number}} month is 1-based
     */
    _wallClockParts(date, tz) {
        // hourCycle h23 renders local midnight as 00 (hour12:false renders 24)
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        });

        const parts = formatter.formatToParts(date);
        const getPart = (type) => parseInt(parts.find(p => p.type === type).value);

        return {
            year: getPart('year'),
            month: getPart('month'),
            day: getPart('day'),
            hour: getPart('hour'),
            minute: getPart('minute'),
            second: getPart('second')
        };
    }

    /**
     * Calendar date (YYYY-MM-DD) of an instant in a timezone.
     */
    _localDateString(date, tz) {
        const { year, month, day } = this._wallClockParts(date, tz);
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    /**
     * YYYY-MM-DD for a DATE column value. node-postgres returns DATE as a Date at
     * local midnight, so its local components are the stored calendar date.
     */
    _dateOnlyString(value) {
        if (!value) return null;
        if (typeof value === 'string') return value.slice(0, 10);
        const date = new Date(value);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    /**
     * Get timezone offset in milliseconds for a given UTC time.
     * Positive = ahead of UTC (e.g., UTC+5 = +5h), negative = behind.
     * @param {Date} utcDate - A UTC date to check offset at
     * @param {string} tz - IANA timezone
     * @returns {number} - Offset in milliseconds
     */
    _getTimezoneOffsetMs(utcDate, tz) {
        const local = this._wallClockParts(utcDate, tz);

        // Build the local time as if it were UTC
        const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);

        // offset = local - UTC
        return localAsUtc - utcDate.getTime();
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
