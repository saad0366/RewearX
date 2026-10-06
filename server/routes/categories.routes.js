'use strict';

const router = require('express').Router();
const categoryController = require('../controllers/categoryController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/rbacMiddleware');
const { auditAdminAction } = require('../middleware/auditLogger');
const { uploadSingle } = require('../middleware/uploadMiddleware');

router.get('/', categoryController.list);

// Admin only
router.post('/', authenticate, requireAdmin, auditAdminAction, uploadSingle('icon'), validators.createCategory, categoryController.create);
router.put('/:id', authenticate, requireAdmin, auditAdminAction, uploadSingle('icon'), validators.updateCategory, categoryController.update);
router.patch('/:id/deactivate', authenticate, requireAdmin, auditAdminAction, validators.idParamRule('id'), categoryController.deactivate);
router.delete('/:id', authenticate, requireAdmin, auditAdminAction, validators.idParamRule('id'), categoryController.deleteCategory);

module.exports = router;
