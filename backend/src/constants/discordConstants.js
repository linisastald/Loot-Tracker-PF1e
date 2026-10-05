/**
 * Discord Integration Constants
 *
 * Embed colors used by the session announcement embeds
 * (services/discord/SessionDiscordService.js).
 */

/**
 * Discord Embed Colors
 *
 * Discord expects decimal color values, not hex strings
 * Hex to Decimal conversion: 0xRRGGBB
 */
const DISCORD_EMBED_COLORS = {
    // Session Status Colors
    SCHEDULED: 0x0099FF,    // Blue - Session is scheduled/pending
    CONFIRMED: 0x00FF00,    // Green - Session is confirmed
    CANCELLED: 0xFF0000,    // Red - Session is cancelled

    // Notification Type Colors
    REMINDER: 0xFFA500      // Orange - Reminder notifications
};

module.exports = {
    DISCORD_EMBED_COLORS
};
