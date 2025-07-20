const express = require('express');
const router = express.Router();
const crewController = require('../../controllers/crewController');
const verifyToken = require('../../middleware/auth');

router.post('/', verifyToken, crewController.createCrew);
router.get('/', verifyToken, crewController.getAllCrew);
router.get('/by-location', verifyToken, crewController.getCrewByLocation);
router.get('/deceased', verifyToken, crewController.getDeceasedCrew);
router.get('/:id', verifyToken, crewController.getCrewById);
router.put('/:id', verifyToken, crewController.updateCrew);
router.put('/:id/mark-dead', verifyToken, crewController.markCrewDead);
router.put('/:id/mark-departed', verifyToken, crewController.markCrewDeparted);
router.put('/:id/move', verifyToken, crewController.moveCrewToLocation);
router.delete('/:id', verifyToken, crewController.deleteCrew);

module.exports = router;
