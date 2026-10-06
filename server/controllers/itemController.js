'use strict';

const itemService = require('../services/itemService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const create = asyncHandler(async (req, res) => {
  const item = await itemService.createItem(req.user.id, req.body, req.files || []);
  return success(res, 201, item, 'Item created.');
});

const list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);

  const filters = {
    categoryId: req.query.categoryId ? parseInt(req.query.categoryId, 10) : undefined,
    gender: req.query.gender,
    condition: req.query.condition,
    size: req.query.size,
    color: req.query.color,
    brand: req.query.brand,
    location: req.query.location,
    q: req.query.q,
    excludeUserId: req.user?.id,
  };

  const result = await itemService.listItems(filters, page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Items fetched.'
  );
});

const getOne = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = await itemService.getItemById(id);
  itemService.incrementView(id).catch(() => null);
  return success(res, 200, item, 'Item fetched.');
});

const update = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = await itemService.updateItem(id, req.user.id, req.body);
  return success(res, 200, item, 'Item updated.');
});

const remove = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await itemService.deleteItem(id, req.user.id);
  return success(res, 200, null, 'Item removed.');
});

const getByUser = asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await itemService.getUserItems(userId, page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'User items fetched.'
  );
});

const addImages = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = await itemService.addImages(id, req.user.id, req.files || []);
  return success(res, 200, item, 'Images uploaded.');
});

const removeImage = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const imgId = parseInt(req.params.imgId, 10);
  await itemService.deleteImage(id, imgId, req.user.id);
  return success(res, 200, null, 'Image deleted.');
});

const setPrimaryImage = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const imgId = parseInt(req.params.imgId, 10);
  const item = await itemService.setPrimaryImage(id, imgId, req.user.id);
  return success(res, 200, item, 'Primary image set.');
});

const search = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);

  if (req.query.q) {
    const nlpService = require('../services/nlpSearchService');
    const nlpResults = await nlpService.nlpSearch(req.query.q, req.user?.id, limit);
    if (nlpResults) {
      return paginated(
        res,
        200,
        nlpResults,
        buildPagination(nlpResults.length, page, limit),
        'NLP search results.'
      );
    }
  }

  const filters = {
    q: req.query.q,
    categoryId: req.query.categoryId ? parseInt(req.query.categoryId, 10) : undefined,
    gender: req.query.gender,
    condition: req.query.condition,
    size: req.query.size,
    color: req.query.color,
    brand: req.query.brand,
    location: req.query.location,
    excludeUserId: req.user?.id,
  };
  const result = await itemService.listItems(filters, page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Search results.'
  );
});

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  getByUser,
  addImages,
  removeImage,
  setPrimaryImage,
  search,
};
