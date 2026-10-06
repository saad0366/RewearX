'use strict';

const router = require('express').Router();
const notificationController = require('../controllers/notificationController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.put('/:id/read', validators.idParamRule('id'), notificationController.markRead);
router.put('/read-all', notificationController.markAllRead);

module.exports = router;
