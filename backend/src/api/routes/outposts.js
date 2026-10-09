const express = require('express');
const router = express.Router();
const outpostController = require('../../controllers/outpostController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

router.post('/', verifyToken, outpostController.createOutpost);
router.get('/', verifyToken, outpostController.getAllOutposts);
router.put('/:id', verifyToken, outpostController.updateOutpost);
// Deleting is DM-only (owner decision 2026-10-06); creating, editing and status changes stay open to every member
router.delete('/:id', verifyToken, checkRole('DM'), outpostController.deleteOutpost);

module.exports = router;
