'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserInterests = sequelize.define(
    'UserInterests',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      categoryId: { type: DataTypes.INTEGER, allowNull: false, field: 'category_id' },
    },
    {
      tableName: 'user_interests',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['category_id'] },
        { unique: true, fields: ['user_id', 'category_id'] },
      ],
    }
  );

  return UserInterests;
};
