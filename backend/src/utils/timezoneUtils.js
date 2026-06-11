/**
 * Timezone utility for managing campaign timezone settings
 * Provides cached, per-campaign access to the campaign timezone configuration
 * (campaign_settings via the campaignSettings helper, with the deprecated
 * global settings row as transition fallback).
 */

const campaignSettings = require('./campaignSettings');
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

// Per-campaign cache for the timezone setting: campaignId -> { timezone, fetchedAt }
const timezoneCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Timezone used when the setting is missing or invalid.
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Get the timezone configured for a campaign.
 *
 * The campaign is resolved from the active campaign context unless an
 * explicit campaignId is passed. Callers running in cross-campaign ('all')
 * mode (background find-work phases) MUST pass the campaign id of the row
 * they are processing — implicit resolution throws there.
 *
 * Uses a per-campaign cache to avoid frequent database queries.
 *
 * @param {Object} [options]
 * @param {number|string} [options.campaignId] - Explicit campaign id
 * @returns {Promise<string>} IANA timezone identifier (e.g., 'America/New_York')
 */
async function getCampaignTimezone({ campaignId } = {}) {
    // Resolve outside the try block: an 'all'-context caller without an
    // explicit campaignId is a programming error and must surface, not be
    // swallowed into the default timezone.
    const resolvedId = campaignSettings.resolveCampaignId(campaignId);
    const now = Date.now();

    const cached = timezoneCache.get(resolvedId);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL) {
        return cached.timezone;
    }

    try {
        const timezone = await campaignSettings.getCampaignSetting('campaign_timezone', {
            campaignId: resolvedId
        });

        if (timezone !== undefined) {
            // Validate timezone
            if (isValidTimezone(timezone)) {
                timezoneCache.set(resolvedId, { timezone, fetchedAt: now });
                logger.debug(`Campaign timezone loaded for campaign ${resolvedId}: ${timezone}`);
                return timezone;
            }
            logger.warn(`Invalid timezone in database for campaign ${resolvedId}: ${timezone}. Using default ${DEFAULT_TIMEZONE}`);
        } else {
            logger.warn(`No campaign_timezone setting found for campaign ${resolvedId}. Using default ${DEFAULT_TIMEZONE}`);
        }
    } catch (error) {
        logger.error(`Error fetching campaign timezone for campaign ${resolvedId}:`, error);
    }

    // Fallback to default
    timezoneCache.set(resolvedId, { timezone: DEFAULT_TIMEZONE, fetchedAt: now });
    return DEFAULT_TIMEZONE;
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
 * Clear the timezone cache.
 * Call this after updating the timezone setting to force a refresh.
 *
 * @param {number|string} [campaignId] - Clear only this campaign's cached
 *   timezone; omit to clear every campaign's cache
 */
function clearTimezoneCache(campaignId) {
    if (campaignId !== undefined && campaignId !== null) {
        timezoneCache.delete(String(campaignId));
        logger.info(`Timezone cache cleared for campaign ${campaignId}`);
    } else {
        timezoneCache.clear();
        logger.info('Timezone cache cleared');
    }
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
