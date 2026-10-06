'use strict';

const { Op } = require('sequelize');
const {
  Conversation,
  Message,
  SwapRequest,
  User,
  ClothingItem,
  ClothingImage,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notificationService');

const ensureParticipant = async (conversationId, userId) => {
  const conversation = await Conversation.findByPk(conversationId, {
    include: [{ model: SwapRequest, as: 'swapRequest' }],
  });
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  const swap = conversation.swapRequest;
  if (!swap) throw ApiError.internal('Conversation has no associated swap.');
  if (swap.senderId !== userId && swap.receiverId !== userId) {
    throw ApiError.forbidden('You are not a participant in this conversation.');
  }
  return { conversation, swap };
};

// Helper to get all shared conversation IDs between two users
const getAllSharedConversationIds = async (userId, otherUserId) => {
  const swaps = await SwapRequest.findAll({
    where: {
      [Op.or]: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
      status: { [Op.in]: ['accepted', 'completed'] },
    },
    attributes: ['id'],
  });

  const swapIds = swaps.map((s) => s.id);
  if (swapIds.length === 0) return [];

  const convs = await Conversation.findAll({
    where: { swapRequestId: { [Op.in]: swapIds } },
    attributes: ['id'],
  });

  return convs.map((c) => c.id);
};

const getConversations = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;

  const swaps = await SwapRequest.findAll({
    where: {
      [Op.or]: [{ senderId: userId }, { receiverId: userId }],
      status: { [Op.in]: ['accepted', 'completed'] },
    },
    attributes: ['id'],
  });

  const swapIds = swaps.map((s) => s.id);
  if (swapIds.length === 0) return { items: [], count: 0 };

  const rows = await Conversation.findAll({
    where: { swapRequestId: { [Op.in]: swapIds } },
    include: [
      {
        model: SwapRequest,
        as: 'swapRequest',
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'profileImage'] },
          { model: User, as: 'receiver', attributes: ['id', 'name', 'profileImage'] },
          {
            model: ClothingItem,
            as: 'senderItem',
            include: [{ model: ClothingImage, as: 'images' }],
          },
          {
            model: ClothingItem,
            as: 'receiverItem',
            include: [{ model: ClothingImage, as: 'images' }],
          },
        ],
      },
    ],
    order: [
      ['lastMessageAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  // Attach unread count + last message per conversation record
  const enriched = await Promise.all(
    rows.map(async (c) => {
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne({
          where: { conversationId: c.id },
          order: [['createdAt', 'DESC']],
        }),
        Message.count({
          where: { conversationId: c.id, senderId: { [Op.ne]: userId }, isRead: false },
        }),
      ]);
      return { ...c.toJSON(), lastMessage, unreadCount };
    })
  );

  // DEDUPLICATE BY OTHER USER ID (WhatsApp-style unified thread per partner)
  const userMap = new Map();
  for (const conv of enriched) {
    const swap = conv.swapRequest;
    if (!swap) continue;
    const otherUserId = String(swap.senderId) === String(userId) ? String(swap.receiverId) : String(swap.senderId);

    if (!userMap.has(otherUserId)) {
      userMap.set(otherUserId, conv);
    } else {
      const existing = userMap.get(otherUserId);
      existing.unreadCount = (existing.unreadCount || 0) + (conv.unreadCount || 0);

      // Keep the conversation thread that has the most recent activity
      const existingTime = new Date(
        existing.lastMessage?.createdAt || existing.lastMessageAt || existing.createdAt
      ).getTime();
      const currentTIme = new Date(
        conv.lastMessage?.createdAt || conv.lastMessageAt || conv.createdAt
      ).getTime();

      if (currentTIme > existingTime) {
        const totalUnread = existing.unreadCount;
        conv.unreadCount = totalUnread;
        userMap.set(otherUserId, conv);
      }
    }
  }

  const consolidated = Array.from(userMap.values());
  // Sort consolidated by most recent activity
  consolidated.sort((a, b) => {
    const tA = new Date(a.lastMessage?.createdAt || a.lastMessageAt || a.createdAt).getTime();
    const tB = new Date(b.lastMessage?.createdAt || b.lastMessageAt || b.createdAt).getTime();
    return tB - tA;
  });

  const paginatedItems = consolidated.slice(offset, offset + limit);
  return { items: paginatedItems, count: consolidated.length };
};

