'use strict';

const { HeroBanner } = require('../models');
const { uploadImage, deleteImage } = require('./cloudinaryService');
const ApiError = require('../utils/ApiError');
const { Op } = require('sequelize');

const getActiveBanners = async () => {
  return await HeroBanner.findAll({
    where: { isActive: true },
    order: [['displayOrder', 'ASC'], ['createdAt', 'ASC']],
    attributes: ['id', 'imageUrl', 'title', 'subtitle', 'displayOrder'],
  });
};

const listAllBanners = async (page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await HeroBanner.findAndCountAll({
    order: [['displayOrder', 'ASC'], ['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { items: rows, count };
};

const getBannerById = async (id) => {
  const banner = await HeroBanner.findByPk(id);
  if (!banner) throw ApiError.notFound('Hero banner not found.');
  return banner;
};

const createBanner = async (file, data) => {
  if (!file) throw ApiError.badRequest('Image file is required.');

  const uploaded = await uploadImage(file, 'hero-banners');

  const banner = await HeroBanner.create({
    imageUrl: uploaded.url,
    cloudinaryPublicId: uploaded.publicId,
    title: data.title || null,
    subtitle: data.subtitle || null,
    displayOrder: data.displayOrder || 0,
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  return banner;
};

const updateBanner = async (id, file, data) => {
  const banner = await getBannerById(id);

  if (file) {
    // Delete old image
    if (banner.cloudinaryPublicId) {
      await deleteImage(banner.cloudinaryPublicId);
    }

    // Upload new image
    const uploaded = await uploadImage(file, 'hero-banners');
    banner.imageUrl = uploaded.url;
    banner.cloudinaryPublicId = uploaded.publicId;
  }

  if (data.title !== undefined) banner.title = data.title;
  if (data.subtitle !== undefined) banner.subtitle = data.subtitle;
  if (data.displayOrder !== undefined) banner.displayOrder = data.displayOrder;
  if (data.isActive !== undefined) banner.isActive = data.isActive;

  await banner.save();
  return banner;
};

const deleteBanner = async (id) => {
  const banner = await getBannerById(id);

  // Delete from Cloudinary
  if (banner.cloudinaryPublicId) {
    await deleteImage(banner.cloudinaryPublicId);
  }

  await banner.destroy();
  return banner;
};

const reorderBanners = async (orderArray) => {
  // orderArray: [{ id: 1, displayOrder: 0 }, { id: 2, displayOrder: 1 }]
  const promises = orderArray.map(({ id, displayOrder }) =>
    HeroBanner.update({ displayOrder }, { where: { id } })
  );
  await Promise.all(promises);
  return await getActiveBanners();
};

module.exports = {
  getActiveBanners,
  listAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
};
