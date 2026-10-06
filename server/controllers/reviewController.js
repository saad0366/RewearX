'use strict';

const reviewService = require('../services/reviewService');
const { success, asyncHandler } = require('../utils/response');

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user.id, req.body);
  return success(res, 201, review, 'Review submitted.');
});

module.exports = { create };
