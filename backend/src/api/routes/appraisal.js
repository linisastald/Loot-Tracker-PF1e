// src/api/routes/appraisal.js
const express = require('express');
const router = express.Router();
const appraisalController = require('../../controllers/appraisalController');
const verifyToken = require('../../middleware/auth');
const { createValidationMiddleware, validate } = require('../../middleware/validation');

// Apply authentication to all appraisal routes
router.use(verifyToken);

// Appraisal operations with validation
router.post('/appraise', createValidationMiddleware('appraiseLoot'), appraisalController.appraiseLoot);
router.get('/items/:lootId', validate({
  params: {
    lootId: { type: 'number', required: true, min: 1 }
  }
}), appraisalController.getItemAppraisals);

// Identification operations
router.get('/unidentified', appraisalController.getUnidentifiedItems);
router.post('/identify', appraisalController.identifyItems);
router.get('/attempts/:characterId', appraisalController.getIdentificationAttempts);

// Statistics and bulk operations
router.get('/statistics', appraisalController.getAppraisalStatistics);
router.patch('/values/bulk-update', appraisalController.bulkUpdateItemValues);

module.exports = router;