const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.loginUser);
router.post('/register', authController.registerUser);
router.get('/check-dm', authController.checkForDm);
router.get('/check-registration-status', authController.checkRegistrationStatus);

module.exports = router;
