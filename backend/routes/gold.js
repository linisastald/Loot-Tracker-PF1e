const express = require('express');
const router = express.Router();
const goldController = require('../controllers/goldController');

router.post('/', goldController.createGoldEntry);

module.exports = router;
