'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ClothingItem = sequelize.define(
    'ClothingItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      categoryId: { type: DataTypes.INTEGER, allowNull: false, field: 'category_id' },
      title: { type: DataTypes.STRING(150), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      brand: { type: DataTypes.STRING(100), allowNull: true },
      size: { type: DataTypes.STRING(50), allowNull: false },
      gender: { type: DataTypes.ENUM('male', 'female', 'unisex'), allowNull: false },
      condition: {
        type: DataTypes.ENUM('new', 'like_new', 'good', 'fair'),
        allowNull: false,
      },
      color: { type: DataTypes.STRING(255), allowNull: true },
      location: { type: DataTypes.STRING(150), allowNull: true, defaultValue: 'Islamabad' },
      isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_available' },
      viewCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'view_count' },
    },
    {
      tableName: 'clothing_items',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['category_id'] },
        { fields: ['is_available'] },
        { fields: ['gender'] },
        { fields: ['condition'] },
        { fields: ['location'] },
      ],
    }
  );

  ClothingItem.associate = (models) => {
    ClothingItem.belongsTo(models.User, { foreignKey: 'userId', as: 'owner' });
    ClothingItem.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'category' });
    ClothingItem.hasMany(models.ClothingImage, {
      foreignKey: 'itemId',
      as: 'images',
      onDelete: 'CASCADE',
    });
    ClothingItem.hasOne(models.ItemFeatures, {
      foreignKey: 'itemId',
      as: 'features',
      onDelete: 'CASCADE',
    });
    ClothingItem.hasMany(models.SwapRequest, {
      foreignKey: 'senderItemId',
      as: 'offeredInSwaps',
    });
    ClothingItem.hasMany(models.SwapRequest, {
      foreignKey: 'receiverItemId',
      as: 'requestedInSwaps',
    });
    ClothingItem.belongsToMany(models.User, {
      through: models.SavedItem,
      foreignKey: 'itemId',
      otherKey: 'userId',
      as: 'savedByUsers',
    });
    ClothingItem.hasMany(models.Report, { foreignKey: 'reportedItemId', as: 'reports' });
  };

  return ClothingItem;
};
