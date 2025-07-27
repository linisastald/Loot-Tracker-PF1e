// src/api/routes/appraisal.js
const express = require('express');
const router = express.Router();
const appraisalController = require('../../controllers/appraisalController');
const verifyToken = require('../../middleware/auth');

// Apply authentication to all appraisal routes
router.use(verifyToken);

// Appraisal operations
router.post('/appraise', appraisalController.appraiseLoot);
router.get('/items/:lootId', appraisalController.getItemAppraisals);

// Identification operations
router.get('/unidentified', appraisalController.getUnidentifiedItems);
router.post('/identify', appraisalController.identifyItems);
router.get('/attempts/:characterId', appraisalController.getIdentificationAttempts);

// Statistics and bulk operations
router.get('/statistics', appraisalController.getAppraisalStatistics);
router.patch('/values/bulk-update', appraisalController.bulkUpdateItemValues);

module.exports = router;