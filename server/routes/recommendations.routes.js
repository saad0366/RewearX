'use strict';

const router = require('express').Router();
const recommendationController = require('../controllers/recommendationController');
const { authenticate } = require('../middleware/authMiddleware');

router.get('/', authenticate, recommendationController.list);

module.exports = router;
