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

// Middleware to check express-validator validation results
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
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

        // Whitelist valid status values to prevent SQL injection and invalid queries
        const VALID_STATUSES = ['scheduled', 'confirmed', 'cancelled', 'completed'];
        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status value. Must be one of: ${VALID_STATUSES.join(', ')}`
            });
        }

        let whereClause = '1=1';
        const queryParams = [];

        if (status) {
            whereClause += ' AND gs.status = $' + (queryParams.length + 1);
            queryParams.push(status);
        }

        if (upcoming_only === 'true') {
            whereClause += ' AND gs.start_time > NOW()';
        }

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

        res.json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('Failed to fetch enhanced sessions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
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
    body('recurring_pattern').isIn(['weekly', 'biweekly', 'monthly', 'custom']).withMessage('Invalid recurring pattern'),
    body('recurring_day_of_week').isInt({ min: 0, max: 6 }).withMessage('Invalid day of week'),
    body('recurring_interval').optional().isInt({ min: 1 }).withMessage('Invalid interval'),
    body('recurring_end_date').optional().isISO8601().withMessage('Invalid end date'),
    body('recurring_end_count').optional().isInt({ min: 1 }).withMessage('Invalid end count')
], validateRequest, async (req, res) => {
    try {
        // Convert frontend field names to backend field names
        const sessionData = {
            ...req.body,
            created_by: req.user.id,
            // Convert days to hours for backend compatibility
            auto_announce_hours: req.body.announcement_days_before ? req.body.announcement_days_before * 24 : 168,
            reminder_hours: req.body.confirmation_days_before ? req.body.confirmation_days_before * 24 : 24,
            auto_cancel_hours: req.body.auto_cancel_hours || 48, // Default 48 hours
            maximum_players: req.body.maximum_players || 6 // Default maximum players
        };

        // Remove the frontend field names to avoid confusion
        delete sessionData.announcement_days_before;
        delete sessionData.confirmation_days_before;

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

        await sessionService.sendSessionReminder(sessionId, reminderType);

        res.json({
            success: true,
            message: 'Reminder sent successfully'
        });

    } catch (error) {
        logger.error('Failed to send reminder:', error);
        res.status(500).json({ success: false, message: 'Failed to send reminder' });
    }
});

// ========================================================================
// ENHANCED ATTENDANCE ROUTES
// ========================================================================

// Record detailed attendance with timing and notes
router.post('/:id/attendance/detailed', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer'),
    body('response_type').isIn(['accepted', 'declined', 'tentative']).withMessage('Invalid response type'),
    body('late_arrival_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
    body('early_departure_time').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
    body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be under 500 characters')
], async (req, res) => {
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
// SESSION TASKS ROUTES
// ========================================================================

// Get session tasks
router.get('/:id/tasks', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer')
], async (req, res) => {
    try {
        const sessionId = req.params.id;

        const result = await dbUtils.executeQuery(`
            SELECT
                st.*,
                u.username as assigned_to_name
            FROM session_tasks st
            LEFT JOIN users u ON st.assigned_to = u.id
            WHERE st.session_id = $1
            ORDER BY st.due_time, st.created_at
        `, [sessionId]);

        res.json({ success: true, data: result.rows });

    } catch (error) {
        logger.error('Failed to fetch session tasks:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
    }
});

// Complete session task
router.patch('/:id/tasks/:taskId/complete', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer'),
    param('taskId').isInt().withMessage('Task ID must be an integer')
], async (req, res) => {
    try {
        const { id: sessionId, taskId } = req.params;

        const result = await dbUtils.executeQuery(`
            UPDATE session_tasks
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND session_id = $2
            RETURNING *
        `, [taskId, sessionId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        res.json({
            success: true,
            message: 'Task completed successfully',
            data: result.rows[0]
        });

    } catch (error) {
        logger.error('Failed to complete task:', error);
        res.status(500).json({ success: false, message: 'Failed to complete task' });
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