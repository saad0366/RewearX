'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserPreferences = sequelize.define(
    'UserPreferences',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        field: 'user_id',
      },
      preferredGender: {
        type: DataTypes.ENUM('male', 'female', 'unisex', 'any'),
        defaultValue: 'any',
        field: 'preferred_gender',
      },
      preferredSizes: { type: DataTypes.TEXT, allowNull: true, field: 'preferred_sizes' },
      preferredColors: { type: DataTypes.TEXT, allowNull: true, field: 'preferred_colors' },
      preferredStyles: { type: DataTypes.TEXT, allowNull: true, field: 'preferred_styles' },
      preferredCondition: {
        type: DataTypes.ENUM('new', 'like_new', 'good', 'fair', 'any'),
        defaultValue: 'any',
        field: 'preferred_condition',
      },
      preferredCategories: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'preferred_categories',
      },
    },
    { tableName: 'user_preferences', indexes: [{ fields: ['user_id'], unique: true }] }
  );

  UserPreferences.associate = (models) => {
    UserPreferences.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return UserPreferences;
};
