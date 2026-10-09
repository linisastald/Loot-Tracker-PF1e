const express = require('express');
const router = express.Router();
const sessionController = require('../../controllers/sessionController');
const sessionListController = require('../../controllers/sessionListController');
const sessionTaskHistoryController = require('../../controllers/sessionTaskHistoryController');
const recurringSessionController = require('../../controllers/recurringSessionController');
const sessionDiscordController = require('../../controllers/sessionDiscordController');
const sessionAttendanceNotesController = require('../../controllers/sessionAttendanceNotesController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');
const { createValidationMiddleware, validate } = require('../../middleware/validation');
const { body, param, query, validationResult } = require('express-validator');
const ApiResponse = require('../../utils/apiResponse');
const { VALID_RECURRING_PATTERNS } = require('../../constants/sessionConstants');

// Middleware to check express-validator validation results. Every validator
// chain below must be followed by this, otherwise its rules are never enforced.
// The response message is the first failure's text (a plain string).
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const response = ApiResponse.validationError(errors.array().map(error => error.msg));
        return ApiResponse.send(res, response);
    }
    next();
};

const sessionIdParam = param('id').isInt({ min: 1 }).withMessage('Session ID must be an integer');

// Task assignments: { pre|during|post: { characterName: [taskName, ...] } }
const isTaskAssignments = (value) => {
    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!isPlainObject(value)) return false;
    return Object.values(value).every(phase =>
        isPlainObject(phase) &&
        Object.values(phase).every(tasks =>
            Array.isArray(tasks) && tasks.every(task => typeof task === 'string')
        )
    );
};

// Route order matters: literal paths must be registered before '/:id' so they
// are not captured as a session id.

// ========================================================================
// EXISTING ROUTES (maintained for backward compatibility)
// ========================================================================

// Get all upcoming sessions
router.get('/', verifyToken, sessionController.getUpcomingSessions);

// Get enhanced session list with attendance counts (must come before /:id)
router.get('/enhanced', verifyToken, sessionListController.getEnhancedSessions);

// Get the next upcoming session with its attendance - used by the Tasks page
router.get('/next-with-attendance', verifyToken, sessionListController.getNextWithAttendance);

// Who was at the previous session - used by the Tasks page
router.get('/last-session-attendees', verifyToken, sessionListController.getLastSessionAttendees);

// ========================================================================
// TASK ASSIGNMENT HISTORY ROUTES
// Records manual pre/during/post task assignments made from the Tasks page.
// ========================================================================

// Save a task assignment to history
router.post('/task-history', verifyToken, [
    body('assignments').exists().withMessage('assignments are required').bail()
        .custom(isTaskAssignments).withMessage('assignments must map phase -> character -> list of task names'),
    body('session_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('session_id must be an integer'),
    body('session_title').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('session_title must be at most 255 characters'),
    body('character_count').optional().isInt({ min: 0, max: 1000 }).withMessage('character_count must be 0-1000'),
    body('late_count').optional().isInt({ min: 0, max: 1000 }).withMessage('late_count must be 0-1000')
], validateRequest, sessionTaskHistoryController.saveTaskHistory);

// Get task assignment history (most recent first)
router.get('/task-history', verifyToken, [
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200')
], validateRequest, sessionTaskHistoryController.getTaskHistory);

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
// RECURRING SESSION ROUTES
// ========================================================================

// Create recurring session (DM only)
router.post('/recurring', verifyToken, checkRole('DM'), [
    body('title').notEmpty().withMessage('Title is required'),
    body('start_time').isISO8601().withMessage('Invalid start time'),
    body('end_time').isISO8601().withMessage('Invalid end time'),
    body('recurring_pattern').isIn(VALID_RECURRING_PATTERNS).withMessage('Invalid recurring pattern'),
    body('recurring_day_of_week').isInt({ min: 0, max: 6 }).withMessage('Invalid day of week'),
    body('recurring_interval').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid interval'),
    body('recurring_end_date').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid end date'),
    body('recurring_end_count').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 104 }).withMessage('Invalid end count (1-104)'),
    body('minimum_players').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage('Invalid minimum players'),
    body('maximum_players').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid maximum players'),
    body('auto_announce_hours').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage('Invalid auto announce hours'),
    body('reminder_hours').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage('Invalid reminder hours'),
    body('confirmation_hours').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage('Invalid confirmation hours')
], validateRequest, recurringSessionController.createRecurringSession);

// ========================================================================
// DISCORD INTEGRATION ROUTES
// ========================================================================

// Post session announcement manually
router.post('/:id/announce', verifyToken, checkRole('DM'), [
    sessionIdParam
], validateRequest, sessionDiscordController.announceSession);

// Send session reminder manually
router.post('/:id/remind', verifyToken, checkRole('DM'), [
    sessionIdParam,
    body('reminder_type').optional().isIn(['non_responders', 'maybe_responders', 'all']).withMessage('Invalid reminder type')
], validateRequest, sessionDiscordController.remindSession);

// Uncancel a session (DM only)
router.post('/:id/uncancel', verifyToken, checkRole('DM'), [
    sessionIdParam
], validateRequest, sessionDiscordController.uncancelSession);

// ========================================================================
// ENHANCED ATTENDANCE ROUTES
// ========================================================================

// Record detailed attendance with timing and notes
router.post('/:id/attendance/detailed', verifyToken, [
    sessionIdParam,
    body('response_type').isIn([
        // Canonical response types
        'yes', 'no', 'maybe', 'late', 'early', 'late_and_early',
        // Legacy status aliases (normalized server-side)
        'accepted', 'declined', 'tentative'
    ]).withMessage('Invalid response type'),
    body('late_arrival_time').optional({ nullable: true, checkFalsy: true }).matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
    body('early_departure_time').optional({ nullable: true, checkFalsy: true }).matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format'),
    body('notes').optional({ nullable: true }).isLength({ max: 500 }).withMessage('Notes must be under 500 characters'),
    body('character_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid character')
], validateRequest, sessionAttendanceNotesController.recordDetailedAttendance);

// Get detailed session attendance
router.get('/:id/attendance/detailed', verifyToken, [
    sessionIdParam
], validateRequest, sessionAttendanceNotesController.getDetailedAttendance);

module.exports = router;
