// src/models/Session.js
const BaseModel = require('./BaseModel');
const dbUtils = require('../utils/dbUtils');

// Shared SQL fragments
const NOT_CANCELLED = "(status IS NULL OR status != 'cancelled')";
// "The session being dealt for" window: a session that started less than 12
// hours ago still counts, so tonight's session is current at the table too.
const DEAL_WINDOW_START = "start_time > NOW() - INTERVAL '12 hours'";
// A user's currently active character, used when an attendance row has no
// character_id (legacy Discord handler, RSVP before an active character).
// Expects the attendance table to be aliased as sa; exposes the row as ac.
const ACTIVE_CHARACTER_JOIN = `LEFT JOIN LATERAL (
                SELECT id, name FROM characters
                WHERE user_id = sa.user_id AND active = true
                ORDER BY id LIMIT 1
            ) ac ON true`;
// Display name for a session_attendance row (character first, then username).
const DISPLAY_NAME = 'COALESCE(c.name, u.username)';

class Session extends BaseModel {
    constructor() {
        super({
            tableName: 'game_sessions',
            timestamps: { createdAt: false, updatedAt: true }
        });
    }

    /**
     * Get upcoming sessions
     * @param {number} limit - Number of upcoming sessions to retrieve
     * @returns {Promise<Array>} - Array of upcoming sessions
     */
    async getUpcomingSessions(limit = 5) {
        const query = `
            SELECT * FROM game_sessions 
            WHERE start_time > NOW() 
            ORDER BY start_time ASC 
            LIMIT $1
        `;
        const result = await dbUtils.executeQuery(query, [limit]);
        return result.rows;
    }
    
    /**
     * Find sessions that need Discord notifications to be sent
     * Uses each session's auto_announce_hours setting (default 168 hours = 7 days)
     * @returns {Promise<Array>} - Sessions that need notifications
     */
    async findSessionsNeedingNotifications() {
        const query = `
            SELECT * FROM game_sessions
            WHERE status = 'scheduled'
            AND (discord_message_id IS NULL OR discord_message_id = '')
            AND start_time > NOW()
            AND start_time <= NOW() + (COALESCE(auto_announce_hours, 168) || ' hours')::INTERVAL
            ORDER BY start_time ASC
        `;

        const result = await dbUtils.executeQuery(query);
        return result.rows;
    }

