// src/api/routes/user.js
const express = require('express');
const router = express.Router();
const userController = require('../../controllers/userController');
const verifyToken = require('../../middleware/auth');

// General user routes - require authentication
router.put('/change-password', verifyToken, userController.changePassword);
router.put('/change-email', verifyToken, userController.changeEmail); // New route for changing email
router.get('/characters', verifyToken, userController.getCharacters);
router.post('/characters', verifyToken, userController.addCharacter);
router.put('/characters', verifyToken, userController.updateCharacter);
router.put('/deactivate-all-characters', verifyToken, userController.deactivateAllCharacters);
router.get('/active-characters', verifyToken, userController.getActiveCharacters);

// DM-only routes - require DM role
const checkRole = (roles) => (req, res, next) => {
  try {
    // Ensure roles is always an array
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    // Get user role from the token data (added by verifyToken middleware)
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(403).json({ message: 'Access denied: User role not found' });
    }

    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ message: 'Access denied: Insufficient permissions' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Internal server error during authorization' });
  }
};

router.get('/all', verifyToken, checkRole(['DM']), userController.getAllUsers);
router.put('/reset-password', verifyToken, checkRole(['DM']), userController.resetPassword);
router.put('/delete-user', verifyToken, checkRole(['DM']), userController.deleteUser);
router.put('/update-setting', verifyToken, checkRole(['DM']), userController.updateSetting);
router.get('/settings', verifyToken, checkRole(['DM']), userController.getSettings);
router.get('/all-characters', verifyToken, checkRole(['DM']), userController.getAllCharacters);

// Keep at the bottom to avoid route conflicts
router.get('/:id', verifyToken, userController.getUserById);

module.exports = router;