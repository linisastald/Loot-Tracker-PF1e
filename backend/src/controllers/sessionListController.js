// src/controllers/sessionListController.js
// Session list / lookup endpoints used by the Sessions and Tasks pages.
//
// Each handler keeps its own try/catch and sends its own error response: these
// endpoints have long-standing, client-visible failure shapes (some use the
// ApiResponse envelope, some a bare { success, message }) that
// controllerFactory.createHandler's generic "Internal server error" would
// change. createHandler remains as the outer safety net.
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');
const Session = require('../models/Session');
const SessionTaskHistory = require('../models/SessionTaskHistory');
const {
    VALID_SESSION_STATUSES,
    RESPONSE_TYPE_MAP,
    ATTENDANCE_STATUS
} = require('../constants/sessionConstants');

// Discord response types that mean "attending" (yes / late / early / ...)
const ATTENDING_RESPONSES = Object.entries(RESPONSE_TYPE_MAP)
    .filter(([, status]) => status === ATTENDANCE_STATUS.ACCEPTED)
    .map(([responseType]) => responseType);

// Get enhanced session list with attendance counts
const getEnhancedSessions = async (req, res) => {
    try {
        const { status, upcoming_only = 'false' } = req.query;

        // Only apply the status filter if value is valid (defensive programming)
        if (status && !VALID_SESSION_STATUSES.includes(status)) {
            // Invalid status provided
            const response = ApiResponse.validationError(
                `Invalid status value. Must be one of: ${VALID_SESSION_STATUSES.join(', ')}`
            );
            return ApiResponse.send(res, response);
        }

        const sessions = await Session.getEnhancedList(status, upcoming_only === 'true');

        const response = ApiResponse.success(sessions, 'Sessions retrieved successfully');
        return ApiResponse.send(res, response);

    } catch (error) {
        logger.error('Failed to fetch enhanced sessions:', error);
        const response = ApiResponse.error('Failed to fetch sessions');
        return ApiResponse.send(res, response);
    }
};

// Get the session being dealt for (first non-cancelled session that started
// less than 12 hours ago or is still to come - the same window as
// last-session-attendees) with its attendance. Used by the Tasks page to
// pre-populate character checkboxes based on who has RSVP'd
const getNextWithAttendance = async (req, res) => {
    try {
        const session = await Session.getNextUpcomingSession();

        if (!session) {
            return res.json({ success: true, data: null });
        }

        const attendance = await Session.getAttendanceWithActiveCharacter(session.id);

        res.json({
            success: true,
            data: {
                session,
                attendance
            }
        });
    } catch (error) {
        logger.error('Failed to fetch next session with attendance:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch next session' });
    }
};

// Who was at the previous session - used by the Tasks page to pre-mark
// "Was at last session" so tasks flagged requires_previous_attendance (Recap)
// only go to people who can actually do them.
//
// The primary source is the most recent task-assignment record: the Tasks page
// selection at the last session IS the real attendance, whereas RSVPs are only
// intentions. It also returns that record's assignments so the Tasks page can
// apply the sticky / avoid-repeat task options.
//
// "The session being dealt for" is the first non-cancelled session that
// started less than 12 hours ago or is still to come - so it is tonight's
// session whether the DM deals the night before, at the table, or two hours
// in. Each history record is attributed to a session the same way (from its
// created_at), and the previous session is the newest record attributed to a
// different session. This deliberately ignores the record's stored session_id,
// which lags one session behind when the deal happens after start time. With
// no usable history (new campaign), falls back to attending RSVPs on the most
// recent past session.
const getLastSessionAttendees = async (req, res) => {
    try {
        const currentId = await Session.getCurrentDealSessionId();

        const record = await SessionTaskHistory.findPreviousSessionRecord(currentId);

        if (record) {
            const assignments = record.assignments || {};
            const names = new Set();
            for (const phase of ['pre', 'during', 'post']) {
                for (const name of Object.keys(assignments[phase] || {})) {
                    if (name !== 'DM') names.add(name);
                }
            }
            let characterIds = [];
            if (names.size > 0) {
                characterIds = await SessionTaskHistory.findActiveCharacterIdsByNames(Array.from(names));
            }
            return res.json({
                success: true,
                data: {
                    source: 'task_history',
                    session_title: record.session_title,
                    recorded_at: record.created_at,
                    character_ids: characterIds,
                    assignments
                }
            });
        }

        const pastSession = await Session.getMostRecentPastSession(currentId);

        if (!pastSession) {
            return res.json({ success: true, data: null });
        }

        // In-app RSVPs set only status; Discord RSVPs set response_type too.
        const rsvpRows = await Session.getAttendingCharacterRows(
            pastSession.id, ATTENDING_RESPONSES, ATTENDANCE_STATUS.ACCEPTED
        );

        res.json({
            success: true,
            data: {
                source: 'rsvp',
                session_title: pastSession.title,
                recorded_at: pastSession.start_time,
                character_ids: rsvpRows
                    .map(row => row.character_id)
                    .filter(id => id !== null),
                assignments: null
            }
        });
    } catch (error) {
        logger.error('Failed to fetch last session attendees:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch last session attendees' });
    }
};

module.exports = {
    getEnhancedSessions: controllerFactory.createHandler(getEnhancedSessions, {
        errorMessage: 'Error retrieving enhanced sessions'
    }),
    getNextWithAttendance: controllerFactory.createHandler(getNextWithAttendance, {
        errorMessage: 'Error retrieving next session with attendance'
    }),
    getLastSessionAttendees: controllerFactory.createHandler(getLastSessionAttendees, {
        errorMessage: 'Error retrieving last session attendees'
    })
};
