'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Recommendation = sequelize.define(
    'Recommendation',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      itemId: { type: DataTypes.INTEGER, allowNull: false, field: 'item_id' },
      score: { type: DataTypes.DECIMAL(8, 6), allowNull: false, defaultValue: 0 },
      reason: { type: DataTypes.STRING(255), allowNull: true },
      generatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'generated_at',
      },
    },
    {
      tableName: 'recommendations',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['item_id'] },
        { fields: ['user_id', 'score'] },
        { unique: true, fields: ['user_id', 'item_id'] },
      ],
    }
  );

  Recommendation.associate = (models) => {
    Recommendation.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Recommendation.belongsTo(models.ClothingItem, { foreignKey: 'itemId', as: 'item' });
  };

  return Recommendation;
};