const getConversation = async (conversationId, userId) => {
  const { swap } = await ensureParticipant(conversationId, userId);
  const otherId = String(swap.senderId) === String(userId) ? swap.receiverId : swap.senderId;
  const { items } = await getConversations(userId, 1, Number.MAX_SAFE_INTEGER);
  const canonical = items.find(c => {
    const s = c.swapRequest;
    return String(s.senderId) === String(otherId) || String(s.receiverId) === String(otherId);
  });
  if (!canonical) throw ApiError.notFound('Conversation not found.');
  return canonical;
};

const getMessages = async (conversationId, userId, page = 1, limit = 50) => {
  const { swap } = await ensureParticipant(conversationId, userId);
  const otherUserId = swap.senderId === userId ? swap.receiverId : swap.senderId;

  // Find all conversation IDs shared between these two users (WhatsApp unified history)
  const sharedConvIds = await getAllSharedConversationIds(userId, otherUserId);
  const targetConvIds = sharedConvIds.length > 0 ? sharedConvIds : [conversationId];

  const offset = (page - 1) * limit;
  const { rows, count } = await Message.findAndCountAll({
    where: { conversationId: { [Op.in]: targetConvIds } },
    include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'profileImage'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  return { items: rows.reverse(), count };
};

const createMessage = async (conversationId, senderId, { message, attachmentUrl }) => {
  const { swap } = await ensureParticipant(conversationId, senderId);

  return sequelize.transaction(async (t) => {
    const msg = await Message.create(
      {
        conversationId,
        senderId,
        message,
        attachmentUrl: attachmentUrl || null,
      },
      { transaction: t }
    );

    await Conversation.update(
      { lastMessageAt: new Date() },
      { where: { id: conversationId }, transaction: t }
    );

    return { msg, swap };
  }).then(async ({ msg, swap }) => {
    const recipientId = swap.senderId === senderId ? swap.receiverId : swap.senderId;
    const sender = await User.findByPk(senderId, { attributes: ['id', 'name'] });
    await notificationService.createNotification(
      recipientId,
      notificationService.NOTIFICATION_TYPES.NEW_MESSAGE,
      'New message',
      `${sender.name}: ${msg.message.substring(0, 80)}${msg.message.length > 80 ? '…' : ''}`,
      { conversationId, messageId: msg.id, swapId: swap.id },
      false
    );

    const fullMsg = await Message.findByPk(msg.id, {
      include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'profileImage'] }],
    });
    return fullMsg;
  });
};

const markMessageRead = async (messageId, userId, requestedConversationId) => {
  const msg = await Message.findByPk(messageId, {
    include: [
      { model: Conversation, as: 'conversation', include: [{ model: SwapRequest, as: 'swapRequest' }] },
    ],
  });
  if (!msg) throw ApiError.notFound('Message not found.');
  if (requestedConversationId != null && Number(requestedConversationId) !== Number(msg.conversationId)) {
    throw ApiError.forbidden('Message does not belong to the requested conversation.');
  }
  const swap = msg.conversation.swapRequest;
  if (swap.senderId !== userId && swap.receiverId !== userId) {
    throw ApiError.forbidden('Not allowed.');
  }
  if (msg.senderId === userId) return msg;
  if (msg.isRead) return msg;
  msg.isRead = true;
  msg.readAt = new Date();
  await msg.save();
  return msg;
};

const markConversationRead = async (conversationId, userId) => {
  const { swap } = await ensureParticipant(conversationId, userId);
  const otherUserId = swap.senderId === userId ? swap.receiverId : swap.senderId;

  // Find all shared conversations with this partner user and mark unread messages as read
  const sharedConvIds = await getAllSharedConversationIds(userId, otherUserId);
  const targetConvIds = sharedConvIds.length > 0 ? sharedConvIds : [conversationId];

  const [count] = await Message.update(
    { isRead: true, readAt: new Date() },
    {
      where: {
        conversationId: { [Op.in]: targetConvIds },
        senderId: { [Op.ne]: userId },
        isRead: false,
      },
    }
  );
  return count;
};

module.exports = {
  ensureParticipant,
  getConversations,
  getConversation,
  getMessages,
  createMessage,
  markMessageRead,
  markConversationRead,
};
