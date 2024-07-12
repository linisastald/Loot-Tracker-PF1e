const express = require('express');
const router = express.Router();
const lootController = require('../controllers/lootController');
const verifyToken = require('../middleware/auth');

router.post('/', verifyToken, lootController.createLoot);
router.get('/', verifyToken, lootController.getAllLoot);
router.put('/:id', verifyToken, lootController.updateLootStatus);
router.post('/split-stack', verifyToken, lootController.splitStack);
router.put('/update-entry/:id', verifyToken, lootController.updateEntry);
router.get('/trashed', verifyToken, lootController.getTrashedLoot);
router.get('/kept-party', verifyToken, lootController.getKeptPartyLoot);
router.get('/kept-character', verifyToken, lootController.getKeptCharacterLoot);



module.exports = router;
