'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define(
    'Report',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      reporterId: { type: DataTypes.INTEGER, allowNull: false, field: 'reporter_id' },
      reportedUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'reported_user_id',
      },
      reportedItemId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'reported_item_id',
      },
      reason: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'reviewed', 'resolved'),
        defaultValue: 'pending',
      },
      adminNotes: { type: DataTypes.TEXT, allowNull: true, field: 'admin_notes' },
      resolvedById: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'resolved_by_id',
      },
      resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    },
    {
      tableName: 'reports',
      indexes: [
        { fields: ['reporter_id'] },
        { fields: ['reported_user_id'] },
        { fields: ['reported_item_id'] },
        { fields: ['status'] },
      ],
    }
  );

  Report.associate = (models) => {
    Report.belongsTo(models.User, { foreignKey: 'reporterId', as: 'reporter' });
    Report.belongsTo(models.User, { foreignKey: 'reportedUserId', as: 'reportedUser' });
    Report.belongsTo(models.ClothingItem, {
      foreignKey: 'reportedItemId',
      as: 'reportedItem',
    });
    Report.belongsTo(models.User, { foreignKey: 'resolvedById', as: 'resolvedBy' });
  };

  return Report;
};
