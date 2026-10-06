'use strict';

const { activeOwnerInclude } = require('./publicItemEligibility');

const { Op } = require('sequelize');
const {
  ClothingItem,
  ClothingImage,
  ItemFeatures,
  Category,
  User,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');
const cloudinaryService = require('./cloudinaryService');
const { generateAndStoreItemEmbedding } = require('./nlpSearchService');
const { configured, prepareConfirmedStorage } = require('./listingAttributeService');
const logger = require('../utils/logger');
const { sleeveApplicable } = require('./clothingApplicability');
const { parseConfirmedAttributes } = require('./listingAttributeService');
const { confirmFeedback, invalidateFeedback } = require('./imageLearningFeedback');

const includeOwnerAndImages = [
  {
    model: User,
    as: 'owner',
    attributes: ['id', 'name', 'profileImage'],
  },
  { model: Category, as: 'category' },
  { model: ClothingImage, as: 'images', separate: true, order: [['orderIndex', 'ASC']] },
];

const applicableAttributes = async (value,categoryId) => {
  const parsed=parseConfirmedAttributes(value);
  // Legacy manual payloads must not require unavailable extra-attribute storage.
  if(parsed===undefined && !configured())return undefined;
  const category=Category.findByPk ? await Category.findByPk(categoryId) : null;
  return !sleeveApplicable(category) ? {...parsed,sleeve_length:null} : parsed;
};

const createItem = async (userId, itemData, files = []) => {
  // Reject unavailable extra storage before uploads or writes; legacy payloads are unchanged.
  const confirmation = await prepareConfirmedStorage(await applicableAttributes(itemData.confirmedAttributes,itemData.categoryId), userId, itemData.color);
  let predictionStorage;
  if (configured() && files[0]) {
    try { const ai=require('./imageAiService'); predictionStorage=ai.buildPredictionStorage(await ai.extractImageFeatures(files[0])); }
    catch (_) { logger.warn('Listing image prediction unavailable; confirmed/manual values remain authoritative.'); }
  }
  return sequelize.transaction(async (t) => {
    const item = await ClothingItem.create(
      {
        userId,
        categoryId: itemData.categoryId,
        title: itemData.title,
        description: itemData.description || null,
        brand: itemData.brand || null,
        size: itemData.size,
        gender: itemData.gender,
        condition: itemData.condition,
        color: itemData.color || null,
        location: itemData.location || 'Islamabad',
      },
      { transaction: t }
    );

    if (files && files.length > 0) {
      const uploaded = await cloudinaryService.uploadMultiple(files);
      const imageRecords = uploaded.map((u, idx) => ({
        itemId: item.id,
        url: u.url,
        publicId: u.publicId,
        isPrimary: idx === 0,
        orderIndex: idx,
      }));
      await ClothingImage.bulkCreate(imageRecords, { transaction: t });
    }

    await ItemFeatures.create({ itemId: item.id, ...(predictionStorage||{}), ...((confirmation||predictionStorage) ? {imagePredictions:{...predictionStorage?.imagePredictions,...confirmation}} : {}) }, { transaction: t });
    await confirmFeedback(item.id, itemData, t);
    return item;
  }).then(async (item) => {
    const fullItem = await getItemById(item.id);
    // Fire-and-forget: generate MiniLM embedding and store in item_features.text_vector
    generateAndStoreItemEmbedding(fullItem).catch((e) =>
      logger.warn(`[ITEM] Embedding generation skipped for new item ${fullItem.id}: ${e.message}`)
    );
    return fullItem;
  });
};

const getItemById = async (itemId) => {
  const item = await ClothingItem.findByPk(itemId, { include: includeOwnerAndImages });
  if (!item) throw ApiError.notFound('Item not found.');
  if (configured()) {
    const features = await ItemFeatures.findOne({ where: { itemId }, attributes: ['imagePredictions'] });
    item.setDataValue('confirmedAttributes', features?.imagePredictions?.confirmed_attributes || null);
    item.setDataValue('confirmedColors', features?.imagePredictions?.confirmed_colors || null);
    item.setDataValue('trainingConsent', features?.imagePredictions?.learning_feedback?.training_consent === true);
  }
  return item;
};

const incrementView = async (itemId) => {
  await ClothingItem.increment('viewCount', { where: { id: itemId } });
};

const updateItem = async (itemId, userId, updates) => {
  const item = await ClothingItem.findByPk(itemId);
  if (!item) throw ApiError.notFound('Item not found.');
  if (item.userId !== userId) throw ApiError.forbidden('You do not own this item.');

  const confirmation = await prepareConfirmedStorage(await applicableAttributes(updates.confirmedAttributes,updates.categoryId ?? item.categoryId), userId, updates.color);
  const allowed = [
    'title',
    'description',
    'categoryId',
    'size',
    'gender',
    'condition',
    'color',
    'brand',
    'location',
    'isAvailable',
  ];
  const data = {};
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data[k] = updates[k];
  });
  if (confirmation || updates.reviewConfirmed !== undefined || updates.trainingConsent !== undefined) {
    await sequelize.transaction(async (t) => {
      // Serialize confirmation/withdrawal with publication's final eligibility check.
      await ClothingItem.findByPk(itemId, {transaction:t, ...(t.LOCK ? {lock:t.LOCK.UPDATE}: {})});
      await item.update(data, { transaction: t });
      const features = await ItemFeatures.findOne({ where: { itemId }, transaction: t });
      const stored = features?.imagePredictions || {};
      await ItemFeatures.upsert({ itemId, imagePredictions: { ...stored, ...confirmation, confirmed_attributes: { ...stored.confirmed_attributes, ...confirmation?.confirmed_attributes } } }, { transaction: t });
      if (Object.keys(data).length || confirmation) await invalidateFeedback(itemId, t);
      await confirmFeedback(itemId, updates, t);
    });
  } else {
    await item.update(data);
    if (Object.keys(data).length) await invalidateFeedback(itemId);
  }
  const updatedItem = await getItemById(itemId);
  // Fire-and-forget: regenerate embedding when semantic fields change
  const semanticFields = ['title', 'description', 'categoryId', 'brand', 'gender', 'color', 'condition'];
  const semanticChanged = semanticFields.some((f) => data[f] !== undefined);
  if (semanticChanged) {
    generateAndStoreItemEmbedding(updatedItem).catch((e) =>
      logger.warn(`[ITEM] Embedding regeneration skipped for item ${itemId}: ${e.message}`)
    );
  }
  return updatedItem;
};

