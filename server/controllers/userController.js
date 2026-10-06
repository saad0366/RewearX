'use strict';

const userService = require('../services/userService');
const reviewService = require('../services/reviewService');
const cloudinaryService = require('../services/cloudinaryService');
const { success, paginated, asyncHandler, buildPagination } = require('../utils/response');

const getMe = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return success(res, 200, profile, 'Profile fetched.');
});

const updateMe = asyncHandler(async (req, res) => {
  const updated = await userService.updateProfile(req.user.id, req.body);
  return success(res, 200, updated, 'Profile updated.');
});

const uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  const uploaded = await cloudinaryService.uploadImage(req.file, 'rewearx/profiles');
  const updated = await userService.updateProfile(req.user.id, { profileImage: uploaded.url });
  return success(res, 200, updated, 'Profile image updated.');
});

const getById = asyncHandler(async (req, res) => {
  const profile = await userService.getPublicProfile(parseInt(req.params.id, 10));
  return success(res, 200, profile, 'User profile fetched.');
});

const getMyPreferences = asyncHandler(async (req, res) => {
  const prefs = await userService.getPreferences(req.user.id);
  return success(res, 200, prefs, 'Preferences fetched.');
});

const updateMyPreferences = asyncHandler(async (req, res) => {
  const prefs = await userService.updatePreferences(req.user.id, req.body);
  return success(res, 200, prefs, 'Preferences updated.');
});

const getUserReviews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await reviewService.getUserReviews(parseInt(req.params.id, 10), page, limit);
  return paginated(
    res,
    200,
    result.items,
    { ...buildPagination(result.count, page, limit), aggregate: result.aggregate },
    'Reviews fetched.'
  );
});

// Address
const listAddresses = asyncHandler(async (req, res) => {
  const list = await userService.listAddresses(req.user.id);
  return success(res, 200, list, 'Addresses fetched.');
});

const addAddress = asyncHandler(async (req, res) => {
  const addr = await userService.addAddress(req.user.id, req.body);
  return success(res, 201, addr, 'Address added.');
});

const deleteAddress = asyncHandler(async (req, res) => {
  await userService.deleteAddress(parseInt(req.params.id, 10), req.user.id);
  return success(res, 200, null, 'Address deleted.');
});

module.exports = {
  getMe,
  updateMe,
  uploadProfileImage,
  getById,
  getMyPreferences,
  updateMyPreferences,
  getUserReviews,
  listAddresses,
  addAddress,
  deleteAddress,
};
