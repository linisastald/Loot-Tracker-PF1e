// src/models/SessionTaskHistory.js
// Records of manual pre/during/post task assignments made from the Tasks page
// (table session_task_history), plus the lookups built on them.
const dbUtils = require('../utils/dbUtils');
const { SNACK_MASTER_LABEL } = require('../constants/sessionTaskDefaults');

/**
 * Derive the per-label announcements for a saved assignment.
 *
 * Tasks with an announce label (DM Settings -> Task Management) name their
 * assignee in the FOLLOWING session's announcement, e.g.
 * { "Snack Master": "Bob" }. The legacy snack_master_name column is still
 * filled from the "Snack Master" label so older readers keep working.
 * Task names are only unique within a phase, so holders are matched in the
 * definition's own phase.
 *
 * @param {Object} assignments - { pre|during|post: { characterName: [taskName] } }
 * @param {Array} announcedTasks - Task definitions that carry an announce_label
 * @returns {{ announcements: Object, snackMasterName: string|null }}
 */
const deriveAnnouncements = (assignments, announcedTasks) => {
    const announcements = {};
    for (const definition of announcedTasks) {
        const holders = [];
        const phaseAssignments = (assignments && assignments[definition.phase]) || {};
        for (const [name, tasks] of Object.entries(phaseAssignments)) {
            if (Array.isArray(tasks) && tasks.includes(definition.name) && !holders.includes(name)) {
                holders.push(name);
            }
        }
        if (holders.length > 0) {
            const label = definition.announce_label;
            announcements[label] = announcements[label]
                ? `${announcements[label]}, ${holders.join(', ')}`
                : holders.join(', ');
        }
    }
    const snackKey = Object.keys(announcements)
        .find(label => label.toLowerCase() === SNACK_MASTER_LABEL.toLowerCase());
    return {
        announcements,
        snackMasterName: snackKey ? announcements[snackKey] : null
    };
};

/**
 * Insert a task assignment history record.
 * @returns {Promise<Object>} - The inserted row
 */
const create = async ({
    sessionId, sessionTitle, assignments, characterCount, lateCount,
    snackMasterName, announcements, createdBy
}) => {
    const result = await dbUtils.executeQuery(`
        INSERT INTO session_task_history
            (session_id, session_title, assignments, character_count, late_count, snack_master_name, announcements, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [
        sessionId,
        sessionTitle,
        JSON.stringify(assignments),
        characterCount,
        lateCount,
        snackMasterName,
        Object.keys(announcements).length > 0 ? JSON.stringify(announcements) : null,
        createdBy
    ]);
    return result.rows[0];
};

/**
 * Most recent history records, newest first, with the creator's username.
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getRecent = async (limit) => {
    const result = await dbUtils.executeQuery(`
        SELECT
            sth.*,
            u.username as created_by_name
        FROM session_task_history sth
        LEFT JOIN users u ON sth.created_by = u.id
        ORDER BY sth.created_at DESC
        LIMIT $1
    `, [limit]);
    return result.rows;
};

/**
 * The newest history record attributed to a session other than the one
 * currently being dealt for. Each record is attributed to the first
 * non-cancelled session that started less than 12 hours before the record's
 * created_at (or later), deliberately ignoring the stored session_id, which
 * lags one session behind when the deal happens after start time.
 * @param {number|null} currentId - Session being dealt for, or null
 * @returns {Promise<Object|null>}
 */
const findPreviousSessionRecord = async (currentId) => {
    const result = await dbUtils.executeQuery(`
        SELECT session_title, assignments, created_at
        FROM (
            SELECT sth.session_title, sth.assignments, sth.created_at,
                   (SELECT gs.id
                    FROM game_sessions gs
                    WHERE gs.start_time > sth.created_at - INTERVAL '12 hours'
                      AND (gs.status IS NULL OR gs.status != 'cancelled')
                    ORDER BY gs.start_time ASC
                    LIMIT 1) AS dealt_for_session_id
            FROM session_task_history sth
        ) h
        WHERE h.dealt_for_session_id IS DISTINCT FROM $1::int
           OR ($1::int IS NULL AND h.created_at < NOW() - INTERVAL '12 hours')
        ORDER BY h.created_at DESC
        LIMIT 1
    `, [currentId]);
    return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Ids of active characters with any of the given names.
 * @param {string[]} names
 * @returns {Promise<number[]>}
 */
const findActiveCharacterIdsByNames = async (names) => {
    const result = await dbUtils.executeQuery(
        'SELECT id FROM characters WHERE active = true AND name = ANY($1::text[])',
        [names]
    );
    return result.rows.map(row => row.id);
};

module.exports = {
    deriveAnnouncements,
    create,
    getRecent,
    findPreviousSessionRecord,
    findActiveCharacterIdsByNames
};
