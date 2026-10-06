'use strict';

const { Notification, User } = require('../models');
const ApiError = require('../utils/ApiError');
const emailService = require('./emailService');
const logger = require('../utils/logger');

let ioRef = null;
const setIO = (io) => {
  ioRef = io;
};

const NOTIFICATION_TYPES = {
  SWAP_REQUEST: 'swap_request',
  SWAP_ACCEPTED: 'swap_accepted',
  SWAP_REJECTED: 'swap_rejected',
  SWAP_CANCELLED: 'swap_cancelled',
  SWAP_COMPLETED: 'swap_completed',
  NEW_MESSAGE: 'new_message',
  REVIEW_RECEIVED: 'review_received',
  REPORT_RECEIVED: 'report_received',
  ITEM_SAVED: 'item_saved',
  SYSTEM: 'system',
};

const EMAIL_NOTIFICATION_TYPES = new Set([
  NOTIFICATION_TYPES.SWAP_REQUEST,
  NOTIFICATION_TYPES.SWAP_ACCEPTED,
  NOTIFICATION_TYPES.SWAP_COMPLETED,
  NOTIFICATION_TYPES.SYSTEM,
]);

const createNotification = async (userId, type, title, message, data = null, sendEmail = true) => {
  const notification = await Notification.create({
    userId,
    type,
    title,
    message,
    data: data ? JSON.stringify(data) : null,
  });

  // Push real-time
  if (ioRef) {
    ioRef.to(`user:${userId}`).emit('notification', {
      id: notification.id,
      type,
      title,
      message,
      data,
      isRead: false,
      createdAt: notification.createdAt,
    });
  }

  // Email for critical events
  if (sendEmail && EMAIL_NOTIFICATION_TYPES.has(type)) {
    try {
      const user = await User.findByPk(userId);
      if (user?.email) {
        if (type.startsWith('swap_')) {
          await emailService.sendSwapNotification(user.email, user.name, type, message);
        } else {
          await emailService.sendGenericEmail(user.email, user.name, title, message);
        }
      }
    } catch (err) {
      logger.error(`Failed to send notification email: ${err.message}`);
    }
  }

  return notification;
};

const getNotifications = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await Notification.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  const items = rows.map((n) => ({
    ...n.toJSON(),
    data: n.data ? safeParse(n.data) : null,
  }));

  return { items, count };
};

const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findByPk(notificationId);
  if (!notification) throw ApiError.notFound('Notification not found.');
  if (notification.userId !== userId) {
    throw ApiError.forbidden('Cannot modify another user\'s notification.');
  }
  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();
  return notification;
};

const markAllAsRead = async (userId) => {
  const [count] = await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { userId, isRead: false } }
  );
  return count;
};

const getUnreadCount = async (userId) => {
  return Notification.count({ where: { userId, isRead: false } });
};

const safeParse = (str) => {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
};

module.exports = {
  setIO,
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  NOTIFICATION_TYPES,
};
