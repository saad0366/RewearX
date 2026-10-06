'use strict';

const { Op } = require('sequelize');
const {
  User,
  ClothingItem,
  SwapRequest,
  Report,
  Review,
  Message,
  Category,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');

const listUsers = async ({ page = 1, limit = 20, search, status, role } = {}) => {
  const offset = (page - 1) * limit;
  const where = {};
  if (status) where.status = status;
  if (role) where.role = role;
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }
  const { rows, count } = await User.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { items: rows, count };
};

const setUserStatus = async (userId, status, adminId) => {
  if (!['active', 'blocked'].includes(status)) {
    throw ApiError.badRequest('Invalid status.');
  }
  if (userId === adminId) {
    throw ApiError.badRequest('You cannot modify your own status.');
  }
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('User not found.');
  user.status = status;
  await user.save();
  return user;
};

const blockUser = (userId, adminId) => setUserStatus(userId, 'blocked', adminId);
const unblockUser = (userId, adminId) => setUserStatus(userId, 'active', adminId);

const listAllItems = async ({ page = 1, limit = 20, search, available } = {}) => {
  const offset = (page - 1) * limit;
  const where = {};
  if (available !== undefined) where.isAvailable = available;
  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { brand: { [Op.like]: `%${search}%` } },
    ];
  }
  const { rows, count } = await ClothingItem.findAndCountAll({
    where,
    include: [
      { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
      { model: Category, as: 'category' },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { items: rows, count };
};

const removeItem = async (itemId) => {
  const item = await ClothingItem.findByPk(itemId);
  if (!item) throw ApiError.notFound('Item not found.');
  await item.update({ isAvailable: false });
  return item;
};

const getStats = async () => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    newUsersThisWeek,
    totalItems,
    availableItems,
    totalSwaps,
    completedSwaps,
    pendingSwaps,
    totalMessages,
    pendingReports,
    avgRatingRow,
  ] = await Promise.all([
    User.count(),
    User.count({ where: { status: 'active' } }),
    User.count({ where: { status: 'blocked' } }),
    User.count({ where: { createdAt: { [Op.gte]: oneWeekAgo } } }),
    ClothingItem.count(),
    ClothingItem.count({ where: { isAvailable: true } }),
    SwapRequest.count(),
    SwapRequest.count({ where: { status: 'completed' } }),
    SwapRequest.count({ where: { status: 'pending' } }),
    Message.count(),
    Report.count({ where: { status: 'pending' } }),
    Review.findOne({
      attributes: [[sequelize.fn('AVG', sequelize.col('rating')), 'avgRating']],
      raw: true,
    }),
  ]);

  const swapsByStatus = await SwapRequest.findAll({
    attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    group: ['status'],
    raw: true,
  });

  const itemsByCategory = await ClothingItem.findAll({
    attributes: [
      'categoryId',
      [sequelize.fn('COUNT', sequelize.col('ClothingItem.id')), 'count'],
    ],
    include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
    group: ['ClothingItem.category_id', 'category.id', 'category.name'],
    raw: false,
  });

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      blocked: blockedUsers,
      newThisWeek: newUsersThisWeek,
    },
    items: {
      total: totalItems,
      available: availableItems,
      byCategory: itemsByCategory.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.category?.name || 'Unknown',
        count: parseInt(row.dataValues.count, 10),
      })),
    },
    swaps: {
      total: totalSwaps,
      completed: completedSwaps,
      pending: pendingSwaps,
      byStatus: swapsByStatus.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {}),
    },
    messages: { total: totalMessages },
    reports: { pending: pendingReports },
    reviews: {
      avgRating: avgRatingRow?.avgRating
        ? Number(parseFloat(avgRatingRow.avgRating).toFixed(2))
        : null,
    },
  };
};

module.exports = {
  listUsers,
  setUserStatus,
  blockUser,
  unblockUser,
  listAllItems,
  removeItem,
  getStats,
};
