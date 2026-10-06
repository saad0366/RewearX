'use strict';

const featuredItemsService = require('../services/featuredItemsService');
const { success, asyncHandler } = require('../utils/response');

const getFeatured = asyncHandler(async (req, res) => {
  const items = await featuredItemsService.getFeaturedItems();
  return success(res, 200, items, 'Featured items fetched.');
});

module.exports = { getFeatured };
