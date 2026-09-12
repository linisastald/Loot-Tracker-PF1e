// backend/src/api/routes/sessionTasks.js
// DM-editable session task definitions (the pre/during/post pools dealt out by
// the Tasks page). Mounted at /api/session-tasks with csrfProtection in
// backend/index.js.
const express = require('express');
const router = express.Router();
const sessionTaskController = require('../../controllers/sessionTaskController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

// Full task list for the active campaign (all members - the Tasks page needs it)
router.get('/', verifyToken, sessionTaskController.getAll);

// Create a task (DM only)
router.post('/', verifyToken, checkRole('DM'), sessionTaskController.create);

// Re-sequence one phase's tasks (DM only). Literal path before '/:id'.
router.put('/reorder', verifyToken, checkRole('DM'), sessionTaskController.reorder);

// Replace the list with the stock defaults (DM only)
router.post('/reset-defaults', verifyToken, checkRole('DM'), sessionTaskController.resetDefaults);

// Update / delete one task (DM only)
router.put('/:id', verifyToken, checkRole('DM'), sessionTaskController.update);
router.delete('/:id', verifyToken, checkRole('DM'), sessionTaskController.remove);

module.exports = router;
