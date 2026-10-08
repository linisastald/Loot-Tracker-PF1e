/**
 * AttendanceService - Handles session attendance tracking
 * Extracted from sessionService.js for better separation of concerns
 */

const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const controllerFactory = require('../../utils/controllerFactory');
const {
    ATTENDANCE_STATUS,
    RESPONSE_TYPE_MAP,
    STATUS_TO_RESPONSE_MAP
} = require('../../constants/sessionConstants');

class AttendanceService {
    /**
     * Record or update attendance for a session
     *
     * The session must be visible in the current campaign context, and a
     * supplied character_id must be an active character of the RSVPing user in
     * that session's campaign (a player cannot RSVP as someone else's character
     * or one from another campaign).
     *
     * @param {number} sessionId - Session ID
     * @param {number} userId - User ID
     * @param {string} responseType - Response type (yes, no, maybe, late, etc.)
     * @param {Object} additionalData - Additional data (late_arrival_time, early_departure_time, notes, character_id)
     * @returns {Promise<Object>} - Attendance record and counts
     * @throws {NotFoundError} If the session does not exist in the current campaign
     * @throws {ValidationError} If character_id is not the user's active character in the session's campaign
     */
    async recordAttendance(sessionId, userId, responseType, additionalData = {}) {
        const {
            late_arrival_time,
            early_departure_time,
            notes
        } = additionalData;
        const character_id = additionalData.character_id || null;

        // Normalize legacy status values (accepted/declined/tentative) back to
        // canonical response types (yes/no/maybe). Without this, older callers
        // store response_type='accepted' which the Tasks page filter (which keys
        // off yes/late/early/late_and_early) does not recognize.
        const lowered = typeof responseType === 'string' ? responseType.toLowerCase() : responseType;
        const normalizedResponseType = STATUS_TO_RESPONSE_MAP[lowered] || lowered;

        // Map response type to status for database constraint
        const status = RESPONSE_TYPE_MAP[normalizedResponseType] || ATTENDANCE_STATUS.TENTATIVE;

        const { attendance, counts } = await dbUtils.executeTransaction(async (client) => {
            // The session must exist in the caller's campaign context. The
            // foreign key check on session_attendance bypasses RLS, so this
            // lookup is what stops a row being attached to another campaign's
            // session id.
            const sessionResult = await client.query(
                'SELECT id, campaign_id FROM game_sessions WHERE id = $1',
                [sessionId]
            );
            if (sessionResult.rows.length === 0) {
                throw controllerFactory.createNotFoundError('Session not found');
            }

            if (character_id) {
                const characterResult = await client.query(`
                    SELECT id FROM characters
                    WHERE id = $1 AND user_id = $2 AND campaign_id = $3 AND active = true
                `, [character_id, userId, sessionResult.rows[0].campaign_id]);
                if (characterResult.rows.length === 0) {
                    throw controllerFactory.createValidationError(
                        'Character must be one of your active characters in this campaign'
                    );
                }
            }

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
            `, [sessionId, userId, character_id, status, normalizedResponseType, late_arrival_time, early_departure_time, notes]);

            const attendanceRecord = attendanceResult.rows[0];

            // Get updated attendance counts
            const attendanceCounts = await this.getAttendanceCounts(client, sessionId);

            // Update session with new counts
            await client.query(`
                UPDATE game_sessions
                SET
                    confirmed_count = $2,
                    declined_count = $3,
                    maybe_count = $4,
                    updated_at = NOW()
                WHERE id = $1
            `, [sessionId, attendanceCounts.confirmed_count, attendanceCounts.declined_count, attendanceCounts.maybe_count]);

            // Enqueue Discord message update in outbox (within transaction)
            const discordOutboxService = require('../discordOutboxService');
            await discordOutboxService.enqueue(client, 'session_update', { sessionId }, sessionId);

            return { attendance: attendanceRecord, counts: attendanceCounts };
        });

        logger.info('Attendance recorded and Discord update enqueued:', {
            sessionId,
            userId,
            characterId: character_id,
            responseType,
            attendanceId: attendance.id
        });

        return { attendance, counts };
    }

    /**
     * Get attendance counts for a session inside a transaction.
     *
     * Canonical definition, keyed off status (set by every RSVP path, in-app and
     * Discord): confirmed = accepted (yes, late, early, late_and_early),
     * declined, maybe = tentative.
     * @param {Object} client - Transaction client
     * @param {number} sessionId - Session ID
     * @returns {Promise<Object>} - confirmed_count, declined_count, maybe_count
     */
    async getAttendanceCounts(client, sessionId) {
        const result = await client.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'accepted') as confirmed_count,
                COUNT(*) FILTER (WHERE status = 'declined') as declined_count,
                COUNT(*) FILTER (WHERE status = 'tentative') as maybe_count
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
        const result = await dbUtils.executeQuery(`
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
    }

    /**
     * Get one user's current response to a session, or null if they have not
     * responded. Used by the Discord buttons so that "Running Late" on top of
     * "Leaving Early" (or the reverse) becomes late_and_early instead of
     * replacing the earlier answer.
     * @param {number} sessionId - Session ID
     * @param {number} userId - User ID
     * @returns {Promise<string|null>} - response_type or null
     */
    async getUserResponseType(sessionId, userId) {
        const result = await dbUtils.executeQuery(
            'SELECT response_type FROM session_attendance WHERE session_id = $1 AND user_id = $2',
            [sessionId, userId]
        );
        return result.rows.length > 0 ? result.rows[0].response_type : null;
    }

    /**
     * Get confirmed attendance count
     * Counts players who are attending (status accepted: yes, late, early,
     * late_and_early, plus in-app RSVPs). Does NOT count: no, maybe
     * @param {number} sessionId - Session ID
     * @returns {Promise<number>} - Number of confirmed attendees
     */
    async getConfirmedAttendanceCount(sessionId) {
        const result = await dbUtils.executeQuery(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM session_attendance
            WHERE session_id = $1
            AND status = 'accepted'
        `, [sessionId]);

        return parseInt(result.rows[0].count) || 0;
    }

    /**
     * Get a user's active character within a specific campaign.
     *
     * This is the membership gate for Discord attendance: a user may only
     * respond to a session if they own an active character in that session's
     * campaign. The campaign_id filter is explicit on purpose, so the gate holds
     * for whatever campaign context the caller happens to run under.
     *
     * @param {number} userId - User ID
     * @param {number|string} campaignId - Campaign ID of the session
     * @returns {Promise<number|null>} - Active character id in that campaign, or null
     */
    async getActiveCharacterInCampaign(userId, campaignId) {
        const result = await dbUtils.executeQuery(`
            SELECT id FROM characters
            WHERE user_id = $1 AND campaign_id = $2 AND active = true
            ORDER BY id ASC
            LIMIT 1
        `, [userId, campaignId]);

        return result.rows.length > 0 ? result.rows[0].id : null;
    }

    /**
     * Get users who haven't responded to a session
     * @param {number} sessionId - Session ID
     * @returns {Promise<Array>} - Non-responder user records
     */
    async getNonResponders(sessionId) {
        // Scope non-responders to members of the session's own campaign.
        // Without the user_campaign join, this returned every user with a
        // discord_id across ALL campaigns, causing cross-campaign reminder pings.
        const result = await dbUtils.executeQuery(`
            SELECT u.id, u.username, u.discord_id
            FROM users u
            JOIN game_sessions gs ON gs.id = $1
            JOIN user_campaign uc ON uc.user_id = u.id AND uc.campaign_id = gs.campaign_id
            WHERE u.discord_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM session_attendance sa
                WHERE sa.session_id = $1
                AND sa.user_id = u.id
            )
        `, [sessionId]);

        return result.rows;
    }
}

// Export singleton instance
module.exports = new AttendanceService();
