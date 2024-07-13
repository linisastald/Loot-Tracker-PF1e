const express = require('express');
const router = express.Router();
const soldController = require('../controllers/soldController');
const verifyToken = require('../middleware/auth');

router.post('/', verifyToken, soldController.create);
router.get('/', verifyToken, soldController.getAll);
router.get('/:soldon', verifyToken, soldController.getDetailsByDate);

module.exports = router;
