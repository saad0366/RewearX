'use strict';

const reportService = require('../services/reportService');
const { success, asyncHandler } = require('../utils/response');

const create = asyncHandler(async (req, res) => {
  const report = await reportService.createReport(req.user.id, req.body);
  return success(res, 201, report, 'Report submitted.');
});

module.exports = { create };
