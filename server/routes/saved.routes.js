'use strict';

const router = require('express').Router();
const savedItemController = require('../controllers/savedItemController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', savedItemController.list);
router.post('/:itemId', validators.idParamRule('itemId'), savedItemController.save);
router.delete('/:itemId', validators.idParamRule('itemId'), savedItemController.unsave);

module.exports = router;
