const express = require('express');
const router = express.Router();
const outpostController = require('../../controllers/outpostController');
const verifyToken = require('../../middleware/auth');

router.post('/', verifyToken, outpostController.createOutpost);
router.get('/', verifyToken, outpostController.getAllOutposts);
router.get('/:id', verifyToken, outpostController.getOutpostById);
router.put('/:id', verifyToken, outpostController.updateOutpost);
router.delete('/:id', verifyToken, outpostController.deleteOutpost);

module.exports = router;
