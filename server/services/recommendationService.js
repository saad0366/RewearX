'use strict';

const { activeOwnerInclude } = require('./publicItemEligibility');

/**
 * Recommendation Service – Node.js-only fallback implementation.
 *
 * The architecture document describes a FastAPI microservice that handles
 * EfficientNet-B0 + DistilBERT + cosine similarity. Since the user requested
 * a Node-only backend, this service implements a content-based ranker driven
 * entirely by tabular fields and (optional) JSON-encoded feature vectors
 * stored in `item_features.image_vector` / `text_vector`.
 *
 * It also exposes a `callFastAPIRecommend` hook that, when the FastAPI URL
 * is reachable, defers to the AI microservice (kept for future integration).
 */

const { Op } = require('sequelize');
const {
  ClothingItem,
  ClothingImage,
  Category,
  User,
  ItemFeatures,
  UserPreferences,
  Recommendation,
  SavedItem,
  SwapRequest,
  sequelize,
} = require('../models');
const env = require('../config/env');
const logger = require('../utils/logger');

const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const safeParseVector = (str) => {
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
};

const parseList = (str) => {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const includeForItem = [
  { model: ClothingImage, as: 'images' },
  { model: Category, as: 'category' },
  activeOwnerInclude(User),
];

const callFastAPIRecommend = async (_userId, _limit) => {
  if (!env.fastapi.url) return null;
  // Stub – future integration. Returning null so the Node fallback is used.
  return null;
};

const generateRecommendations = async (userId, limit = 20) => {
  const remote = await callFastAPIRecommend(userId, limit).catch(() => null);
  if (remote) return remote;

  const [user, prefs, savedItems, recentSwaps, allItems] = await Promise.all([
    User.findByPk(userId),
    UserPreferences.findOne({ where: { userId } }),
    SavedItem.findAll({ where: { userId }, attributes: ['itemId'] }),
    SwapRequest.findAll({
      where: { [Op.or]: [{ senderId: userId }, { receiverId: userId }] },
      attributes: ['senderItemId', 'receiverItemId'],
      limit: 50,
    }),
    ClothingItem.findAll({
      where: {
        isAvailable: true,
        userId: { [Op.ne]: userId },
      },
      include: [
        ...includeForItem,
        { model: ItemFeatures, as: 'features' },
      ],
      limit: 500,
      order: [['createdAt', 'DESC']],
    }),
  ]);

  if (!user) return [];

  const preferredGender = prefs?.preferredGender || 'any';
  const preferredCondition = prefs?.preferredCondition || 'any';
  const preferredSizes = parseList(prefs?.preferredSizes);
  const preferredColors = parseList(prefs?.preferredColors);
  const preferredCategoryIds = parseList(prefs?.preferredCategories).map((v) => Number(v));

  // Build user vector by averaging feature vectors of saved + own swap items
  const interestItemIds = new Set();
  savedItems.forEach((s) => interestItemIds.add(s.itemId));
  recentSwaps.forEach((s) => {
    if (s.senderItemId) interestItemIds.add(s.senderItemId);
    if (s.receiverItemId) interestItemIds.add(s.receiverItemId);
  });

  let userImageVector = null;
  if (interestItemIds.size > 0) {
    const features = await ItemFeatures.findAll({
      where: { itemId: { [Op.in]: Array.from(interestItemIds) } },
    });
    const vectors = features.map((f) => safeParseVector(f.imageVector)).filter(Boolean);
    if (vectors.length) {
      const len = vectors[0].length;
      const avg = new Array(len).fill(0);
      vectors.forEach((v) => v.forEach((val, i) => (avg[i] += val)));
      for (let i = 0; i < len; i++) avg[i] /= vectors.length;
      userImageVector = avg;
    }
  }

  const scored = allItems.map((item) => {
    let score = 0.0;
    const reasons = [];

    if (preferredGender !== 'any' && item.gender === preferredGender) {
      score += 0.15;
      reasons.push(`gender:${preferredGender}`);
    } else if (preferredGender === 'any' || item.gender === 'unisex') {
      score += 0.05;
    }

    if (preferredCondition !== 'any' && item.condition === preferredCondition) {
      score += 0.1;
      reasons.push(`condition:${preferredCondition}`);
    }

    if (preferredSizes.length && preferredSizes.includes(item.size)) {
      score += 0.15;
      reasons.push(`size:${item.size}`);
    }

    if (preferredColors.length && item.color && preferredColors.some((c) => item.color.toLowerCase().includes(String(c).toLowerCase()))) {
      score += 0.1;
      reasons.push(`color:${item.color}`);
    }

    if (preferredCategoryIds.length && preferredCategoryIds.includes(item.categoryId)) {
      score += 0.2;
      reasons.push(`category:${item.category?.name || item.categoryId}`);
    }

    if (userImageVector && item.features?.imageVector) {
      const itemVec = safeParseVector(item.features.imageVector);
      if (itemVec) {
        const sim = cosineSimilarity(userImageVector, itemVec);
        score += sim * 0.4;
        if (sim > 0.4) reasons.push(`visual_similarity:${sim.toFixed(2)}`);
      }
    }

    // Freshness boost
    const daysOld = (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) score += 0.05;

    // Slight popularity boost
    if (item.viewCount > 10) score += Math.min(0.05, item.viewCount / 1000);

    return {
      item,
      score: Math.max(0, Math.min(1, score)),
      reason: reasons.slice(0, 3).join(', ') || 'general_match',
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};

const getRecommendations = async (userId, limit = 20, refresh = false) => {
  const recent = await Recommendation.findAll({
    where: {
      userId,
      generatedAt: { [Op.gt]: new Date(Date.now() - 60 * 60 * 1000) }, // 1h cache
    },
    order: [['score', 'DESC']],
    limit,
    include: [
      {
        model: ClothingItem,
        as: 'item',
        include: includeForItem,
        where: { isAvailable: true },
        required: true,
      },
    ],
  });

  if (recent.length >= Math.min(5, limit) && !refresh) {
    return recent.map((r) => ({
      item: r.item,
      score: parseFloat(r.score),
      reason: r.reason,
    }));
  }

  const fresh = await generateRecommendations(userId, limit);

  // Persist
  try {
    await sequelize.transaction(async (t) => {
      await Recommendation.destroy({ where: { userId }, transaction: t });
      if (fresh.length) {
        await Recommendation.bulkCreate(
          fresh.map((r) => ({
            userId,
            itemId: r.item.id,
            score: r.score,
            reason: r.reason,
            generatedAt: new Date(),
          })),
          { transaction: t, ignoreDuplicates: true }
        );
      }
    });
  } catch (err) {
    logger.warn(`Recommendation cache persist failed: ${err.message}`);
  }

  return fresh;
};

module.exports = { getRecommendations, generateRecommendations, callFastAPIRecommend };
