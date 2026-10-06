'use strict';

const router = require('express').Router();
const itemController = require('../controllers/itemController');
const validators = require('../utils/validators');
const imageAiController = require('../controllers/imageAiController');
const { uploadSingle } = require('../middleware/uploadMiddleware');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');

// Reuse the visual URL already referenced by the client; extraction only in Stage 1.
router.get('/visual', authenticate, imageAiController.capabilities);
router.post('/visual', authenticate, uploadSingle('image'), imageAiController.extract);

router.get('/', optionalAuth, validators.itemSearch, itemController.search);

module.exports = router;
