'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ClothingImage = sequelize.define(
    'ClothingImage',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      itemId: { type: DataTypes.INTEGER, allowNull: false, field: 'item_id' },
      url: { type: DataTypes.STRING(500), allowNull: false },
      publicId: { type: DataTypes.STRING(255), allowNull: true, field: 'public_id' },
      isPrimary: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_primary' },
      orderIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'order_index' },
    },
    {
      tableName: 'clothing_images',
      indexes: [{ fields: ['item_id'] }, { fields: ['is_primary'] }],
    }
  );

  ClothingImage.associate = (models) => {
    ClothingImage.belongsTo(models.ClothingItem, { foreignKey: 'itemId', as: 'item' });
  };

  return ClothingImage;
};
