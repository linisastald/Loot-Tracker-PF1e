/**
 * Discord Integration Constants
 *
 * This module contains constants used throughout the Discord integration layer,
 * including embed colors, component types, and other Discord API constants.
 */

/**
 * Discord Embed Colors
 * Standard hex color codes for different embed types and statuses
 *
 * Discord expects decimal color values, not hex strings
 * Hex to Decimal conversion: 0xRRGGBB
 */
const DISCORD_EMBED_COLORS = {
    // Session Status Colors
    SCHEDULED: 0x0099FF,    // Blue - Session is scheduled/pending
    CONFIRMED: 0x00FF00,    // Green - Session is confirmed
    CANCELLED: 0xFF0000,    // Red - Session is cancelled
    COMPLETED: 0x4CAF50,    // Green - Session is completed

    // Notification Type Colors
    REMINDER: 0xFFA500,     // Orange - Reminder notifications
    ANNOUNCEMENT: 0x673AB7, // Purple - General announcements

    // Task Assignment Colors
    PRE_SESSION_TASK: 0x673AB7,     // Purple
    DURING_SESSION_TASK: 0xFFC107,  // Yellow/Amber
    POST_SESSION_TASK: 0xF44336,    // Red

    // Generic Status Colors
    SUCCESS: 0x00FF00,      // Green
    WARNING: 0xFFA500,      // Orange
    ERROR: 0xFF0000,        // Red
    INFO: 0x0099FF          // Blue
};

/**
 * Discord Component Types
 * Based on Discord API component type constants
 */
const DISCORD_COMPONENT_TYPES = {
    ACTION_ROW: 1,
    BUTTON: 2,
    SELECT_MENU: 3
};

/**
 * Discord Button Styles
 * Based on Discord API button style constants
 */
const DISCORD_BUTTON_STYLES = {
    PRIMARY: 1,     // Blurple
    SECONDARY: 2,   // Grey
    SUCCESS: 3,     // Green
    DANGER: 4,      // Red
    LINK: 5         // Grey with link
};

/**
 * Discord Interaction Response Types
 * Based on Discord API interaction callback types
 */
const DISCORD_INTERACTION_TYPES = {
    PONG: 1,                                    // ACK a Ping
    CHANNEL_MESSAGE_WITH_SOURCE: 4,             // Respond with a message
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,    // ACK an interaction and edit a response later
    DEFERRED_UPDATE_MESSAGE: 6,                 // For components, ACK and edit the original message later
    UPDATE_MESSAGE: 7,                          // For components, edit the message the component was attached to
    APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8, // Respond to an autocomplete interaction
    MODAL: 9                                    // Respond with a popup modal
};

module.exports = {
    DISCORD_EMBED_COLORS,
    DISCORD_COMPONENT_TYPES,
    DISCORD_BUTTON_STYLES,
    DISCORD_INTERACTION_TYPES
};
