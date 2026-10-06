'use strict';

const router = require('express').Router();
const swapController = require('../controllers/swapController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.post('/', validators.createSwap, swapController.create);
router.get('/', swapController.list);
router.get('/:id', validators.idParamRule('id'), swapController.getOne);
router.put('/:id/status', validators.updateSwapStatus, swapController.updateStatus);

module.exports = router;
