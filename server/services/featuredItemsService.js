'use strict';

const { activeOwnerInclude } = require('./publicItemEligibility');

const { ClothingItem, User, ClothingImage, Category, sequelize } = require('../models');

/**
 * Get 4 random featured items for homepage
 */
const getFeaturedItems = async () => {
  try {
    // Get 4 random available items using SQL ORDER BY RAND()
    const items = await ClothingItem.findAll({
      where: {
        isAvailable: true,
      },
      include: [
        activeOwnerInclude(User),
        {
          model: ClothingImage,
          as: 'images',
          attributes: ['url', 'isPrimary', 'orderIndex'],
          order: [['isPrimary', 'DESC'], ['orderIndex', 'ASC']],
        },
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name'],
        },
      ],
      order: sequelize.random(), // Random order
      limit: 4,
    });

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category?.name || 'Uncategorized',
      size: item.size,
      gender: item.gender,
      condition: item.condition,
      color: item.color,
      brand: item.brand,
      owner: item.owner?.name || 'Unknown',
      ownerId: item.owner?.id,
      ownerImage: item.owner?.profileImage,
      images: item.images?.map((img) => img.url) || [],
      createdAt: item.createdAt,
    }));
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getFeaturedItems,
};
