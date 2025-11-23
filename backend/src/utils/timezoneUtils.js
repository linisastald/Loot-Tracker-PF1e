/**
 * Timezone utility for managing campaign timezone settings
 * Provides cached access to the campaign timezone configuration
 */

const dbUtils = require('./dbUtils');
const logger = require('./logger');

// Valid IANA timezone identifiers commonly used in North America
const VALID_TIMEZONES = [
    'America/New_York',      // Eastern Time
    'America/Chicago',       // Central Time
    'America/Denver',        // Mountain Time
    'America/Phoenix',       // Arizona (no DST)
    'America/Los_Angeles',   // Pacific Time
    'America/Anchorage',     // Alaska Time
    'America/Honolulu',      // Hawaii Time
    'America/Toronto',       // Eastern Time (Canada)
    'America/Vancouver',     // Pacific Time (Canada)
    'America/Edmonton',      // Mountain Time (Canada)
    'America/Winnipeg',      // Central Time (Canada)
    'America/Halifax',       // Atlantic Time (Canada)
    'America/St_Johns',      // Newfoundland Time (Canada)
    'UTC'                    // Coordinated Universal Time
];

// Cache for timezone setting
let cachedTimezone = null;
let lastFetchTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get the campaign timezone from settings
 * Uses cache to avoid frequent database queries
 * @returns {Promise<string>} IANA timezone identifier (e.g., 'America/New_York')
 */
async function getCampaignTimezone() {
    const now = Date.now();

    // Return cached value if still valid
    if (cachedTimezone && lastFetchTime && (now - lastFetchTime) < CACHE_TTL) {
        return cachedTimezone;
    }

    try {
        const result = await dbUtils.executeQuery(
            'SELECT value FROM settings WHERE name = $1',
            ['campaign_timezone']
        );

        if (result.rows.length > 0) {
            const timezone = result.rows[0].value;

            // Validate timezone
            if (isValidTimezone(timezone)) {
                cachedTimezone = timezone;
                lastFetchTime = now;
                logger.debug(`Campaign timezone loaded: ${timezone}`);
                return timezone;
            } else {
                logger.warn(`Invalid timezone in database: ${timezone}. Using default America/New_York`);
            }
        } else {
            logger.warn('No campaign_timezone setting found. Using default America/New_York');
        }
    } catch (error) {
        logger.error('Error fetching campaign timezone:', error);
    }

    // Fallback to default
    const defaultTimezone = 'America/New_York';
    cachedTimezone = defaultTimezone;
    lastFetchTime = now;
    return defaultTimezone;
}

/**
 * Validate a timezone identifier
 * @param {string} timezone - IANA timezone identifier to validate
 * @returns {boolean} True if timezone is valid
 */
function isValidTimezone(timezone) {
    if (!timezone || typeof timezone !== 'string') {
        return false;
    }

    // Check against whitelist of common timezones
    if (VALID_TIMEZONES.includes(timezone)) {
        return true;
    }

    // Additional validation: try to use the timezone with Intl.DateTimeFormat
    // This will throw if the timezone is invalid
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        logger.info(`Timezone validated using Intl.DateTimeFormat: ${timezone}`);
        return true;
    } catch (error) {
        logger.warn(`Timezone validation failed for: ${timezone}`, error);
        return false;
    }
}

/**
 * Clear the timezone cache
 * Call this after updating the timezone setting to force a refresh
 */
function clearTimezoneCache() {
    cachedTimezone = null;
    lastFetchTime = null;
    logger.info('Timezone cache cleared');
}

/**
 * Get list of valid timezone options for UI
 * @returns {Array<Object>} Array of timezone objects with value and label
 */
function getTimezoneOptions() {
    return [
        { value: 'America/New_York', label: 'Eastern Time (New York)' },
        { value: 'America/Chicago', label: 'Central Time (Chicago)' },
        { value: 'America/Denver', label: 'Mountain Time (Denver)' },
        { value: 'America/Phoenix', label: 'Mountain Time - No DST (Phoenix)' },
        { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
        { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
        { value: 'America/Honolulu', label: 'Hawaii Time (Honolulu)' },
        { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
        { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
        { value: 'America/Edmonton', label: 'Mountain Time (Edmonton)' },
        { value: 'America/Winnipeg', label: 'Central Time (Winnipeg)' },
        { value: 'America/Halifax', label: 'Atlantic Time (Halifax)' },
        { value: 'America/St_Johns', label: 'Newfoundland Time (St. Johns)' },
        { value: 'UTC', label: 'UTC (Coordinated Universal Time)' }
    ];
}

module.exports = {
    getCampaignTimezone,
    isValidTimezone,
    clearTimezoneCache,
    getTimezoneOptions,
    VALID_TIMEZONES
};
