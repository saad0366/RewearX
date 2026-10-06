'use strict';

const notificationService = require('../services/notificationService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await notificationService.getNotifications(req.user.id, page, limit);
  const unread = await notificationService.getUnreadCount(req.user.id);
  return paginated(
    res,
    200,
    result.items,
    { ...buildPagination(result.count, page, limit), unread },
    'Notifications fetched.'
  );
});

const markRead = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const n = await notificationService.markAsRead(id, req.user.id);
  return success(res, 200, n, 'Marked as read.');
});

const markAllRead = asyncHandler(async (req, res) => {
  const count = await notificationService.markAllAsRead(req.user.id);
  return success(res, 200, { markedRead: count }, 'All marked as read.');
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  return success(res, 200, { unread: count }, 'Unread count.');
});

module.exports = { list, markRead, markAllRead, unreadCount };
