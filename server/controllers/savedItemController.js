'use strict';

const savedItemService = require('../services/savedItemService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const save = asyncHandler(async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const result = await savedItemService.saveItem(req.user.id, itemId);
  return success(res, result.created ? 201 : 200, result.saved, 'Item saved.');
});

const unsave = asyncHandler(async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  await savedItemService.unsaveItem(req.user.id, itemId);
  return success(res, 200, null, 'Item unsaved.');
});

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await savedItemService.listSaved(req.user.id, page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Saved items fetched.'
  );
});

module.exports = { save, unsave, list };
