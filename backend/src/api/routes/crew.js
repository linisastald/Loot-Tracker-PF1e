const express = require('express');
const router = express.Router();
const crewController = require('../../controllers/crewController');
const verifyToken = require('../../middleware/auth');
const checkRole = require('../../middleware/checkRole');

router.post('/', verifyToken, crewController.createCrew);
router.get('/', verifyToken, crewController.getAllCrew);
router.get('/by-location', verifyToken, crewController.getCrewByLocation);
router.get('/deceased', verifyToken, crewController.getDeceasedCrew);
router.put('/:id', verifyToken, crewController.updateCrew);
router.put('/:id/mark-dead', verifyToken, crewController.markCrewDead);
router.put('/:id/mark-departed', verifyToken, crewController.markCrewDeparted);
router.put('/:id/move', verifyToken, crewController.moveCrewToLocation);
// Deleting is DM-only (owner decision 2026-10-06); creating, editing and status changes stay open to every member
router.delete('/:id', verifyToken, checkRole('DM'), crewController.deleteCrew);

module.exports = router;
