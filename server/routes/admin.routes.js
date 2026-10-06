'use strict';

const router = require('express').Router();
const adminController = require('../controllers/adminController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/rbacMiddleware');
const { auditAdminAction } = require('../middleware/auditLogger');

router.use(authenticate, requireAdmin, auditAdminAction);

// Users
router.get('/users', adminController.listUsers);
router.put('/users/:id/status', validators.adminUserStatus, adminController.updateUserStatus);

// Reports
router.get('/reports', adminController.listReports);
router.put('/reports/:id', validators.adminReportStatus, adminController.updateReportStatus);

// Items
router.get('/items', adminController.listAllItems);
router.delete('/items/:id', validators.idParamRule('id'), adminController.removeItem);

// Stats
router.get('/stats', adminController.stats);

module.exports = router;
