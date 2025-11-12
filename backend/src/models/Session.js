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
            DO UPDATE SET status = $4, character_id = $3, updated_at = NOW()
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
     * (7 days before the session with no Discord message ID)
     * @returns {Promise<Array>} - Sessions that need notifications
     */
    async findSessionsNeedingNotifications() {
        const query = `
            SELECT * FROM game_sessions
            WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days 1 hour'
            AND (discord_message_id IS NULL OR discord_message_id = '')
            ORDER BY start_time ASC
        `;
        
        const result = await dbUtils.executeQuery(query);
        return result.rows;
    }
}

module.exports = new Session();