    /**
     * Sessions with attendance counts and names (the "enhanced" list).
     * @param {string|null} status - Already-validated status filter, or falsy for none
     * @param {boolean} upcomingOnly - Only sessions starting after now
     * @returns {Promise<Array>} - Session rows with confirmed/declined/maybe aggregates
     */
    async getEnhancedList(status, upcomingOnly) {
        const whereConditions = [];
        const queryParams = [];

        if (status) {
            queryParams.push(status);
            whereConditions.push(`gs.status = $${queryParams.length}`);
        }

        if (upcomingOnly) {
            whereConditions.push('gs.start_time > NOW()');
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        const lateSuffix = "CASE WHEN sa.response_type = 'late' THEN ' (late)' ELSE '' END";

        const result = await dbUtils.executeQuery(`
            SELECT
                gs.*,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.status = 'accepted') as confirmed_count,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.status = 'declined') as declined_count,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.status = 'tentative') as maybe_count,
                string_agg(DISTINCT ${DISPLAY_NAME} || ${lateSuffix}, ', '
                    ORDER BY ${DISPLAY_NAME} || ${lateSuffix}) FILTER (WHERE sa.status = 'accepted') as confirmed_names,
                string_agg(DISTINCT ${DISPLAY_NAME}, ', '
                    ORDER BY ${DISPLAY_NAME}) FILTER (WHERE sa.status = 'declined') as declined_names,
                string_agg(DISTINCT ${DISPLAY_NAME}, ', '
                    ORDER BY ${DISPLAY_NAME}) FILTER (WHERE sa.status = 'tentative') as maybe_names
            FROM game_sessions gs
            LEFT JOIN session_attendance sa ON gs.id = sa.session_id
            LEFT JOIN users u ON sa.user_id = u.id
            LEFT JOIN characters c ON sa.character_id = c.id
            ${whereClause}
            GROUP BY gs.id
            ORDER BY gs.start_time
        `, queryParams);
        return result.rows;
    }

    /**
     * The session being dealt for next (see DEAL_WINDOW_START): the first
     * non-cancelled session that started less than 12 hours ago or is still to
     * come, or null.
     * @returns {Promise<Object|null>}
     */
    async getNextUpcomingSession() {
        const result = await dbUtils.executeQuery(`
            SELECT id, title, start_time, status
            FROM game_sessions
            WHERE ${DEAL_WINDOW_START}
              AND ${NOT_CANCELLED}
            ORDER BY start_time ASC
            LIMIT 1
        `);
        return result.rows.length === 0 ? null : result.rows[0];
    }

    /**
     * Attendance records for a session, falling back to the user's currently
     * active character when the attendance row's character_id is NULL.
     * Some RSVP paths (legacy Discord reaction handler, users without an
     * active character at RSVP time) leave character_id NULL; without
     * this fallback the Tasks page can't pre-check the checkbox.
     * @param {number} sessionId
     * @returns {Promise<Array>}
     */
    async getAttendanceWithActiveCharacter(sessionId) {
        const result = await dbUtils.executeQuery(`
            SELECT
                sa.user_id,
                COALESCE(sa.character_id, ac.id) AS character_id,
                sa.status,
                sa.response_type,
                u.username,
                COALESCE(c.name, ac.name) AS character_name
            FROM session_attendance sa
            JOIN users u ON sa.user_id = u.id
            LEFT JOIN characters c ON sa.character_id = c.id
            ${ACTIVE_CHARACTER_JOIN}
            WHERE sa.session_id = $1
        `, [sessionId]);
        return result.rows;
    }

    /**
     * Id of "the session being dealt for": the first non-cancelled session that
     * started less than 12 hours ago or is still to come, or null.
     * @returns {Promise<number|null>}
     */
    async getCurrentDealSessionId() {
        const result = await dbUtils.executeQuery(`
            SELECT id
            FROM game_sessions
            WHERE ${DEAL_WINDOW_START}
              AND ${NOT_CANCELLED}
            ORDER BY start_time ASC
            LIMIT 1
        `);
        return result.rows.length > 0 ? result.rows[0].id : null;
    }

    /**
     * Most recent past non-cancelled session, excluding the given current one.
     * @param {number|null} currentId
     * @returns {Promise<Object|null>}
     */
    async getMostRecentPastSession(currentId) {
        const result = await dbUtils.executeQuery(`
            SELECT id, title, start_time
            FROM game_sessions
            WHERE start_time <= NOW()
              AND ${NOT_CANCELLED}
              AND ($1::int IS NULL OR id <> $1::int)
            ORDER BY start_time DESC
            LIMIT 1
        `, [currentId]);
        return result.rows.length === 0 ? null : result.rows[0];
    }

    /**
     * Character ids (possibly containing null) of RSVPs that mean "attending"
     * for a session. In-app RSVPs set only status; Discord RSVPs set
     * response_type too.
     * @param {number} sessionId
     * @param {string[]} attendingResponses - response_type values meaning attending
     * @param {string} acceptedStatus - status value meaning accepted
     * @returns {Promise<Array>} - Rows of { character_id }
     */
    async getAttendingCharacterRows(sessionId, attendingResponses, acceptedStatus) {
        const result = await dbUtils.executeQuery(`
            SELECT DISTINCT COALESCE(sa.character_id, ac.id) AS character_id
            FROM session_attendance sa
            ${ACTIVE_CHARACTER_JOIN}
            WHERE sa.session_id = $1
              AND (sa.response_type = ANY($2::text[]) OR sa.status = $3)
        `, [sessionId, attendingResponses, acceptedStatus]);
        return result.rows;
    }
}

module.exports = new Session();