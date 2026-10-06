'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SavedItem = sequelize.define(
    'SavedItem',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      itemId: { type: DataTypes.INTEGER, allowNull: false, field: 'item_id' },
    },
    {
      tableName: 'saved_items',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['item_id'] },
        { unique: true, fields: ['user_id', 'item_id'] },
      ],
    }
  );

  SavedItem.associate = (models) => {
    SavedItem.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SavedItem.belongsTo(models.ClothingItem, { foreignKey: 'itemId', as: 'item' });
  };

  return SavedItem;
};
