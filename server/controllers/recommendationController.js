'use strict';

const recommendationService = require('../services/recommendationService');
const { success, asyncHandler } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || '20', 10);
  const refresh = req.query.refresh === 'true';
  const recs = await recommendationService.getRecommendations(req.user.id, limit, refresh);
  return success(res, 200, recs, 'Recommendations fetched.');
});

module.exports = { list };
