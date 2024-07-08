const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');

router.post('/', lootController.createLoot);
router.get('/', lootController.getAllLoot);

module.exports = router;
