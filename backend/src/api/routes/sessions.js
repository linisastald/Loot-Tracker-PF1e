const express = require('express');
const router = express.Router();
const sessionController = require('../../controllers/sessionController');
const sessionService = require('../../services/sessionService');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const { createValidationMiddleware, validate } = require('../../middleware/validation');
const { body, param, query, validationResult } = require('express-validator');
const dbUtils = require('../../utils/dbUtils');
const logger = require('../../utils/logger');
const ApiResponse = require('../../utils/apiResponse');
const {
    VALID_SESSION_STATUSES,
    VALID_RECURRING_PATTERNS,
    RESPONSE_TYPE_MAP,
    ATTENDANCE_STATUS
} = require('../../constants/sessionConstants');
const SessionTask = require('../../models/SessionTask');
const { LEGACY_SNACK_MASTER_TASK } = require('../../constants/sessionTaskDefaults');

// Middleware to check express-validator validation results
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const response = ApiResponse.validationError(errors.array());
        return ApiResponse.send(res, response);
    }
    next();
};

// ========================================================================
// EXISTING ROUTES (maintained for backward compatibility)
// ========================================================================

// Get all upcoming sessions
router.get('/', verifyToken, sessionController.getUpcomingSessions);

// Get enhanced session list with attendance counts (must come before /:id)
router.get('/enhanced', verifyToken, async (req, res) => {
    try {
        const { status, upcoming_only = 'false' } = req.query;

        // Build WHERE clause conditions using array pattern for safer SQL construction
        const whereConditions = ['1=1'];
        const queryParams = [];

        // Only add status condition if value is valid (defensive programming)
        if (status && VALID_SESSION_STATUSES.includes(status)) {
            queryParams.push(status);
            whereConditions.push(`gs.status = $${queryParams.length}`);
        } else if (status) {
            // Invalid status provided
            const response = ApiResponse.validationError(
                `Invalid status value. Must be one of: ${VALID_SESSION_STATUSES.join(', ')}`
            );
            return ApiResponse.send(res, response);
        }

        if (upcoming_only === 'true') {
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

        const response = ApiResponse.success(result.rows, 'Sessions retrieved successfully');
        return ApiResponse.send(res, response);

    } catch (error) {
        logger.error('Failed to fetch enhanced sessions:', error);
        const response = ApiResponse.error('Failed to fetch sessions');
        return ApiResponse.send(res, response);
    }
});

// Get the next upcoming session with its attendance - used by the Tasks page
// to pre-populate character checkboxes based on who has RSVP'd
router.get('/next-with-attendance', verifyToken, async (req, res) => {
    try {
        // Find the next upcoming non-cancelled session
        const sessionResult = await dbUtils.executeQuery(`
            SELECT id, title, start_time, status
            FROM game_sessions
            WHERE start_time > NOW()
              AND (status IS NULL OR status != 'cancelled')
            ORDER BY start_time ASC
            LIMIT 1
        `);

        if (sessionResult.rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        const session = sessionResult.rows[0];

        // Fetch attendance records, falling back to the user's currently
        // active character when the attendance row's character_id is NULL.
        // Some RSVP paths (legacy Discord reaction handler, users without an
        // active character at RSVP time) leave character_id NULL; without
        // this fallback the Tasks page can't pre-check the checkbox.
        const attendanceResult = await dbUtils.executeQuery(`
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
        `, [session.id]);

        res.json({
            success: true,
            data: {
                session,
                attendance: attendanceResult.rows
            }
        });
    } catch (error) {
        logger.error('Failed to fetch next session with attendance:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch next session' });
    }
});

// Who was at the previous session - used by the Tasks page to pre-mark
// "Was at last session" so tasks flagged requires_previous_attendance (Recap)
// only go to people who can actually do them.
//
// The primary source is the most recent task-assignment record: the Tasks page
// selection at the last session IS the real attendance, whereas RSVPs are only
// intentions. A record only counts once its session started more than 12 hours
// ago (or, for records with no session, once the record itself is that old),
// so a deal made for the current session - whether the night before or as a
// re-deal mid-session - still points at the previous one. With no usable
// history (new campaign), falls back to attending RSVPs on the most recent
// past session.

// Discord response types that mean "attending" (yes / late / early / ...)
const ATTENDING_RESPONSES = Object.entries(RESPONSE_TYPE_MAP)
    .filter(([, status]) => status === ATTENDANCE_STATUS.ACCEPTED)
    .map(([responseType]) => responseType);

router.get('/last-session-attendees', verifyToken, async (req, res) => {
    try {
        const upcomingResult = await dbUtils.executeQuery(`
            SELECT id
            FROM game_sessions
            WHERE start_time > NOW()
              AND (status IS NULL OR status != 'cancelled')
            ORDER BY start_time ASC
            LIMIT 1
        `);
        const upcomingId = upcomingResult.rows.length > 0 ? upcomingResult.rows[0].id : null;

        const historyResult = await dbUtils.executeQuery(`
            SELECT sth.session_title, sth.assignments, sth.created_at
            FROM session_task_history sth
            LEFT JOIN game_sessions gs ON gs.id = sth.session_id
            WHERE ($1::int IS NULL OR sth.session_id IS DISTINCT FROM $1::int)
              AND (
                    (sth.session_id IS NOT NULL AND gs.start_time < NOW() - INTERVAL '12 hours')
                 OR (sth.session_id IS NULL AND sth.created_at < NOW() - INTERVAL '12 hours')
              )
            ORDER BY sth.created_at DESC
            LIMIT 1
        `, [upcomingId]);

        if (historyResult.rows.length > 0) {
            const record = historyResult.rows[0];
            const assignments = record.assignments || {};
            const names = new Set();
            for (const phase of ['pre', 'during', 'post']) {
                for (const name of Object.keys(assignments[phase] || {})) {
                    if (name !== 'DM') names.add(name);
                }
            }
            let characterIds = [];
            if (names.size > 0) {
                const charResult = await dbUtils.executeQuery(
                    'SELECT id FROM characters WHERE active = true AND name = ANY($1::text[])',
                    [Array.from(names)]
                );
                characterIds = charResult.rows.map(row => row.id);
            }
            return res.json({
                success: true,
                data: {
                    source: 'task_history',
                    session_title: record.session_title,
                    recorded_at: record.created_at,
                    character_ids: characterIds
                }
            });
        }

        const pastSessionResult = await dbUtils.executeQuery(`
            SELECT id, title, start_time
            FROM game_sessions
            WHERE start_time <= NOW()
              AND (status IS NULL OR status != 'cancelled')
              AND ($1::int IS NULL OR id <> $1::int)
            ORDER BY start_time DESC
            LIMIT 1
        `, [upcomingId]);

        if (pastSessionResult.rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        // In-app RSVPs set only status; Discord RSVPs set response_type too.
        const pastSession = pastSessionResult.rows[0];
        const rsvpResult = await dbUtils.executeQuery(`
            SELECT DISTINCT COALESCE(sa.character_id, ac.id) AS character_id
            FROM session_attendance sa
            LEFT JOIN LATERAL (
                SELECT id FROM characters
                WHERE user_id = sa.user_id AND active = true
                ORDER BY id LIMIT 1
            ) ac ON true
            WHERE sa.session_id = $1
              AND (sa.response_type = ANY($2::text[]) OR sa.status = $3)
        `, [pastSession.id, ATTENDING_RESPONSES, ATTENDANCE_STATUS.ACCEPTED]);

        res.json({
            success: true,
            data: {
                source: 'rsvp',
                session_title: pastSession.title,
                recorded_at: pastSession.start_time,
                character_ids: rsvpResult.rows
                    .map(row => row.character_id)
                    .filter(id => id !== null)
            }
        });
    } catch (error) {
        logger.error('Failed to fetch last session attendees:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch last session attendees' });
    }
});

// Get upcoming sessions view with attendance summary
router.get('/upcoming-detailed', verifyToken, async (req, res) => {
    try {
        const result = await dbUtils.executeQuery(`
            SELECT * FROM upcoming_sessions ORDER BY start_time LIMIT 10
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        logger.error('Failed to fetch upcoming sessions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch upcoming sessions' });
    }
});

// Get user's Discord mapping
router.get('/discord-mapping', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await dbUtils.executeQuery(`
            SELECT id, username, discord_id, discord_username
            FROM users
            WHERE id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        logger.error('Failed to fetch Discord mapping:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch Discord mapping' });
    }
});

// ========================================================================
// TASK ASSIGNMENT HISTORY ROUTES
// Records manual pre/during/post task assignments made from the Tasks page.
// Registered before '/:id' so the literal path is not captured as a session id.
// ========================================================================

// Save a task assignment to history
router.post('/task-history', verifyToken, [
    body('assignments').exists().withMessage('assignments are required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: errors.array()[0].msg });
        }

        const {
            session_id = null,
            session_title = null,
            assignments,
            character_count = 0,
            late_count = 0
        } = req.body;

        // Whoever draws the task flagged is_snack_master (DM Settings -> Task
        // Management) is snack master for the FOLLOWING session. Derive it
        // server-side from the saved assignments so the next session's
        // announcement can show it. Falls back to the legacy fixed label when
        // no definition carries the flag.
        let snackMasterLabels = [];
        try {
            const definitions = await SessionTask.getAll(req.campaignId);
            snackMasterLabels = definitions
                .filter(task => task.is_snack_master)
                .map(task => task.name);
        } catch (lookupError) {
            logger.warn('Failed to load session task definitions for snack master lookup', { error: lookupError.message });
        }
        if (snackMasterLabels.length === 0) {
            snackMasterLabels = [LEGACY_SNACK_MASTER_TASK];
        }
        let snack_master_name = null;
        const postAssignments = (assignments && assignments.post) || {};
        for (const [name, tasks] of Object.entries(postAssignments)) {
            if (Array.isArray(tasks) && tasks.some(task => snackMasterLabels.includes(task))) {
                snack_master_name = name;
                break;
            }
        }

        const result = await dbUtils.executeQuery(`
            INSERT INTO session_task_history
                (session_id, session_title, assignments, character_count, late_count, snack_master_name, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            session_id,
            session_title,
            JSON.stringify(assignments),
            character_count,
            late_count,
            snack_master_name,
            req.user.id
        ]);

        res.status(201).json({
            success: true,
            message: 'Task assignment saved',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('Failed to save task assignment history:', error);
        res.status(500).json({ success: false, message: 'Failed to save task assignment' });
    }
});

// Get task assignment history (most recent first)
router.get('/task-history', verifyToken, [
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: errors.array()[0].msg });
        }

        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

        const result = await dbUtils.executeQuery(`
            SELECT
                sth.*,
                u.username as created_by_name
            FROM session_task_history sth
            LEFT JOIN users u ON sth.created_by = u.id
            ORDER BY sth.created_at DESC
            LIMIT $1
        `, [limit]);

        res.json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('Failed to fetch task assignment history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch task assignment history' });
    }
});

// Get a specific session with validation
router.get('/:id', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  }
}), verifyToken, sessionController.getSession);

// Create a new session (DM only) with validation
router.post('/', verifyToken, checkRole('DM'), createValidationMiddleware('createSession'), sessionController.createSession);

// Update a session (DM only) with validation
router.put('/:id', validate({
  params: {
    id: { type: 'number', required: true, min: 1 }
  },
  body: {
    title: { type: 'string', required: false, minLength: 1, maxLength: 255 },
    start_time: { type: 'string', required: false, format: 'datetime' },
    end_time: { type: 'string', required: false, format: 'datetime' },
    description: { type: 'string', required: false, maxLength: 1000 },
    status: { type: 'string', required: false },
    cancel_reason: { type: 'string', required: false, maxLength: 500 }
  }
}), verifyToken, checkRole('DM'), sessionController.updateSession);

// Delete a session (DM only)
router.delete('/:id', verifyToken, checkRole('DM'), sessionController.deleteSession);

// Update attendance for a session
router.post('/:id/attendance', verifyToken, sessionController.updateAttendance);

// Trigger manual check for sessions that need notifications (DM only)
router.post('/check-notifications', verifyToken, checkRole('DM'), sessionController.checkAndSendSessionNotifications);

// ========================================================================
// ENHANCED SESSION MANAGEMENT ROUTES
// ========================================================================

// ========================================================================
// RECURRING SESSION ROUTES
// ========================================================================

// Create recurring session (DM only)
router.post('/recurring', verifyToken, checkRole('DM'), [
    body('title').notEmpty().withMessage('Title is required'),
    body('start_time').isISO8601().withMessage('Invalid start time'),
    body('end_time').isISO8601().withMessage('Invalid end time'),
    body('recurring_pattern').isIn(VALID_RECURRING_PATTERNS).withMessage('Invalid recurring pattern'),
    body('recurring_day_of_week').isInt({ min: 0, max: 6 }).withMessage('Invalid day of week'),
    body('recurring_interval').optional().isInt({ min: 1 }).withMessage('Invalid interval'),
    body('recurring_end_date').optional().isISO8601().withMessage('Invalid end date'),
    body('recurring_end_count').optional().isInt({ min: 1 }).withMessage('Invalid end count')
], validateRequest, async (req, res) => {
    try {
        // Use hours-based timing (no conversion needed)
        const sessionData = {
            ...req.body,
            created_by: req.user.id,
            // Use hours directly from frontend (or defaults)
            auto_announce_hours: req.body.auto_announce_hours || 168, // Default: 1 week
            reminder_hours: req.body.reminder_hours || 48, // Default: 2 days
            confirmation_hours: req.body.confirmation_hours || 48, // Default: 2 days
            maximum_players: req.body.maximum_players || 6 // Default maximum players
        };

        const result = await sessionService.createRecurringSession(sessionData);

        res.status(201).json({
            success: true,
            message: 'Recurring session created successfully',
            data: result
        });

    } catch (error) {
        logger.error('Failed to create recurring session:', {
            error: error.message,
            stack: error.stack,
            data: req.body
        });
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create recurring session',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get recurring session instances
router.get('/recurring/:templateId/instances', verifyToken, [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    query('upcoming_only').optional().isBoolean().withMessage('Invalid upcoming_only flag'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit')
], async (req, res) => {
    try {
        const { templateId } = req.params;
        const filters = {
            upcoming_only: req.query.upcoming_only === 'true',
            limit: parseInt(req.query.limit) || 10
        };

        const instances = await sessionService.getRecurringSessionInstances(templateId, filters);

        res.json({
            success: true,
            data: instances
        });

    } catch (error) {
        logger.error('Failed to get recurring session instances:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get session instances'
        });
    }
});

// Update recurring session template (DM only)
router.put('/recurring/:templateId', verifyToken, checkRole('DM'), [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Description too long'),
    body('update_instances').optional().isBoolean().withMessage('Invalid update_instances flag')
], async (req, res) => {
    try {
        const { templateId } = req.params;
        const updateData = req.body;

        const template = await sessionService.updateRecurringSession(templateId, updateData);

        res.json({
            success: true,
            message: 'Recurring session updated successfully',
            data: template
        });

    } catch (error) {
        logger.error('Failed to update recurring session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update recurring session'
        });
    }
});

// Delete recurring session template (DM only)
router.delete('/recurring/:templateId', verifyToken, checkRole('DM'), [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    query('delete_instances').optional().isBoolean().withMessage('Invalid delete_instances flag')
], async (req, res) => {
    try {
        const { templateId } = req.params;
        const deleteFutureInstances = req.query.delete_instances !== 'false';

        const template = await sessionService.deleteRecurringSession(templateId, deleteFutureInstances);

        res.json({
            success: true,
            message: 'Recurring session deleted successfully',
            data: template
        });

    } catch (error) {
        logger.error('Failed to delete recurring session:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete recurring session'
        });
    }
});

// Generate additional instances for recurring session (DM only)
router.post('/recurring/:templateId/generate', verifyToken, checkRole('DM'), [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    body('count').optional().isInt({ min: 1, max: 52 }).withMessage('Invalid count (1-52)')
], async (req, res) => {
    try {
        const { templateId } = req.params;
        const count = req.body.count || 12;

        const instances = await sessionService.generateAdditionalInstances(templateId, count);

        res.json({
            success: true,
            message: `Generated ${instances.length} additional session instances`,
            data: instances
        });

    } catch (error) {
        logger.error('Failed to generate additional instances:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate additional instances'
        });
    }
});

// ========================================================================
// DISCORD INTEGRATION ROUTES
// ========================================================================

// Post session announcement manually
router.post('/:id/announce', verifyToken, checkRole('DM'), [
    param('id').isInt().withMessage('Session ID must be an integer')
], async (req, res) => {
    try {
        const sessionId = req.params.id;
        const message = await sessionService.postSessionAnnouncement(sessionId);

        if (!message) {
            return res.status(400).json({ success: false, message: 'Discord not configured' });
        }

        res.json({
            success: true,
            message: 'Session announcement posted',
            data: { discordMessageId: message.id }
        });

    } catch (error) {
        logger.error('Failed to post announcement:', error);
        res.status(500).json({ success: false, message: 'Failed to post announcement' });
    }
});

// Send session reminder manually
router.post('/:id/remind', verifyToken, checkRole('DM'), [
    param('id').isInt().withMessage('Session ID must be an integer'),
    body('reminder_type').optional().isIn(['non_responders', 'maybe_responders', 'all']).withMessage('Invalid reminder type')
], async (req, res) => {
    try {
        const sessionId = req.params.id;
        const reminderType = req.body.reminder_type || 'all';

        // Manual reminders sent via API should be marked as manual for cooldown tracking
        await sessionService.sendSessionReminder(sessionId, reminderType, { isManual: true });

        res.json({
            success: true,
            message: 'Reminder sent successfully'
        });

    } catch (error) {
        logger.error('Failed to send reminder:', error);
        res.status(500).json({ success: false, message: 'Failed to send reminder' });
    }
});

// Uncancel a session (DM only)
router.post('/:id/uncancel', verifyToken, checkRole('DM'), [
    param('id').isInt().withMessage('Session ID must be an integer')
], async (req, res) => {
    try {
        const sessionId = req.params.id;
        const session = await sessionService.uncancelSession(sessionId);

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        res.json({
            success: true,
            message: 'Session has been reinstated',
            data: session
        });

    } catch (error) {
        logger.error('Failed to uncancel session:', error);
        res.status(400).json({ success: false, message: error.message || 'Failed to uncancel session' });
    }
});

// ========================================================================
// ENHANCED ATTENDANCE ROUTES
// ========================================================================

// Record detailed attendance with timing and notes
router.post('/:id/attendance/detailed', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer'),
    body('response_type').isIn([
        // Canonical response types
        'yes', 'no', 'maybe', 'late', 'early', 'late_and_early',
        // Legacy status aliases (normalized server-side)
        'accepted', 'declined', 'tentative'
    ]).withMessage('Invalid response type'),
    body('late_arrival_time').optional({ nullable: true, checkFalsy: true }).matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
    body('early_departure_time').optional({ nullable: true, checkFalsy: true }).matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
    body('notes').optional({ nullable: true }).isLength({ max: 500 }).withMessage('Notes must be under 500 characters')
], validateRequest, async (req, res) => {
    try {
        const sessionId = req.params.id;
        const userId = req.user.id;

        const attendance = await sessionService.recordAttendance(sessionId, userId, req.body.response_type, req.body);

        res.json({
            success: true,
            message: 'Attendance recorded successfully',
            data: attendance
        });

    } catch (error) {
        logger.error('Failed to record detailed attendance:', error);
        res.status(500).json({ success: false, message: 'Failed to record attendance' });
    }
});

// Get detailed session attendance
router.get('/:id/attendance/detailed', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer')
], async (req, res) => {
    try {
        const sessionId = req.params.id;
        const attendance = await sessionService.getSessionAttendance(sessionId);

        res.json({ success: true, data: attendance });

    } catch (error) {
        logger.error('Failed to fetch detailed attendance:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
    }
});

// ========================================================================
// SESSION NOTES ROUTES
// ========================================================================

// Add session note (prep request, general note, etc.)
router.post('/:id/notes', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer'),
    body('note').notEmpty().withMessage('Note content is required'),
    body('note_type').optional().isIn(['prep_request', 'general', 'dm_note']).withMessage('Invalid note type')
], async (req, res) => {
    try {
        const { id: sessionId } = req.params;
        const { note, note_type = 'general' } = req.body;
        const userId = req.user.id;

        const result = await dbUtils.executeQuery(`
            INSERT INTO session_notes (session_id, user_id, note_type, note)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [sessionId, userId, note_type, note]);

        res.status(201).json({
            success: true,
            message: 'Note added successfully',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('Failed to add session note:', error);
        res.status(500).json({ success: false, message: 'Failed to add note' });
    }
});

// Get session notes
router.get('/:id/notes', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer')
], async (req, res) => {
    try {
        const sessionId = req.params.id;

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

        res.json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('Failed to fetch session notes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notes' });
    }
});

// ========================================================================
// DISCORD USER MAPPING ROUTES
// ========================================================================

// Link Discord account to user
router.post('/link-discord', verifyToken, [
    body('discord_id').notEmpty().withMessage('Discord ID is required'),
    body('discord_username').optional().isLength({ max: 100 }).withMessage('Discord username too long')
], async (req, res) => {
    try {
        const { discord_id, discord_username } = req.body;
        const userId = req.user.id;

        const result = await dbUtils.executeQuery(`
            UPDATE users
            SET discord_id = $1, discord_username = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, username, discord_id, discord_username
        `, [discord_id, discord_username, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            message: 'Discord account linked successfully',
            data: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { // unique violation
            return res.status(400).json({
                success: false,
                message: 'This Discord account is already linked to another user'
            });
        }
        logger.error('Failed to link Discord account:', error);
        res.status(500).json({ success: false, message: 'Failed to link Discord account' });
    }
});

module.exports = router;