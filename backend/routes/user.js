const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

router.put('/change-password', verifyToken, userController.changePassword);
router.get('/characters', verifyToken, userController.getCharacters);
router.post('/characters', verifyToken, userController.addCharacter);
router.get('/all', verifyToken, checkRole(['DM']), userController.getAllUsers);
router.put('/characters', verifyToken, userController.updateCharacter);
router.put('/deactivate-all-characters', verifyToken, userController.deactivateAllCharacters);

//DM ONLY
router.put('/reset-password', verifyToken, checkRole(['DM']), userController.resetPassword);
router.put('/delete-user', verifyToken, checkRole(['DM']), userController.deleteUser);
router.put('/update-setting', verifyToken, checkRole(['DM']), userController.updateSetting);
router.get('/settings', verifyToken, checkRole(['DM']), userController.getSettings);
router.get('/all-characters', verifyToken, checkRole(['DM']), userController.getAllCharacters);


//Keep at the bottom
router.get('/:id', verifyToken, userController.getUserById);



module.exports = router;
