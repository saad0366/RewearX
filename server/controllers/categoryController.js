'use strict';

const categoryService = require('../services/categoryService');
const { success, asyncHandler } = require('../utils/response');

const list = asyncHandler(async (req, res) => {
  const all = req.query.all === 'true';
  const cats = await categoryService.listCategories(!all);
  return success(res, 200, cats, 'Categories fetched.');
});

const create = asyncHandler(async (req, res) => {
  // Convert string 'true'/'false' from FormData to boolean
  if (req.body.isActive !== undefined) {
    req.body.isActive = req.body.isActive === 'true' || req.body.isActive === true;
  }
  const c = await categoryService.createCategory(req.file, req.body);
  return success(res, 201, c, 'Category created.');
});

const update = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  // Convert string 'true'/'false' from FormData to boolean
  if (req.body.isActive !== undefined) {
    req.body.isActive = req.body.isActive === 'true' || req.body.isActive === true;
  }
  const c = await categoryService.updateCategory(id, req.file, req.body);
  return success(res, 200, c, 'Category updated.');
});

const deactivate = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = await categoryService.deactivateCategory(id);
  return success(res, 200, c, 'Category deactivated.');
});

const deleteCategory = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await categoryService.deleteCategory(id);
  return success(res, 200, null, 'Category deleted permanently.');
});

module.exports = { list, create, update, deactivate, deleteCategory };
