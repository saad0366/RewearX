'use strict';

const router = require('express').Router();
const controller = require('../controllers/swapperOfWeekController');
const { authenticate } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/rbacMiddleware');

// Public route - get current swappers of the week
router.get('/', controller.getCurrent);

// Admin only - manually trigger update
router.post('/update', authenticate, requireAdmin, controller.triggerUpdate);

module.exports = router;
