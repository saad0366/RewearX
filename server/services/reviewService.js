'use strict';

const { Op } = require('sequelize');
const { Review, SwapRequest, User, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const notificationService = require('./notificationService');

const createReview = async (reviewerId, { swapRequestId, revieweeId, rating, comment }) => {
  const swap = await SwapRequest.findByPk(swapRequestId);
  if (!swap) throw ApiError.notFound('Swap not found.');
  if (swap.status !== 'completed') {
    throw ApiError.badRequest('Reviews are allowed only for completed swaps.');
  }
  if (swap.senderId !== reviewerId && swap.receiverId !== reviewerId) {
    throw ApiError.forbidden('You are not a participant in this swap.');
  }
  const expectedReviewee = swap.senderId === reviewerId ? swap.receiverId : swap.senderId;
  if (expectedReviewee !== revieweeId) {
    throw ApiError.badRequest('Reviewee does not match swap participants.');
  }

  const existing = await Review.findOne({ where: { reviewerId, swapRequestId } });
  if (existing) throw ApiError.conflict('You have already reviewed this swap.');

  const review = await Review.create({
    reviewerId,
    revieweeId,
    swapRequestId,
    rating,
    comment: comment || null,
  });

  const reviewer = await User.findByPk(reviewerId, { attributes: ['id', 'name'] });
  await notificationService.createNotification(
    revieweeId,
    notificationService.NOTIFICATION_TYPES.REVIEW_RECEIVED,
    'New review received',
    `${reviewer.name} left you a ${rating}-star review.`,
    { reviewId: review.id, swapRequestId },
    false
  );

  return review;
};

const getUserReviews = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await Review.findAndCountAll({
    where: { revieweeId: userId },
    include: [
      { model: User, as: 'reviewer', attributes: ['id', 'name', 'profileImage'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  const aggregate = await Review.findOne({
    where: { revieweeId: userId },
    attributes: [
      [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalReviews'],
    ],
    raw: true,
  });

  return {
    items: rows,
    count,
    aggregate: {
      avgRating: aggregate?.avgRating ? Number(parseFloat(aggregate.avgRating).toFixed(2)) : null,
      totalReviews: aggregate?.totalReviews ? parseInt(aggregate.totalReviews, 10) : 0,
    },
  };
};

module.exports = { createReview, getUserReviews };
