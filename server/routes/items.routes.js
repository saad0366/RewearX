'use strict';

const router = require('express').Router();
const itemController = require('../controllers/itemController');
const validators = require('../utils/validators');
const { authenticate, optionalAuth } = require('../middleware/authMiddleware');
const { uploadSingle, uploadMultiple } = require('../middleware/uploadMiddleware');

router.get('/', optionalAuth, validators.itemSearch, itemController.list);

router.get('/user/:userId', validators.idParamRule('userId'), itemController.getByUser);
router.get('/:id', optionalAuth, validators.idParamRule('id'), itemController.getOne);

router.post(
  '/',
  authenticate,
  uploadMultiple('images'),
  validators.createItem,
  itemController.create
);
router.put('/:id', authenticate, validators.updateItem, itemController.update);
router.delete('/:id', authenticate, validators.idParamRule('id'), itemController.remove);

router.post(
  '/:id/images',
  authenticate,
  validators.idParamRule('id'),
  uploadMultiple('images'),
  itemController.addImages
);
router.delete(
  '/:id/images/:imgId',
  authenticate,
  validators.idParamRule('id'),
  validators.idParamRule('imgId'),
  itemController.removeImage
);
router.put(
  '/:id/images/:imgId/primary',
  authenticate,
  validators.idParamRule('id'),
  validators.idParamRule('imgId'),
  itemController.setPrimaryImage
);

module.exports = router;
