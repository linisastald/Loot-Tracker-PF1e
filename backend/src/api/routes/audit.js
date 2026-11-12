// backend/src/api/routes/audit.js
// History page (audit log + undo). Mounted at /api/audit with csrfProtection in
// backend/index.js. DM-only: the log names players' actions and undo rewrites
// loot and gold.
const express = require('express');
const router = express.Router();
const auditController = require('../../controllers/auditController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

router.get('/', verifyToken, checkRole('DM'), auditController.listEntries);
router.post('/:id/undo', verifyToken, checkRole('DM'), auditController.undoEntry);

module.exports = router;
