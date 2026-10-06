'use strict';

const chatService = require('../services/chatService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const listConversations = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await chatService.getConversations(req.user.id, page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Conversations fetched.'
  );
});

const getConversation = asyncHandler(async (req, res) => {
  const conversation = await chatService.getConversation(parseInt(req.params.id, 10), req.user.id);
  return success(res, 200, conversation, 'Conversation fetched.');
});

const getMessages = asyncHandler(async (req, res) => {
  const conversationId = parseInt(req.params.id, 10);
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '50', 10);
  const result = await chatService.getMessages(conversationId, req.user.id, page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Messages fetched.'
  );
});

const sendMessage = asyncHandler(async (req, res) => {
  const conversationId = parseInt(req.params.id, 10);
  const msg = await chatService.createMessage(conversationId, req.user.id, req.body);

  // Push real-time
  const io = req.app.get('io');
  if (io) {
    io.to(`conversation:${conversationId}`).emit('receive-message', {
      id: msg.id,
      conversationId,
      senderId: msg.senderId,
      senderName: msg.sender?.name,
      message: msg.message,
      attachmentUrl: msg.attachmentUrl,
      createdAt: msg.createdAt,
    });
  }

  return success(res, 201, msg, 'Message sent.');
});

const markRead = asyncHandler(async (req, res) => {
  const conversationId = parseInt(req.params.id, 10);
  const count = await chatService.markConversationRead(conversationId, req.user.id);
  return success(res, 200, { markedRead: count }, 'Marked as read.');
});

module.exports = { listConversations, getConversation, getMessages, sendMessage, markRead };
