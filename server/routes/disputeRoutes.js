'use strict';

const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/rbacMiddleware');
const { uploadMultiple } = require('../middleware/uploadMiddleware');

// User routes (Authenticated)
router.use(authenticate);

router.post('/', uploadMultiple('images', 5), disputeController.create);
router.get('/', disputeController.listUserDisputes);

// Admin routes
router.get('/admin/all', requireAdmin, disputeController.listAdmin);
router.put('/admin/:id/resolve', requireAdmin, disputeController.resolveAdmin);

// Param routes
router.get('/:id', disputeController.getById);
router.post('/:id/evidence', uploadMultiple('images', 5), disputeController.uploadEvidence);

module.exports = router;
