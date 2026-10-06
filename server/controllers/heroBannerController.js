'use strict';

const heroBannerService = require('../services/heroBannerService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

// Public endpoint - get active banners
const getActiveBanners = asyncHandler(async (req, res) => {
  const banners = await heroBannerService.getActiveBanners();
  return success(res, 200, banners, 'Active hero banners fetched.');
});

// Admin endpoints
const listAllBanners = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await heroBannerService.listAllBanners(page, limit);
  return paginated(
    res,
    200,
    result.items,
    buildPagination(result.count, page, limit),
    'Hero banners fetched.'
  );
});

const getBannerById = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const banner = await heroBannerService.getBannerById(id);
  return success(res, 200, banner, 'Hero banner fetched.');
});

const createBanner = asyncHandler(async (req, res) => {
  const banner = await heroBannerService.createBanner(req.file, req.body);
  return success(res, 201, banner, 'Hero banner created successfully.');
});

const updateBanner = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const banner = await heroBannerService.updateBanner(id, req.file, req.body);
  return success(res, 200, banner, 'Hero banner updated successfully.');
});

const deleteBanner = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await heroBannerService.deleteBanner(id);
  return success(res, 200, null, 'Hero banner deleted successfully.');
});

const reorderBanners = asyncHandler(async (req, res) => {
  const { order } = req.body; // [{ id: 1, displayOrder: 0 }, ...]
  const banners = await heroBannerService.reorderBanners(order);
  return success(res, 200, banners, 'Hero banners reordered successfully.');
});

module.exports = {
  getActiveBanners,
  listAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
};
