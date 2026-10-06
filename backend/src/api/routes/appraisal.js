// src/api/routes/appraisal.js
const express = require('express');
const router = express.Router();
const appraisalController = require('../../controllers/appraisalController');
const verifyToken = require('../../middleware/auth');
const { createValidationMiddleware } = require('../../middleware/validation');

// Apply authentication to all appraisal routes
router.use(verifyToken);

// Appraisal operations with validation
router.post('/appraise', createValidationMiddleware('appraiseLoot'), appraisalController.appraiseLoot);

// Identification operations
router.get('/unidentified', appraisalController.getUnidentifiedItems);
router.post('/identify', appraisalController.identifyItems);

module.exports = router;
