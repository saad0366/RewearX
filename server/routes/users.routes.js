'use strict';

const router = require('express').Router();
const userController = require('../controllers/userController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');
const { uploadSingle } = require('../middleware/uploadMiddleware');

// Self
router.get('/me', authenticate, userController.getMe);
router.put('/me', authenticate, validators.updateProfile, userController.updateMe);
router.post('/me/avatar', authenticate, uploadSingle('image'), userController.uploadProfileImage);

// Preferences
router.get('/me/preferences', authenticate, userController.getMyPreferences);
router.put(
  '/me/preferences',
  authenticate,
  validators.updatePreferences,
  userController.updateMyPreferences
);

// Addresses
router.get('/me/addresses', authenticate, userController.listAddresses);
router.post('/me/addresses', authenticate, validators.createAddress, userController.addAddress);
router.delete('/me/addresses/:id', authenticate, validators.idParamRule('id'), userController.deleteAddress);

// Public
router.get('/:id', authenticate, validators.idParamRule('id'), userController.getById);
router.get('/:id/reviews', validators.idParamRule('id'), userController.getUserReviews);

module.exports = router;
