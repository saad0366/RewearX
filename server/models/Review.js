'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Review = sequelize.define(
    'Review',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      reviewerId: { type: DataTypes.INTEGER, allowNull: false, field: 'reviewer_id' },
      revieweeId: { type: DataTypes.INTEGER, allowNull: false, field: 'reviewee_id' },
      swapRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'swap_request_id',
      },
      rating: {
        type: DataTypes.TINYINT,
        allowNull: false,
        validate: { min: 1, max: 5 },
      },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'reviews',
      indexes: [
        { fields: ['reviewer_id'] },
        { fields: ['reviewee_id'] },
        { fields: ['swap_request_id'] },
        { unique: true, fields: ['reviewer_id', 'swap_request_id'] },
      ],
    }
  );

  Review.associate = (models) => {
    Review.belongsTo(models.User, { foreignKey: 'reviewerId', as: 'reviewer' });
    Review.belongsTo(models.User, { foreignKey: 'revieweeId', as: 'reviewee' });
    Review.belongsTo(models.SwapRequest, {
      foreignKey: 'swapRequestId',
      as: 'swapRequest',
    });
  };

  return Review;
};
