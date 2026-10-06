'use strict';

const {
  SavedItem,
  ClothingItem,
  ClothingImage,
  Category,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');

const saveItem = async (userId, itemId) => {
  const item = await ClothingItem.findByPk(itemId);
  if (!item) throw ApiError.notFound('Item not found.');
  if (item.userId === userId) {
    throw ApiError.badRequest('You cannot save your own item.');
  }

  const [saved, created] = await SavedItem.findOrCreate({
    where: { userId, itemId },
    defaults: { userId, itemId },
  });
  return { saved, created };
};

const unsaveItem = async (userId, itemId) => {
  const count = await SavedItem.destroy({ where: { userId, itemId } });
  if (!count) throw ApiError.notFound('Saved item not found.');
  return true;
};

const listSaved = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  const { rows, count } = await SavedItem.findAndCountAll({
    where: { userId },
    include: [
      {
        model: ClothingItem,
        as: 'item',
        include: [
          { model: ClothingImage, as: 'images' },
          { model: Category, as: 'category' },
          { model: User, as: 'owner', attributes: ['id', 'name', 'profileImage'] },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  return { items: rows.map((r) => r.item).filter(Boolean), count };
};

module.exports = { saveItem, unsaveItem, listSaved };