const deleteItem = async (itemId, userId) => {
  const item = await ClothingItem.findByPk(itemId, {
    include: [{ model: ClothingImage, as: 'images' }],
  });
  if (!item) throw ApiError.notFound('Item not found.');
  if (item.userId !== userId) throw ApiError.forbidden('You do not own this item.');

  // Soft delete via flag - set unavailable; physical delete cascades images if forced
  await item.update({ isAvailable: false });
  await invalidateFeedback(itemId);

  // Optionally also delete cloudinary assets:
  if (item.images && item.images.length > 0) {
    await Promise.all(
      item.images.map((img) =>
        img.publicId ? cloudinaryService.deleteImage(img.publicId) : Promise.resolve()
      )
    );
  }
  return true;
};

const listItems = async (filters = {}, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const where = { isAvailable: true };

  if (filters.categoryId) {
    const catId = parseInt(filters.categoryId, 10);
    if (!isNaN(catId)) {
      const subcats = await Category.findAll({ where: { parentId: catId }, attributes: ['id'] });
      if (subcats.length > 0) {
        where.categoryId = { [Op.in]: [catId, ...subcats.map((s) => s.id)] };
      } else {
        where.categoryId = catId;
      }
    }
  }
  if (filters.gender) where.gender = filters.gender;
  if (filters.condition) where.condition = filters.condition;
  if (filters.size) where.size = filters.size;
  if (filters.color) where.color = { [Op.like]: `%${filters.color}%` };
  if (filters.brand) where.brand = { [Op.like]: `%${filters.brand}%` };
  if (filters.location) where.location = { [Op.like]: `%${filters.location}%` };
  if (filters.userId) where.userId = filters.userId;

  if (filters.q) {
    where[Op.or] = [
      { title: { [Op.like]: `%${filters.q}%` } },
      { description: { [Op.like]: `%${filters.q}%` } },
      { brand: { [Op.like]: `%${filters.q}%` } },
      { location: { [Op.like]: `%${filters.q}%` } },
    ];
  }
  if (filters.excludeUserId) {
    where.userId = { [Op.ne]: filters.excludeUserId };
  }

  const { rows, count } = await ClothingItem.findAndCountAll({
    where,
    include: includeOwnerAndImages.map(include => include.as === 'owner' ? activeOwnerInclude(User) : include),
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  return { items: rows, count };
};

const getUserItems = async (ownerId, page = 1, limit = 20) =>
  listItems({ userId: ownerId }, page, limit);

const addImages = async (itemId, userId, files) => {
  const item = await ClothingItem.findByPk(itemId, {
    include: [{ model: ClothingImage, as: 'images' }],
  });
  if (!item) throw ApiError.notFound('Item not found.');
  if (item.userId !== userId) throw ApiError.forbidden('You do not own this item.');

  if (!files || files.length === 0) {
    throw ApiError.badRequest('No files uploaded.');
  }
  const existingCount = item.images?.length || 0;
  const max = require('../config/env').upload.maxImagesPerItem;
  if (existingCount + files.length > max) {
    throw ApiError.badRequest(`Maximum ${max} images per item.`);
  }

  const uploaded = await cloudinaryService.uploadMultiple(files);
  const records = uploaded.map((u, idx) => ({
    itemId,
    url: u.url,
    publicId: u.publicId,
    isPrimary: existingCount === 0 && idx === 0,
    orderIndex: existingCount + idx,
  }));
  await ClothingImage.bulkCreate(records);
  await invalidateFeedback(itemId);
  return getItemById(itemId);
};

const deleteImage = async (itemId, imageId, userId) => sequelize.transaction(async t => {
  const item = await ClothingItem.findByPk(itemId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!item) throw ApiError.notFound('Item not found.');
  if (item.userId !== userId) throw ApiError.forbidden('Not allowed.');
  const image = await ClothingImage.findOne({ where: { id: imageId, itemId }, transaction: t });
  if (!image) throw ApiError.notFound('Image not found.');
  if (image.publicId) await cloudinaryService.deleteImage(image.publicId, { throwOnFailure: true });
  await image.destroy({ transaction: t });
  if (image.isPrimary) {
    const next = await ClothingImage.findOne({ where: { itemId }, order: [['orderIndex', 'ASC']], transaction: t });
    if (next) await next.update({ isPrimary: true }, { transaction: t });
  }
  await invalidateFeedback(itemId, t);
  return true;
});

const setPrimaryImage = async (itemId, imageId, userId) => {
  await sequelize.transaction(async t => {
    const item = await ClothingItem.findByPk(itemId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!item) throw ApiError.notFound('Item not found.');
    if (item.userId !== userId) throw ApiError.forbidden('Not allowed.');
    // Validate ownership and target before clearing the current primary flag.
    const image = await ClothingImage.findOne({ where: { id: imageId, itemId }, transaction: t });
    if (!image) throw ApiError.notFound('Image not found.');
    await ClothingImage.update({ isPrimary: false }, { where: { itemId }, transaction: t });
    await ClothingImage.update({ isPrimary: true }, { where: { id: imageId, itemId }, transaction: t });
    await invalidateFeedback(itemId, t);
  });
  return getItemById(itemId);
};

module.exports = {
  createItem,
  getItemById,
  incrementView,
  updateItem,
  deleteItem,
  listItems,
  getUserItems,
  addImages,
  deleteImage,
  setPrimaryImage,
};
