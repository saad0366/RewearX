'use strict';

const {
  User,
  UserPreferences,
  Address,
  Review,
  ClothingItem,
  ClothingImage,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');

const getProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    include: [
      { model: UserPreferences, as: 'preferences' },
      { model: Address, as: 'addresses' },
    ],
  });
  if (!user) throw ApiError.notFound('User not found.');

  const stats = await getStats(userId);
  return { ...user.toJSON(), stats };
};

const getPublicProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'name', 'profileImage', 'bio', 'gender', 'location', 'address', 'createdAt'],
  });
  if (!user) throw ApiError.notFound('User not found.');

  const stats = await getStats(userId);
  return { ...user.toJSON(), stats };
};

const getStats = async (userId) => {
  const [itemCount, reviewAgg, swapsCompleted] = await Promise.all([
    ClothingItem.count({ where: { userId, isAvailable: true } }),
    Review.findOne({
      where: { revieweeId: userId },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'reviewCount'],
      ],
      raw: true,
    }),
    ClothingItem.count({ where: { userId, isAvailable: false } }),
  ]);

  return {
    activeListings: itemCount,
    completedSwaps: swapsCompleted,
    avgRating: reviewAgg?.avgRating ? Number(parseFloat(reviewAgg.avgRating).toFixed(2)) : null,
    reviewCount: reviewAgg?.reviewCount ? parseInt(reviewAgg.reviewCount, 10) : 0,
  };
};

const updateProfile = async (userId, updates) => {
  const allowed = ['name', 'bio', 'phone', 'gender', 'profileImage', 'dateOfBirth', 'location', 'address'];
  const data = {};
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data[k] = updates[k];
  });

  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('User not found.');
  await user.update(data);
  return user.toJSON();
};

const updatePreferences = async (userId, prefs) => {
  let preferences = await UserPreferences.findOne({ where: { userId } });
  if (!preferences) {
    preferences = await UserPreferences.create({ userId });
  }

  const data = {};
  if (prefs.preferredGender !== undefined) data.preferredGender = prefs.preferredGender;
  if (prefs.preferredCondition !== undefined) data.preferredCondition = prefs.preferredCondition;
  if (prefs.preferredSizes !== undefined) data.preferredSizes = Array.isArray(prefs.preferredSizes) ? JSON.stringify(prefs.preferredSizes) : prefs.preferredSizes;
  if (prefs.preferredColors !== undefined) data.preferredColors = Array.isArray(prefs.preferredColors) ? JSON.stringify(prefs.preferredColors) : prefs.preferredColors;
  if (prefs.preferredStyles !== undefined) data.preferredStyles = Array.isArray(prefs.preferredStyles) ? JSON.stringify(prefs.preferredStyles) : prefs.preferredStyles;
  if (prefs.preferredCategories !== undefined)
    data.preferredCategories = Array.isArray(prefs.preferredCategories) ? JSON.stringify(prefs.preferredCategories) : prefs.preferredCategories;

  await preferences.update(data);
  return parsePreferences(preferences);
};

const getPreferences = async (userId) => {
  const preferences = await UserPreferences.findOne({ where: { userId } });
  if (!preferences) return null;
  return parsePreferences(preferences);
};

const parsePreferences = (preferences) => {
  const json = preferences.toJSON();
  ['preferredSizes', 'preferredColors', 'preferredStyles', 'preferredCategories'].forEach((k) => {
    if (json[k]) {
      try {
        json[k] = typeof json[k] === 'string' ? JSON.parse(json[k]) : json[k];
      } catch (_) {
        json[k] = [];
      }
    } else {
      json[k] = [];
    }
  });
  return json;
};

const getUserItems = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await ClothingItem.findAndCountAll({
    where: { userId },
    include: [{ model: ClothingImage, as: 'images' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { items: rows, count };
};

const addAddress = async (userId, addressData) => {
  if (addressData.isDefault) {
    await Address.update({ isDefault: false }, { where: { userId } });
  }
  return Address.create({ ...addressData, userId });
};

const listAddresses = async (userId) => Address.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });

const deleteAddress = async (addressId, userId) => {
  const addr = await Address.findOne({ where: { id: addressId, userId } });
  if (!addr) throw ApiError.notFound('Address not found.');
  await addr.destroy();
  return true;
};

module.exports = {
  getProfile,
  getPublicProfile,
  getStats,
  updateProfile,
  updatePreferences,
  getPreferences,
  getUserItems,
  addAddress,
  listAddresses,
  deleteAddress,
};
