'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SwapperOfWeek = sequelize.define(
    'SwapperOfWeek',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },
      rank: { type: DataTypes.INTEGER, allowNull: false },
      totalSwaps: { type: DataTypes.INTEGER, allowNull: false, field: 'total_swaps' },
      weekStartDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'week_start_date' },
      weekEndDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'week_end_date' },
    },
    {
      tableName: 'swapper_of_week',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['rank'] },
        { fields: ['week_start_date'] },
      ],
    }
  );

  SwapperOfWeek.associate = (models) => {
    SwapperOfWeek.belongsTo(models.User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
  };

  return SwapperOfWeek;
};
