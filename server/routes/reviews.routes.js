'use strict';

const router = require('express').Router();
const reviewController = require('../controllers/reviewController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/', authenticate, validators.createReview, reviewController.create);

module.exports = router;
