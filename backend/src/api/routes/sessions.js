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

// Middleware to check express-validator validation results
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const response = ApiResponse.validationError(errors.array());
        return ApiResponse.send(res, response);
    }
    next();
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

// Get upcoming sessions view with attendance summary
router.get('/upcoming-detailed', verifyToken, sessionListController.getUpcomingDetailed);

// Get user's Discord mapping
router.get('/discord-mapping', verifyToken, sessionDiscordController.getDiscordMapping);

// ========================================================================
// TASK ASSIGNMENT HISTORY ROUTES
// Records manual pre/during/post task assignments made from the Tasks page.
// ========================================================================

// Save a task assignment to history
router.post('/task-history', verifyToken, [
    body('assignments').exists().withMessage('assignments are required')
], sessionTaskHistoryController.saveTaskHistory);

// Get task assignment history (most recent first)
router.get('/task-history', verifyToken, [
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200')
], sessionTaskHistoryController.getTaskHistory);

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
], validateRequest, recurringSessionController.createRecurringSession);

// Get recurring session instances
router.get('/recurring/:templateId/instances', verifyToken, [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    query('upcoming_only').optional().isBoolean().withMessage('Invalid upcoming_only flag'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit')
], recurringSessionController.getRecurringInstances);

// Update recurring session template (DM only)
router.put('/recurring/:templateId', verifyToken, checkRole('DM'), [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Description too long'),
    body('update_instances').optional().isBoolean().withMessage('Invalid update_instances flag')
], recurringSessionController.updateRecurringSession);

// Delete recurring session template (DM only)
router.delete('/recurring/:templateId', verifyToken, checkRole('DM'), [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    query('delete_instances').optional().isBoolean().withMessage('Invalid delete_instances flag')
], recurringSessionController.deleteRecurringSession);

// Generate additional instances for recurring session (DM only)
router.post('/recurring/:templateId/generate', verifyToken, checkRole('DM'), [
    param('templateId').notEmpty().withMessage('Template ID is required'),
    body('count').optional().isInt({ min: 1, max: 52 }).withMessage('Invalid count (1-52)')
], recurringSessionController.generateAdditionalInstances);

// ========================================================================
// DISCORD INTEGRATION ROUTES
// ========================================================================

// Post session announcement manually
router.post('/:id/announce', verifyToken, checkRole('DM'), [
    param('id').isInt().withMessage('Session ID must be an integer')
], sessionDiscordController.announceSession);

// Send session reminder manually
router.post('/:id/remind', verifyToken, checkRole('DM'), [
    param('id').isInt().withMessage('Session ID must be an integer'),
    body('reminder_type').optional().isIn(['non_responders', 'maybe_responders', 'all']).withMessage('Invalid reminder type')
], sessionDiscordController.remindSession);

// Uncancel a session (DM only)
router.post('/:id/uncancel', verifyToken, checkRole('DM'), [
    param('id').isInt().withMessage('Session ID must be an integer')
], sessionDiscordController.uncancelSession);

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
], validateRequest, sessionAttendanceNotesController.recordDetailedAttendance);

// Get detailed session attendance
router.get('/:id/attendance/detailed', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer')
], sessionAttendanceNotesController.getDetailedAttendance);

// ========================================================================
// SESSION NOTES ROUTES
// ========================================================================

// Add session note (prep request, general note, etc.)
router.post('/:id/notes', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer'),
    body('note').notEmpty().withMessage('Note content is required'),
    body('note_type').optional().isIn(['prep_request', 'general', 'dm_note']).withMessage('Invalid note type')
], sessionAttendanceNotesController.addSessionNote);

// Get session notes
router.get('/:id/notes', verifyToken, [
    param('id').isInt().withMessage('Session ID must be an integer')
], sessionAttendanceNotesController.getSessionNotes);

// ========================================================================
// DISCORD USER MAPPING ROUTES
// ========================================================================

// Link Discord account to user
router.post('/link-discord', verifyToken, [
    body('discord_id').notEmpty().withMessage('Discord ID is required'),
    body('discord_username').optional().isLength({ max: 100 }).withMessage('Discord username too long')
], sessionDiscordController.linkDiscord);

module.exports = router;
