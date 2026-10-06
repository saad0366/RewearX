'use strict';

const router = require('express').Router();
const chatController = require('../controllers/chatController');
const validators = require('../utils/validators');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

router.get('/', chatController.listConversations);
router.get('/:id', validators.idParamRule('id'), chatController.getConversation);
router.get('/:id/messages', validators.idParamRule('id'), chatController.getMessages);
router.post('/:id/messages', validators.sendMessage, chatController.sendMessage);
router.put('/:id/read', validators.idParamRule('id'), chatController.markRead);

module.exports = router;
