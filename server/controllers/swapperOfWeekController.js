'use strict';

const swapperService = require('../services/swapperOfWeekService');
const { success, asyncHandler } = require('../utils/response');

const getCurrent = asyncHandler(async (req, res) => {
  const swappers = await swapperService.getCurrentSwappers();
  return success(res, 200, swappers, 'Swappers of the week fetched.');
});

const triggerUpdate = asyncHandler(async (req, res) => {
  const result = await swapperService.updateSwapperOfWeek();
  return success(res, 200, result, 'Swapper of the week updated manually.');
});

module.exports = { getCurrent, triggerUpdate };
