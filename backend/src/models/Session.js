// src/models/Session.js
const BaseModel = require('./BaseModel');
const dbUtils = require('../utils/dbUtils');

class Session extends BaseModel {
    constructor() {
        super({
            tableName: 'game_sessions',
            timestamps: { createdAt: true, updatedAt: true }
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
     * Get a session by ID with attendance information
     * @param {number} sessionId - The session ID
     * @returns {Promise<Object>} - Session with attendance information
     */
    async getSessionWithAttendance(sessionId) {
        // Get session details
        const sessionQuery = `SELECT * FROM game_sessions WHERE id = $1`;
        const sessionResult = await dbUtils.executeQuery(sessionQuery, [sessionId]);
        
        if (sessionResult.rows.length === 0) {
            return null;
        }
        
        const session = sessionResult.rows[0];
        
        // Get attendance information
        const attendanceQuery = `
            SELECT sa.id, sa.status, sa.user_id, sa.character_id,
                   u.username, c.name as character_name
            FROM session_attendance sa
            JOIN users u ON sa.user_id = u.id
            LEFT JOIN characters c ON sa.character_id = c.id
            WHERE sa.session_id = $1
        `;
        
        const attendanceResult = await dbUtils.executeQuery(attendanceQuery, [sessionId]);
        
        // Group by attendance status
        const attendance = {
            accepted: [],
            declined: [],
            tentative: []
        };
        
        attendanceResult.rows.forEach(row => {
            attendance[row.status].push({
                id: row.id,
                user_id: row.user_id,
                character_id: row.character_id,
                username: row.username,
                character_name: row.character_name
            });
        });
        
        return {
            ...session,
            attendance
        };
    }
    
    /**
     * Create or update session attendance
     * @param {number} sessionId - The session ID
     * @param {number} userId - The user ID
     * @param {number} characterId - The character ID (optional)
     * @param {string} status - The attendance status (accepted, declined, tentative)
     * @returns {Promise<Object>} - Updated session attendance
     */
    async updateAttendance(sessionId, userId, characterId, status) {
        const query = `
            INSERT INTO session_attendance (session_id, user_id, character_id, status, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (session_id, user_id)
            DO UPDATE SET
                status = EXCLUDED.status,
                character_id = EXCLUDED.character_id,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;

        const result = await dbUtils.executeQuery(query, [sessionId, userId, characterId, status]);
        return result.rows[0];
    }
    
    /**
     * Create a new game session with Discord notification details
     * @param {Object} sessionData - The session data
     * @returns {Promise<Object>} - Created session
     */
    async createSession(sessionData) {
        return await dbUtils.executeTransaction(async (client) => {
            const { title, start_time, end_time, description, discord_message_id, discord_channel_id } = sessionData;
            
            const insertQuery = `
                INSERT INTO game_sessions (title, start_time, end_time, description, discord_message_id, discord_channel_id)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            
            const result = await client.query(insertQuery, [
                title, start_time, end_time, description, discord_message_id, discord_channel_id
            ]);
            
            return result.rows[0];
        });
    }
    
    /**
     * Update session Discord message details
     * @param {number} sessionId - The session ID
     * @param {string} messageId - The Discord message ID
     * @param {string} channelId - The Discord channel ID
     * @returns {Promise<Object>} - Updated session
     */
    async updateDiscordMessage(sessionId, messageId, channelId) {
        const query = `
            UPDATE game_sessions
            SET discord_message_id = $2, discord_channel_id = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await dbUtils.executeQuery(query, [sessionId, messageId, channelId]);
        return result.rows[0];
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
        // Build WHERE clause conditions using array pattern for safer SQL construction
        const whereConditions = ['1=1'];
        const queryParams = [];

        if (status) {
            queryParams.push(status);
            whereConditions.push(`gs.status = $${queryParams.length}`);
        }

        if (upcomingOnly) {
            whereConditions.push('gs.start_time > NOW()');
        }

        // Join conditions with AND - safer than string concatenation
        const whereClause = whereConditions.join(' AND ');

        const result = await dbUtils.executeQuery(`
            SELECT
                gs.*,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.status = 'accepted') as confirmed_count,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.status = 'declined') as declined_count,
                COUNT(DISTINCT sa.user_id) FILTER (WHERE sa.status = 'tentative') as maybe_count,
                0 as modified_count,
                string_agg(
                    DISTINCT CASE WHEN sa.status = 'accepted'
                    THEN COALESCE(c.name, u.username) || CASE WHEN sa.response_type = 'late' THEN ' (late)' ELSE '' END
                    END,
                    ', ' ORDER BY CASE WHEN sa.status = 'accepted' THEN COALESCE(c.name, u.username) || CASE WHEN sa.response_type = 'late' THEN ' (late)' ELSE '' END END
                ) as confirmed_names,
                string_agg(
                    DISTINCT CASE WHEN sa.status = 'declined' THEN COALESCE(c.name, u.username) END,
                    ', ' ORDER BY CASE WHEN sa.status = 'declined' THEN COALESCE(c.name, u.username) END
                ) as declined_names,
                string_agg(
                    DISTINCT CASE WHEN sa.status = 'tentative' THEN COALESCE(c.name, u.username) END,
                    ', ' ORDER BY CASE WHEN sa.status = 'tentative' THEN COALESCE(c.name, u.username) END
                ) as maybe_names
            FROM game_sessions gs
            LEFT JOIN session_attendance sa ON gs.id = sa.session_id
            LEFT JOIN users u ON sa.user_id = u.id
            LEFT JOIN characters c ON sa.character_id = c.id
            WHERE ${whereClause}
            GROUP BY gs.id
            ORDER BY gs.start_time
        `, queryParams);
        return result.rows;
    }

    /**
     * The next upcoming non-cancelled session, or null.
     * @returns {Promise<Object|null>}
     */
    async getNextUpcomingSession() {
        const result = await dbUtils.executeQuery(`
            SELECT id, title, start_time, status
            FROM game_sessions
            WHERE start_time > NOW()
              AND (status IS NULL OR status != 'cancelled')
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
            LEFT JOIN LATERAL (
                SELECT id, name FROM characters
                WHERE user_id = sa.user_id AND active = true
                ORDER BY id LIMIT 1
            ) ac ON true
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
            WHERE start_time > NOW() - INTERVAL '12 hours'
              AND (status IS NULL OR status != 'cancelled')
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
              AND (status IS NULL OR status != 'cancelled')
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
            LEFT JOIN LATERAL (
                SELECT id FROM characters
                WHERE user_id = sa.user_id AND active = true
                ORDER BY id LIMIT 1
            ) ac ON true
            WHERE sa.session_id = $1
              AND (sa.response_type = ANY($2::text[]) OR sa.status = $3)
        `, [sessionId, attendingResponses, acceptedStatus]);
        return result.rows;
    }

    /**
     * Rows of the upcoming_sessions view (next 10).
     * @returns {Promise<Array>}
     */
    async getUpcomingDetailed() {
        const result = await dbUtils.executeQuery(`
            SELECT * FROM upcoming_sessions ORDER BY start_time LIMIT 10
        `);
        return result.rows;
    }

    /**
     * Insert a session note.
     * @returns {Promise<Object>} - The inserted row
     */
    async addNote(sessionId, userId, noteType, note) {
        const result = await dbUtils.executeQuery(`
            INSERT INTO session_notes (session_id, user_id, note_type, note)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [sessionId, userId, noteType, note]);
        return result.rows[0];
    }

    /**
     * Notes for a session, newest first, with author and character names.
     * @returns {Promise<Array>}
     */
    async getNotes(sessionId) {
        const result = await dbUtils.executeQuery(`
            SELECT
                sn.*,
                u.username,
                c.name as character_name
            FROM session_notes sn
            JOIN users u ON sn.user_id = u.id
            LEFT JOIN characters c ON sn.character_id = c.id
            WHERE sn.session_id = $1
            ORDER BY sn.created_at DESC
        `, [sessionId]);
        return result.rows;
    }

    /**
     * A user's Discord mapping, or null when the user does not exist.
     * @returns {Promise<Object|null>}
     */
    async getUserDiscordMapping(userId) {
        const result = await dbUtils.executeQuery(`
            SELECT id, username, discord_id, discord_username
            FROM users
            WHERE id = $1
        `, [userId]);
        return result.rows.length === 0 ? null : result.rows[0];
    }

    /**
     * Link a Discord account to a user. Unique violations (pg code 23505)
     * propagate to the caller.
     * @returns {Promise<Object|null>} - Updated mapping, or null when no such user
     */
    async linkUserDiscord(userId, discordId, discordUsername) {
        const result = await dbUtils.executeQuery(`
            UPDATE users
            SET discord_id = $1, discord_username = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, username, discord_id, discord_username
        `, [discordId, discordUsername, userId]);
        return result.rows.length === 0 ? null : result.rows[0];
    }
}

module.exports = new Session();