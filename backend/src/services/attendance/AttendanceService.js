/**
 * AttendanceService - Handles session attendance tracking
 * Extracted from sessionService.js for better separation of concerns
 */

const pool = require('../../config/db');
const logger = require('../../utils/logger');
const {
    ATTENDANCE_STATUS,
    RESPONSE_TYPE_MAP
} = require('../../constants/sessionConstants');

class AttendanceService {
    /**
     * Record or update attendance for a session
     * @param {number} sessionId - Session ID
     * @param {number} userId - User ID
     * @param {string} responseType - Response type (yes, no, maybe, late, etc.)
     * @param {Object} additionalData - Additional data (late_arrival_time, notes, character_id, etc.)
     * @returns {Promise<Object>} - Attendance record and counts
     */
    async recordAttendance(sessionId, userId, responseType, additionalData = {}) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                late_arrival_time,
                early_departure_time,
                notes,
                discord_id,
                character_id
            } = additionalData;

            // Map response type to status for database constraint
            const status = RESPONSE_TYPE_MAP[responseType] ||
                          RESPONSE_TYPE_MAP[responseType?.toLowerCase()] ||
                          (Object.values(ATTENDANCE_STATUS).includes(responseType) ? responseType : ATTENDANCE_STATUS.TENTATIVE);

            // Upsert attendance record
            const attendanceResult = await client.query(`
                INSERT INTO session_attendance (
                    session_id, user_id, character_id, status, response_type, late_arrival_time,
                    early_departure_time, notes, response_timestamp
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                ON CONFLICT (session_id, user_id)
                DO UPDATE SET
                    character_id = EXCLUDED.character_id,
                    status = EXCLUDED.status,
                    response_type = EXCLUDED.response_type,
                    late_arrival_time = EXCLUDED.late_arrival_time,
                    early_departure_time = EXCLUDED.early_departure_time,
                    notes = EXCLUDED.notes,
                    response_timestamp = NOW(),
                    updated_at = NOW()
                RETURNING *
            `, [sessionId, userId, character_id, status, responseType, late_arrival_time, early_departure_time, notes]);

            const attendance = attendanceResult.rows[0];

            // Get updated attendance counts
            const counts = await this.getAttendanceCounts(client, sessionId);

            // Update session with new counts
            await client.query(`
                UPDATE game_sessions
                SET
                    confirmed_count = $2,
                    declined_count = $3,
                    maybe_count = $4,
                    updated_at = NOW()
                WHERE id = $1
            `, [sessionId, counts.confirmed_count, counts.declined_count, counts.maybe_count]);

            // Enqueue Discord message update in outbox (within transaction)
            const discordOutboxService = require('../discordOutboxService');
            await discordOutboxService.enqueue(client, 'session_update', { sessionId }, sessionId);

            await client.query('COMMIT');

            logger.info('Attendance recorded and Discord update enqueued:', {
                sessionId,
                userId,
                characterId: character_id,
                responseType,
                attendanceId: attendance.id
            });

            return { attendance, counts };
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to record attendance:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get attendance counts for a session
     * @param {Object} client - Database client (optional, for transactions)
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Attendance counts
     */
    async getAttendanceCounts(client, sessionId) {
        const dbClient = client || pool;

        const result = await dbClient.query(`
            SELECT
                COUNT(*) FILTER (WHERE response_type = 'yes') as confirmed_count,
                COUNT(*) FILTER (WHERE response_type = 'no') as declined_count,
                COUNT(*) FILTER (WHERE response_type = 'maybe') as maybe_count,
                COUNT(*) FILTER (WHERE response_type = 'late') as late_count,
                COUNT(*) FILTER (WHERE response_type = 'early') as early_count,
                COUNT(*) FILTER (WHERE response_type = 'late_and_early') as late_and_early_count
            FROM session_attendance
            WHERE session_id = $1
        `, [sessionId]);

        return result.rows[0];
    }

    /**
     * Get session attendance with user details
     * @param {number} sessionId - Session ID
     * @returns {Promise<Array>} - Attendance records with user info
     */
    async getSessionAttendance(sessionId) {
        try {
            const result = await pool.query(`
                SELECT
                    sa.*,
                    u.username,
                    u.discord_id,
                    c.name as character_name
                FROM session_attendance sa
                JOIN users u ON sa.user_id = u.id
                LEFT JOIN characters c ON sa.character_id = c.id
                WHERE sa.session_id = $1
                ORDER BY sa.response_timestamp DESC
            `, [sessionId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get session attendance:', error);
            throw error;
        }
    }

    /**
     * Get confirmed attendance count
     * Counts players who are attending: yes, late, early, late_and_early
     * Does NOT count: no, maybe
     * @param {number} sessionId - Session ID
     * @returns {Promise<number>} - Number of confirmed attendees
     */
    async getConfirmedAttendanceCount(sessionId) {
        const result = await pool.query(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM session_attendance
            WHERE session_id = $1
            AND response_type IN ('yes', 'late', 'early', 'late_and_early')
        `, [sessionId]);

        return parseInt(result.rows[0].count) || 0;
    }

    /**
     * Get users who haven't responded to a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Array>} - Non-responder user records
     */
    async getNonResponders(sessionId) {
        const result = await pool.query(`
            SELECT u.id, u.username, u.discord_id
            FROM users u
            WHERE u.discord_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM session_attendance sa
                WHERE sa.session_id = $1
                AND sa.user_id = u.id
            )
        `, [sessionId]);

        return result.rows;
    }

    /**
     * Get detailed attendance information for a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - Detailed attendance breakdown
     */
    async getSessionAttendanceDetails(sessionId) {
        const result = await pool.query(`
            SELECT
                sa.response_type,
                sa.status,
                sa.late_arrival_time,
                sa.early_departure_time,
                sa.notes,
                sa.response_timestamp,
                u.id as user_id,
                u.username,
                u.discord_id,
                c.id as character_id,
                c.name as character_name
            FROM session_attendance sa
            JOIN users u ON sa.user_id = u.id
            LEFT JOIN characters c ON sa.character_id = c.id
            WHERE sa.session_id = $1
            ORDER BY
                CASE sa.response_type
                    WHEN 'yes' THEN 1
                    WHEN 'maybe' THEN 2
                    WHEN 'late' THEN 3
                    WHEN 'no' THEN 4
                    ELSE 5
                END,
                u.username
        `, [sessionId]);

        // Group by response type
        const grouped = {
            confirmed: [],
            declined: [],
            maybe: [],
            late: [],
            notResponded: []
        };

        result.rows.forEach(row => {
            const attendee = {
                userId: row.user_id,
                username: row.username,
                characterName: row.character_name,
                responseType: row.response_type,
                lateArrivalTime: row.late_arrival_time,
                earlyDepartureTime: row.early_departure_time,
                notes: row.notes,
                responseTimestamp: row.response_timestamp
            };

            switch (row.response_type) {
                case 'yes':
                    grouped.confirmed.push(attendee);
                    break;
                case 'no':
                    grouped.declined.push(attendee);
                    break;
                case 'maybe':
                    grouped.maybe.push(attendee);
                    break;
                case 'late':
                    grouped.late.push(attendee);
                    break;
            }
        });

        return grouped;
    }
}

// Export singleton instance
module.exports = new AttendanceService();
